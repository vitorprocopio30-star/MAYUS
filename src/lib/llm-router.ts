/**
 * LLM Router — roteamento BYOK por tenant
 *
 * Busca a chave de API na tabela tenant_integrations para o tenant_id informado.
 * Prioridade: OpenRouter → Anthropic → OpenAI → Google → Groq
 * Fallback para variáveis de ambiente apenas se o tenant não tiver nenhuma chave configurada.
 *
 * NUNCA exponha chaves aqui — tudo vem do banco ou de process.env.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ─── Casos de uso ────────────────────────────────────────────────────────────

export type LLMUseCase =
  | 'chat_geral'
  | 'classificar_movimentacao'
  | 'resumo_juridico'
  | 'organizar_processo'
  | 'gerar_peca'
  | 'task_manager'
  | 'sdr_whatsapp'

export type LLMProvider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'groq'

// ─── Tabela de modelos por provedor e caso de uso ────────────────────────────

const MODELS: Record<LLMProvider, Record<LLMUseCase, string>> = {
  openrouter: {
    chat_geral:               'qwen/qwen3.6-plus',
    classificar_movimentacao: 'qwen/qwen3.6-plus',
    resumo_juridico:          'qwen/qwen3.6-plus',
    organizar_processo:       'qwen/qwen3.6-plus',
    gerar_peca:               'anthropic/claude-sonnet-4.6',
    task_manager:             'qwen/qwen3.6-plus',
    sdr_whatsapp:             'qwen/qwen3.6-plus',
  },
  anthropic: {
    chat_geral:               'claude-haiku-4-5-20251001',
    classificar_movimentacao: 'claude-haiku-4-5-20251001',
    resumo_juridico:          'claude-sonnet-4-6',
    organizar_processo:       'claude-sonnet-4-6',
    gerar_peca:               'claude-sonnet-4-6',
    task_manager:             'claude-haiku-4-5-20251001',
    sdr_whatsapp:             'claude-haiku-4-5-20251001',
  },
  openai: {
    chat_geral:               'gpt-5.4-nano',
    classificar_movimentacao: 'gpt-5.4-nano',
    resumo_juridico:          'gpt-5.2',
    organizar_processo:       'gpt-5.2',
    gerar_peca:               'gpt-5.2',
    task_manager:             'gpt-5.4-mini',
    sdr_whatsapp:             'gpt-5.4-mini',
  },
  google: {
    chat_geral:               'gemini-2.0-flash',
    classificar_movimentacao: 'gemini-2.0-flash',
    resumo_juridico:          'gemini-3.1-pro-preview-customtools',
    organizar_processo:       'gemini-3.1-pro-preview-customtools',
    gerar_peca:               'gemini-3.1-pro-preview-customtools',
    task_manager:             'gemini-2.0-flash',
    sdr_whatsapp:             'gemini-2.0-flash',
  },
  groq: {
    chat_geral:               'llama-3.3-70b-versatile',
    classificar_movimentacao: 'llama-3.3-70b-versatile',
    resumo_juridico:          'llama-3.3-70b-versatile',
    organizar_processo:       'llama-3.3-70b-versatile',
    gerar_peca:               'llama-3.3-70b-versatile',
    task_manager:             'llama-3.3-70b-versatile',
    sdr_whatsapp:             'llama-3.3-70b-versatile',
  },
}

// ─── Endpoints por provedor ───────────────────────────────────────────────────

const ENDPOINTS: Record<LLMProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  anthropic:  'https://api.anthropic.com/v1/messages',
  openai:     'https://api.openai.com/v1/chat/completions',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  groq:       'https://api.groq.com/openai/v1/chat/completions',
}

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface LLMClient {
  provider: LLMProvider
  model: string
  apiKey: string
  endpoint: string
  /** Headers extras necessários para o provedor (ex: HTTP-Referer para OpenRouter) */
  extraHeaders: Record<string, string>
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Retorna um LLMClient configurado para o tenant, pronto para chamar a API.
 *
 * @param supabase - cliente Supabase autenticado (server-side)
 * @param tenantId - ID do tenant
 * @param useCase  - caso de uso para selecionar o modelo adequado
 *
 * @throws {Error} se nenhuma chave de IA estiver disponível (banco + env vars)
 */
export async function getLLMClient(
  supabase: SupabaseClient,
  tenantId: string,
  useCase: LLMUseCase
): Promise<LLMClient> {
  // 1. Buscar todas as integrações de IA do tenant
  const { data: integrations } = await supabase
    .from('tenant_integrations')
    .select('provider, api_key, instance_name, status')
    .eq('tenant_id', tenantId)
    .in('provider', ['openrouter', 'anthropic', 'openai', 'google', 'groq'])

  const byProvider = Object.fromEntries(
    (integrations ?? [])
      .filter((integration) => {
        const apiKey = String(integration.api_key || '').trim()
        const status = String((integration as { status?: string | null }).status || '').trim().toLowerCase()
        return Boolean(apiKey) && (!status || status === 'connected')
      })
      .map((integration) => {
        const apiKey = String(integration.api_key || '').trim()
        const modelOverride = String((integration as { instance_name?: string | null }).instance_name || '').trim() || null
        return [integration.provider as LLMProvider, { apiKey, modelOverride }]
      })
  ) as Partial<Record<LLMProvider, { apiKey: string; modelOverride: string | null }>>

  // 2. Selecionar provedor por prioridade (banco → env vars)
  const priority: LLMProvider[] = ['openrouter', 'anthropic', 'openai', 'google', 'groq']

  const envKeys: Partial<Record<LLMProvider, string | undefined>> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    anthropic:  process.env.ANTHROPIC_API_KEY,
    openai:     process.env.OPENAI_API_KEY,
    google:     process.env.GOOGLE_AI_API_KEY,
    groq:       process.env.GROQ_API_KEY,
  }

  let selectedProvider: LLMProvider | null = null
  let selectedKey: string | null = null
  let selectedModelOverride: string | null = null

  // Prioridade 1: chave do próprio tenant no banco
  for (const p of priority) {
    if (byProvider[p]?.apiKey) {
      selectedProvider = p
      selectedKey = byProvider[p]!.apiKey
      selectedModelOverride = byProvider[p]!.modelOverride
      break
    }
  }

  // Prioridade 2: fallback para variáveis de ambiente do sistema
  if (!selectedProvider) {
    for (const p of priority) {
      if (envKeys[p]) {
        selectedProvider = p
        selectedKey = envKeys[p]!
        break
      }
    }
  }

  if (!selectedProvider || !selectedKey) {
    throw new Error(
      `Nenhuma chave de IA configurada para o tenant ${tenantId}. ` +
      'Configure uma integração em Configurações → Integrações.'
    )
  }

  const extraHeaders: Record<string, string> = {}
  if (selectedProvider === 'openrouter') {
    extraHeaders['HTTP-Referer'] = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mayus.app'
    extraHeaders['X-Title'] = 'MAYUS'
  }

  return {
    provider:     selectedProvider,
    model:        selectedModelOverride || MODELS[selectedProvider][useCase],
    apiKey:       selectedKey,
    endpoint:     ENDPOINTS[selectedProvider],
    extraHeaders,
  }
}

/**
 * Monta os headers HTTP para a chamada à API do provedor selecionado.
 */
export function buildHeaders(client: LLMClient): Record<string, string> {
  return {
    'Authorization': `Bearer ${client.apiKey}`,
    'Content-Type':  'application/json',
    ...client.extraHeaders,
  }
}
