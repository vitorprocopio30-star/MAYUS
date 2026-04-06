// src/lib/agent/kernel/fallback.ts
//
// Módulo de Fallback Seguro
// Responsabilidade: Tratar casos onde o router ou executor não conseguiram processar.
//
// REGRAS ABSOLUTAS:
// - Nunca executa ações que alterem estado do negócio
// - Nunca chama APIs externas (ZapSign, Asaas, Evolution, WhatsApp)
// - Notificação no Mural é o único efeito colateral permitido
// - Retorna mensagem em texto plano — formatação é responsabilidade do orquestrador
// - Se a notificação no Mural falhar, o fallback ainda retorna resposta ao usuário
//
// ATENÇÃO — Statuses que NUNCA devem acionar handleFallback:
// - 'success'            → operação concluída com êxito, não é falha
// - 'awaiting_approval'  → aguarda decisão humana, não é falha
// Ambos são herdados de ExecutionStatus mas representam estados terminais positivos.

import { createClient } from '@supabase/supabase-js';
import { sanitizeText } from './router';
import type { ExecutionStatus } from './executor';

// ─── Cliente Supabase (singleton no módulo) ───────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FallbackReason =
  | ExecutionStatus
  | 'ambiguous_intent'
  | 'external_api_error';

// Valores válidos para a coluna sentiment da tabela mural_feedbacks
type MuralSentiment = 'positivo' | 'neutro' | 'negativo';

export interface FallbackContext {
  userId: string;
  tenantId: string;
  userRole: string;
  channel: 'chat' | 'whatsapp' | 'background_job';
  reason: FallbackReason;
  originalIntent?: string; // intent detectado pelo router, se houver
  safeText?: string;       // Texto sanitizado do usuário, para contexto do Mural
}

export interface FallbackResult {
  message: string;         // Resposta em texto plano para o usuário
  muralNotified: boolean;  // Se a notificação no Mural foi registrada com sucesso
}

// ─── Mensagens por Razão ──────────────────────────────────────────────────────
// Partial<Record<...>> vincula as chaves ao tipo FallbackReason.
// O TypeScript avisa em compilação se FallbackReason crescer sem mensagem mapeada.

const FALLBACK_MESSAGES: Partial<Record<FallbackReason, string>> = {
  low_confidence:
    'Nao consegui identificar o que voce precisa com seguranca suficiente. ' +
    'Por favor, reformule sua solicitacao ou fale com um atendente.',
  ambiguous_intent:
    'Identifiquei mais de uma possivel intencao na sua mensagem. ' +
    'Pode ser mais especifico sobre o que voce precisa?',
  permission_denied:
    'Voce nao tem permissao para realizar esta acao. ' +
    'Caso precise de acesso, solicite ao administrador do escritorio.',
  channel_not_allowed:
    'Esta acao nao esta disponivel neste canal. ' +
    'Por favor, acesse o painel principal do MAYUS.',
  skill_not_found:
    'Esta funcionalidade ainda nao esta configurada para o seu escritorio. ' +
    'Fale com o administrador.',
  external_api_error:
    'Houve uma falha na comunicacao com um servico externo. ' +
    'Sua solicitacao nao foi processada. Tente novamente em instantes.',
  failed:
    'Ocorreu um erro interno. Sua solicitacao nao foi processada ' +
    'e nenhuma acao foi tomada. A equipe foi notificada.',
  fallback_triggered:
    'Nao foi possivel processar sua solicitacao automaticamente. ' +
    'Um atendente foi notificado.',
};

const FALLBACK_DEFAULT_MESSAGE =
  'Nao foi possivel processar sua solicitacao. Um atendente foi notificado.';

function resolveMessage(reason: FallbackReason): string {
  return FALLBACK_MESSAGES[reason] ?? FALLBACK_DEFAULT_MESSAGE;
}

// ─── Notificação no Mural ─────────────────────────────────────────────────────

/**
 * Registra um alerta no Mural do escritório.
 * É o único efeito colateral permitido no fallback.
 * Falha silenciosamente — NÃO bloqueia a resposta ao usuário.
 */
async function notifyMural(params: {
  tenantId: string;
  userId: string;
  reason: string; // BACKLOG: tipar como FallbackReason para consistência
  originalIntent?: string;
}): Promise<boolean> {
  try {
    // Sanitiza e trunca antes de persistir — originalIntent pode conter PII
    const safeIntent = params.originalIntent
      ? sanitizeText(params.originalIntent).slice(0, 200)
      : 'nao identificada';

    const content =
      `[MAYUS Kernel] Intervencao manual necessaria. ` +
      `Razao: ${params.reason}. ` +
      `Intencao detectada: ${safeIntent}.`;

    const sentiment: MuralSentiment = 'negativo'; // Alertas de sistema são classificados como negativos

    const { error } = await supabase
      .from('mural_feedbacks')
      .insert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        content,
        is_anonymous: false,
        sentiment,
      });

    if (error) {
      console.warn('[Fallback] Nao foi possivel registrar no Mural:', error.message);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('[Fallback] Erro inesperado ao notificar Mural:', e);
    return false;
  }
}

// ─── Função Principal ─────────────────────────────────────────────────────────

/**
 * Trata falhas do router ou do executor de forma segura.
 *
 * Acionado quando:
 * - router retorna confidence < 0.6 ou ambiguous = true com delta < 0.10
 * - executor retorna: low_confidence, permission_denied, skill_not_found,
 *   channel_not_allowed, failed, external_api_error
 *
 * Garantias:
 * - Nenhuma ação de negócio é executada
 * - Nenhuma API externa é chamada
 * - originalIntent é sanitizado e truncado antes de persistir no Mural
 * - Mural é notificado em melhor esforço — falha não bloqueia resposta
 * - Mensagem é sempre em texto plano
 */
export async function handleFallback(context: FallbackContext): Promise<FallbackResult> {
  const message = resolveMessage(context.reason);

  // Notificação no Mural — único efeito colateral permitido
  // Não bloqueia: se falhar, o usuário ainda recebe resposta
  const muralNotified = await notifyMural({
    tenantId: context.tenantId,
    userId: context.userId,
    reason: context.reason,
    originalIntent: context.originalIntent,
  });

  return { message, muralNotified };
}
