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

import { createClient } from '@supabase/supabase-js';
import { sanitizeText, type RouterIntent } from './router';
import crypto from 'crypto';
import { checkTenantLimits } from './limits';

// ─── Cliente Supabase (singleton no módulo) ───────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const { data, error } = await supabase
    .from('agent_audit_logs')
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      skill_invoked: params.skillInvoked,
      intention_raw: params.intentionRaw,
      payload_executed: params.payloadExecuted ?? null,
      status: params.status,
      idempotency_key: params.idempotencyKey,
      approval_status: params.approvalStatus ?? null,
      approval_context: params.approvalContext ?? null,
      pending_execution_payload: params.pendingExecutionPayload ?? null,
      ...(params.idempotencyExpiresAt
        ? { idempotency_expires_at: params.idempotencyExpiresAt }
        : {}),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Executor] Falha ao gravar audit log:', error.message);
    return undefined;
  }
  return data?.id;
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
  const { data: skill, error: skillError } = await supabase
    .from('agent_skills')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('name', routerResult.intent)
    .eq('is_active', true)
    .single();

  if (skillError || !skill) {
    return {
      status: 'skill_not_found',
      message: `A skill "${routerResult.intent}" nao esta disponivel para este escritorio.`,
    };
  }

  // 3. Valida canal permitido (com fallback defensivo para null)
  const allowedChannels: string[] = skill.allowed_channels ?? [];
  if (!allowedChannels.includes(context.channel)) {
    return {
      status: 'channel_not_allowed',
      message: `Esta acao nao pode ser realizada pelo canal "${context.channel}".`,
    };
  }

  // 4. Valida role do usuário contra allowed_roles (com fallback defensivo para null)
  const allowedRoles: string[] = skill.allowed_roles ?? [];
  const hasPermission = allowedRoles.length === 0 || allowedRoles.includes(context.userRole);
  if (!hasPermission) {
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
  const idempotencyKey = generateIdempotencyKey(
    context.tenantId,
    context.userId,
    routerResult.intent
  );

  // 6. Se requer confirmação humana
  if (skill.requires_human_confirmation) {
    // banco: entidades sanitizadas (sem PII)
    const safeEntities = sanitizeEntities(routerResult.entities);
    // UI: entidades reais para decisão informada do aprovador (não persiste)
    const rawEntities = routerResult.entities;

    const auditLogId = await writeAuditLog({
      tenantId: context.tenantId,
      userId: context.userId,
      skillInvoked: skill.name,
      intentionRaw: routerResult.safeText,
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
    intentionRaw: routerResult.safeText,
    payloadExecuted: {
      entities: sanitizeEntities(routerResult.entities), // Banco: sem PII
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
