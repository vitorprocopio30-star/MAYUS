// src/lib/agent/kernel/executor.ts
//
// Módulo de Execução Segura (Executor)
// Responsabilidade: Validar autorização e executar skills de forma controlada.
//
// REGRAS ABSOLUTAS:
// - NUNCA confia no output do router como fonte de autorização
// - Busca a skill diretamente no banco a cada execução
// - Skills com requires_human_confirmation = true retornam 'awaiting_approval' — jamais executam
// - Toda ação que altera estado gera registro em agent_audit_logs
// - Se o audit log falhar, a execução é abortada por segurança
// - PII no banco sempre sanitizado (approvalContext usa safeEntities)
// - PII na UI do aprovador preservado (awaitingPayload usa rawEntities)
// - idempotency_key gerado ANTES de qualquer chamada externa

import { sanitizeText, type RouterIntent } from './router';
import crypto from 'crypto';
import { checkTenantLimits } from './limits';
import { fetchAgentSkillByName } from '@/lib/agent/capabilities/registry';
import { toCanonicalAccessRole } from '@/lib/permissions';
import { createAgentAuditLog } from '@/lib/agent/audit';
import { isBillingCapability, normalizeBillingEntities } from '@/lib/agent/capabilities/billing-normalization';

// ─── Cliente Supabase (singleton no módulo) ───────────────────────────────────

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | 'success'
  | 'failed'
  | 'awaiting_approval'
  | 'permission_denied'
  | 'skill_not_found'
  | 'channel_not_allowed'
  | 'low_confidence'
  | 'fallback_triggered'
  | 'limit_exceeded';

export interface ExecutorContext {
  userId: string;
  tenantId: string;
  userRole: string;     // Role real do usuário, validado via Supabase Auth — não vem do LLM
  channel: 'chat' | 'whatsapp' | 'background_job';
}

export interface ExecutorResult {
  status: ExecutionStatus;
  message: string;           // Texto plano — formatação é responsabilidade do orquestrador
  skillName?: string;
  auditLogId?: string;
  awaitingPayload?: object;  // Payload para UI do aprovador (contém dados reais, não persiste)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Gera uma chave de idempotência criptograficamente única.
 * Criada ANTES de qualquer chamada externa para garantir que
 * tentativas repetidas da mesma operação não dupliquem efeitos.
 */
function generateIdempotencyKey(tenantId: string, userId: string, intent: string): string {
  const raw = `${tenantId}:${userId}:${intent}:${Date.now()}:${crypto.randomUUID()}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Sanitiza os valores de entidades para persistência no banco.
 * Remove PII (CPF, CNPJ, e-mail, telefone) antes de gravar em audit logs.
 *
 * NÃO usar para a UI do aprovador — o aprovador precisa ver os dados reais
 * para tomar uma decisão informada. (Purpose Limitation — LGPD Art. 6º, III)
 */
function sanitizeEntities(entities: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entities).map(([key, value]) => [key, sanitizeText(value)])
  );
}

function isChannelAllowed(channel: string, allowedChannels: string[] | null | undefined): boolean {
  const channels = allowedChannels ?? [];
  return channels.length === 0 || channels.includes(channel);
}

function isRoleAllowed(userRole: string, allowedRoles: string[] | null | undefined): boolean {
  const roles = allowedRoles ?? [];
  if (roles.length === 0) return true;

  const canonicalUserRole = toCanonicalAccessRole(userRole);
  return roles.some((role) => toCanonicalAccessRole(role) === canonicalUserRole);
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

async function writeAuditLog(params: {
  tenantId: string;
  userId: string;
  skillInvoked: string;
  intentionRaw: string;
  payloadExecuted?: object;
  status: 'skill_executed' | 'skill_blocked' | 'awaiting_approval' | 'fallback_triggered';
  idempotencyKey: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalContext?: object;
  pendingExecutionPayload?: object; // Payload real para execução pós-aprovação (rawEntities)
  idempotencyExpiresAt?: string;    // Expiry explícito — default do banco é now() + 24h
}): Promise<string | undefined> {
  const { id, error } = await createAgentAuditLog(params);

  if (error) {
    console.error('[Executor] Falha ao gravar audit log:', error);
    return undefined;
  }
  return id;
}

// ─── Função Principal ─────────────────────────────────────────────────────────

/**
 * Executa uma skill de forma segura.
 *
 * Fluxo:
 * 1. Valida confiança do router (< 0.6 → low_confidence)
 * 2. Busca a skill no banco (fonte de autoridade — não o router)
 * 3. Valida canal permitido
 * 4. Valida role do usuário contra allowed_roles
 * 5. Gera idempotency_key
 * 6. Se requires_human_confirmation:
 *    → approvalContext (banco) usa safeEntities (sem PII)
 *    → awaitingPayload (UI do aprovador) usa rawEntities (dados reais)
 *    → retorna awaiting_approval, NÃO executa
 * 7. Grava audit log — se falhar, aborta por segurança
 * 8. Retorna resultado para o orquestrador despachar
 */
export async function execute(
  routerResult: RouterIntent,
  context: ExecutorContext
): Promise<ExecutorResult> {

  // 1. Confiança insuficiente → sinaliza para o fallback
  if (routerResult.confidence < 0.6 || routerResult.intent === 'unknown') {
    return {
      status: 'low_confidence',
      message: 'Intencao nao identificada com seguranca suficiente. Redirecionando para suporte humano.',
    };
  }

  // 2. Busca a skill no banco — FONTE DE AUTORIDADE
  const skill = await fetchAgentSkillByName({
    tenantId: context.tenantId,
    name: routerResult.intent,
  });

  if (!skill || !skill.is_active) {
    return {
      status: 'skill_not_found',
      message: `A skill "${routerResult.intent}" nao esta disponivel para este escritorio.`,
    };
  }

  // 3. Valida canal permitido (com fallback defensivo para null)
  if (!isChannelAllowed(context.channel, skill.allowed_channels)) {
    return {
      status: 'channel_not_allowed',
      message: `Esta acao nao pode ser realizada pelo canal "${context.channel}".`,
    };
  }

  // 4. Valida role do usuário contra allowed_roles (com fallback defensivo para null)
  if (!isRoleAllowed(context.userRole, skill.allowed_roles)) {
    return {
      status: 'permission_denied',
      message: `Perfil "${context.userRole}" nao tem permissao para executar "${skill.name}".`,
    };
  }

  // Validação de Limites de Plano/Tenant
  const limitCheck = await checkTenantLimits(context.tenantId, skill.name);
  if (!limitCheck.allowed) {
    return {
      status: 'limit_exceeded',
      message: limitCheck.reason ?? 'Limite de plano bloqueou a execução.',
    };
  }

  // 5. Gera idempotency_key antes de qualquer ação externa
  const normalizedRouterResult = { ...routerResult };
  if (isBillingCapability(skill.name, skill.handler_type)) {
    const normalizedBilling = normalizeBillingEntities(routerResult.entities);
    if (normalizedBilling.errors.length > 0) {
      return {
        status: 'failed',
        message: normalizedBilling.errors[0],
      };
    }
    normalizedRouterResult.entities = normalizedBilling.entities;
  }

  const idempotencyKey = generateIdempotencyKey(
    context.tenantId,
    context.userId,
    normalizedRouterResult.intent
  );

  // 6. Se requer confirmação humana
  if (skill.requires_human_confirmation) {
    // banco: entidades sanitizadas (sem PII)
    const safeEntities = sanitizeEntities(normalizedRouterResult.entities);
    // UI: entidades reais para decisão informada do aprovador (não persiste)
    const rawEntities = normalizedRouterResult.entities;

    const auditLogId = await writeAuditLog({
      tenantId: context.tenantId,
      userId: context.userId,
      skillInvoked: skill.name,
      intentionRaw: normalizedRouterResult.safeText,
      status: 'awaiting_approval',
      idempotencyKey,
      approvalStatus: 'pending',
      approvalContext: {
        risk_level: skill.risk_level,
        entities: safeEntities,              // PII removida — seguro para banco
        requested_at: new Date().toISOString(),
      },
      pendingExecutionPayload: {
        entities: rawEntities,               // Dados reais — necessários para execução pós-aprovação
        idempotencyKey,
        skillName: skill.name,
        schemaVersion: skill.schema_version,
      },
      idempotencyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    if (!auditLogId) {
      return {
        status: 'failed',
        message: 'Falha critica no sistema de auditoria. Acao abortada por seguranca.',
      };
    }

    return {
      status: 'awaiting_approval',
      message: `Acao de risco "${skill.risk_level}" requer aprovacao de um responsavel: ${skill.description}`,
      skillName: skill.name,
      auditLogId,
      awaitingPayload: {
        idempotencyKey,
        entities: rawEntities,               // Dados reais — aprovador precisa ver para decidir
        skillName: skill.name,
        riskLevel: skill.risk_level,         // Badge colorido no ApprovalCard (low/medium/high/critical)
        schemaVersion: skill.schema_version,
      },
    };
  }

  // 7. Skill autorizada — grava audit log antes de retornar ao orquestrador
  const auditLogId = await writeAuditLog({
    tenantId: context.tenantId,
    userId: context.userId,
    skillInvoked: skill.name,
    intentionRaw: normalizedRouterResult.safeText,
    payloadExecuted: {
      entities: sanitizeEntities(normalizedRouterResult.entities), // Banco: sem PII
      idempotencyKey,
    },
    status: 'skill_executed',
    idempotencyKey,
    approvalStatus: 'approved',
  });

  if (!auditLogId) {
    return {
      status: 'failed',
      message: 'Falha critica no sistema de auditoria. Acao abortada por seguranca.',
    };
  }

  return {
    status: 'success',
    message: `Skill "${skill.name}" autorizada e em execucao.`,
    skillName: skill.name,
    auditLogId,
  };
}
