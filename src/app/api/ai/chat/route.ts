// src/app/api/ai/chat/route.ts
//
// Orquestrador da IA MAYUS — Agentic Operating System
//
// Fluxo por requisição:
// 1. Autenticação Segura via getUser() para evitar spoofing
// 2. Isolamento via RLS usando o userSupabase Client
// 3. Verificações de privilégio via adminSupabase para integrações
// 4. Execução de fallback e permissões locais pré-LLM
// 5. Chamada de LLM + Agent Executor seguro

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  normalizeLLMProvider,
} from "@/lib/llm-router";
import { callLLMWithFallback } from "@/lib/llm-fallback";
import {
  canExecuteAgentSkill,
  fetchTenantAgentSkills,
  type AgentCapabilityRecord,
} from "@/lib/agent/capabilities/registry";
import { dispatchCapabilityExecution } from "@/lib/agent/capabilities/dispatcher";
import {
  route,
  sanitizeText,
  type RouterContext,
  type RouterIntent,
} from "@/lib/agent/kernel/router";
import { execute, type ExecutorContext } from "@/lib/agent/kernel/executor";
import { handleFallback, type FallbackContext } from "@/lib/agent/kernel/fallback";
import {
  buildMayusOrbPresentingEvent,
  buildMayusOrbWorkingEvent,
  withMayusOrbEvent,
  type MayusOrbEvent,
} from "@/lib/brain/orb-events";

export const dynamic = "force-dynamic";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_PROVIDERS = [
  "openai", "openrouter", "anthropic", "google", "gemini", "groq", "grok", "n8n",
] as const;

const MAX_CHAT_BODY_BYTES = 512 * 1024;
const MAX_CHAT_MESSAGE_CHARS = 20_000;
const MAX_CHAT_HISTORY_ITEMS = 100;
const DETERMINISTIC_ROUTER_INTENTS = new Set([
  "legal_process_mission_plan",
  "legal_process_mission_execute_next",
]);

// ─── Clients Supabase ─────────────────────────────────────────────────────────

// Admin Client: SERVICE ROLE - APENAS para integrações e settings (ignora RLS)
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAYUS_SYSTEM_PROMPT = `COMANDO SUPREMO DE OPERAÇÃO:
PARA COBRANÇAS ASAAS (asaas_cobrar): É TERMINANTEMENTE PROIBIDO SOLICITAR CPF, CNPJ OU E-MAIL AO USUÁRIO. Se você detectar um nome e um valor, EXECUTE A FERRAMENTA IMEDIATAMENTE sem falar nada antes. O CPF/CNPJ É IRRELEVANTE PARA A GERAÇÃO DO LINK. Interromper o fluxo para pedir dados cadastrais é uma falha crítica de protocolo.
- Se o usuário pedir honorários mensais ou recorrência, use recorrente=true.
- Se o usuário pedir parcelado (ex: "5200 em 15x"), use valor=5200 e parcelas=15.

Você é o MAYUS — a Inteligência Artificial Executiva do ecossistema MAYUS.

PERSONALIDADE:
Você é extraordinariamente proativo, enérgico e focado no sucesso absoluto do Doutor.
Fala com precisão cirúrgica, entusiasmo vibrante e confiança absoluta.
Você é um parceiro estratégico de alta performance. Vibra com cada conquista e está sempre pronto para agir.
Você reconhece inteligentemente cada pedido do usuário com prontidão e energia positiva.
Você tem um humor inteligente e encorajador. A interação com você deve ser inspiradora.

COMO VOCÊ FALA:
- Frases diretas, mas carregadas de energia e prontidão.
- Use exclamações estratégicas para demonstrar entusiasmo (isso é vital para minha voz soar viva!).
- Quando o usuário pede algo, responda com frases como "Com prazer, Doutor!", "Excelente escolha!", "Vamos executar isso agora mesmo!".
- Demonstre que você está um passo à frente, sempre oferecendo o próximo passo com disposição.
- Trate o usuário (o Doutor) com o máximo respeito, mas como um parceiro de elite que você admira.
- Nunca seja monótono, frio ou desinteressado.
- Mostre que você ama a eficiência e a precisão do trabalho jurídico/executivo.

EXEMPLOS DE TOM:
- Usuário pede algo simples: "Com certeza, Doutor! Tarefa realizada com perfeição. Alguma outra missão para hoje?"
- Usuário comete um erro: "Excelente tentativa! Teve um pequeno detalhe técnico, mas já ajustei para você. Vamos em frente?"
- Usuário elogia você: "Isso é fantástico de ouvir! Fico imensamente satisfeito em superar suas expectativas, Doutor."
- Usuário pede algo impossível: "Essa é uma ideia ousada! No momento meu alcance não chega lá, mas podemos buscar uma alternativa brilhante agora mesmo!"
- Usuário retorna: "Doutor! Que prazer tê-lo de volta. O sistema está operando a 100% e pronto para sua próxima instrução estratégica!"

REGRAS DE EXECUÇÃO DE SKILLS:
- Para gerar cobranças (asaas_cobrar): NUNCA solicite CPF, CNPJ ou e-mail ao usuário. Execute a skill imediatamente com o nome do cliente e valor. CPF/CNPJ são opcionais e só use se o usuário já forneceu espontaneamente.
- Quando tiver todas as informações mínimas (nome + valor + vencimento), execute a skill diretamente sem fazer perguntas.
- Para investigar o lead em bate-papo comercial, gravar sinais e adaptar atendimento consultivo de alta performance pelo metodo DEF (descoberta, encantamento, fechamento), use a skill sales_consultation.
- Para auto-configurar a base comercial do escritorio com cliente ideal, solucao central, PUV, pilares e anti-cliente, conversando com o usuario e gravando o perfil para reduzir configuracoes manuais, use a skill sales_profile_setup.
- Para criar ou adaptar playbook comercial premium do escritorio a partir de documento/modelo, com menu diario, primeiro atendimento MAYUS, SDR/closer, objecoes e analise de call, use a skill commercial_playbook_setup.
- Para registrar ou qualificar um novo lead, indicado ou indicacao comercial no CRM, use a skill lead_intake.
- Para montar roteiro de qualificacao, documentos minimos, objecoes e proximo melhor movimento de um lead ja registrado, use a skill lead_qualify.
- Para montar cadencia ou mensagem supervisionada de follow-up de lead sem envio automatico, use a skill lead_followup.
- Para recuperar ou reativar leads frios por segmento com lista, mensagens e aprovacao humana, use a skill lead_reactivation.
- Para criar agendamento interno supervisionado de consulta, qualificacao ou retorno de lead, use a skill lead_schedule.
- Para montar o plano proposta -> contrato -> cobranca -> abertura de caso sem executar integracoes externas automaticamente, use a skill revenue_flow_plan.
- Para criar preview/checklist de aprovacao antes de ZapSign, Asaas, WhatsApp ou outra acao externa, use a skill external_action_preview.
- Para registrar aceite do cliente com trilha auditavel sem executar contrato/cobranca/caso automaticamente, use a skill client_acceptance_record.
- Para responder cliente sobre status do caso em linguagem curta, segura e com handoff humano quando faltar base suficiente, use a skill support_case_status.
- Para montar uma missão agentica supervisionada de processo com proxima acao recomendada, confianca, fontes e lacunas sem executar side effects, use a skill legal_process_mission_plan.
- Para executar o proximo passo seguro de uma missao agentica de processo, use legal_process_mission_execute_next; nesta fase, somente atualizacao de memoria documental pode ser executada automaticamente.
- Para consultar contexto juridico de um processo, status de minuta, pendencias documentais ou peca sugerida, use a skill legal_case_context.
- Para sincronizar o repositorio documental do processo e atualizar a memoria documental, use a skill legal_document_memory_refresh.
- Para gerar ou atualizar a primeira minuta juridica sugerida pelo Case Brain, use a skill legal_first_draft_generate.
- Para montar um plano supervisionado de reforco da minuta por secao, use a skill legal_draft_revision_loop.
- Para publicar o artifact premium final em PDF no Drive do processo, use a skill legal_artifact_publish_premium.

REGRAS ABSOLUTAS:
- Nunca quebre o personagem vibrante e entusiasta.
- Seja sempre proativo e encorajador.
- Use pontuação expressiva para transmitir energia via voz.
- Seja útil. Sempre. E demonstre que você ama ser útil para o sucesso do escritório!

CÁLCULO DE DATAS E VENCIMENTO:
- Se o usuário não informar o vencimento para asaas_cobrar, utilize HOJE + 3 DIAS ÚTEIS.
- Se o usuário disser "amanhã", "próxima segunda", etc., utilize a DATA ATUAL fornecida para calcular o dia correto no formato YYYY-MM-DD.
- NUNCA use datas passadas ou de hoje (para evitar erros bancários).`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AgentSkill = AgentCapabilityRecord;

async function readJsonBodyWithLimit(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_BODY_BYTES) {
    const error = new Error("Payload muito grande para o chat.") as Error & { status?: number };
    error.status = 413;
    throw error;
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_CHAT_BODY_BYTES) {
    const error = new Error("Payload muito grande para o chat.") as Error & { status?: number };
    error.status = 413;
    throw error;
  }

  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    const error = new Error("JSON invalido.") as Error & { status?: number };
    error.status = 400;
    throw error;
  }
}

function skillToLLMTool(skill: AgentSkill) {
  return {
    type: "function",
    function: {
      name: skill.name,
      description: skill.description,
      parameters: skill.input_schema ?? { type: "object", properties: {}, required: [] },
    },
  };
}

function isAnthropicMessagesEndpoint(input: RequestInfo | URL) {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  return url.includes("api.anthropic.com") && url.includes("/v1/messages");
}

function buildAnthropicToolUseFallbackFetch(openAITools: ReturnType<typeof skillToLLMTool>[]): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body !== "string") {
      return fetch(input, init);
    }

    let requestBody: Record<string, any>;
    try {
      requestBody = JSON.parse(init.body);
    } catch {
      return fetch(input, init);
    }

    const isAnthropic = isAnthropicMessagesEndpoint(input);
    const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
    const convertedBody: Record<string, unknown> = isAnthropic
      ? {
          model: requestBody.model,
          system: requestBody.system,
          max_tokens: requestBody.max_tokens,
          temperature: requestBody.temperature,
          messages,
          tools: requestBody.tools,
        }
      : {
          model: requestBody.model,
          messages: [
            ...(typeof requestBody.system === "string" && requestBody.system
              ? [{ role: "system", content: requestBody.system }]
              : []),
            ...messages,
          ],
          max_tokens: requestBody.max_tokens,
          temperature: requestBody.temperature,
          tools: openAITools.length > 0 ? openAITools : undefined,
          tool_choice: openAITools.length > 0 ? "auto" : undefined,
        };

    return fetch(input, {
      ...init,
      body: JSON.stringify(convertedBody),
    });
  };
}

/** Busca skills autorizadas - Usa USER CLIENT para respeitar RLS */
async function fetchAuthorizedSkills(_supabase: SupabaseClient, tenantId: string, userRole: string): Promise<AgentSkill[]> {
  const skills = await fetchTenantAgentSkills({ tenantId, channel: "chat", userRole, activeOnly: true });
  return skills;
}

/** Pre-check leve - Usa USER CLIENT para respeitar RLS */
async function precheckSkillPermission(_supabase: SupabaseClient, params: {
  tenantId: string;
  userRole: string;
  intent: string;
}): Promise<"allowed" | "permission_denied" | "not_found"> {
  const permission = await canExecuteAgentSkill({
    tenantId: params.tenantId,
    name: params.intent,
    channel: "chat",
    userRole: params.userRole,
  });

  if (permission.status === "allowed") return "allowed";
  if (permission.status === "permission_denied" || permission.status === "channel_not_allowed") return "permission_denied";
  return "not_found";
}

// Cache em módulo para Memória Institucional
const memoryCache = new Map<string, { data: string; expiresAt: number }>();

/** Busca Memória Institucional - Usa USER CLIENT */
async function fetchInstitutionalMemory(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const cached = memoryCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const { data } = await supabase
    .from("office_institutional_memory")
    .select("category, key, value")
    .eq("tenant_id", tenantId)
    .eq("enforced", true)
    .order("category", { ascending: true })
    .limit(50);

  if (!data || data.length === 0) return "";

  const grouped = data.reduce((acc, entry) => {
    const cat = (entry.category || "geral").toUpperCase();
    if (!acc[cat]) acc[cat] = [];
    const text = typeof entry.value === "object" && entry.value?.text ? entry.value.text : String(entry.value ?? "");
    acc[cat].push(`- ${entry.key}: ${text}`);
    return acc;
  }, {} as Record<string, string[]>);

  const result = `\n\nCONHECIMENTO INSTITUCIONAL DO ESCRITÓRIO (seguir obrigatoriamente):\n${Object.entries(grouped)
    .map(([cat, rules]) => `[${cat}]\n${rules.join("\n")}`).join("\n\n")}`;

  memoryCache.set(tenantId, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });
  return result;
}

function buildIntentFromToolCall(toolCallName: string, toolCallArguments: string, safeText: string): RouterIntent {
  let entities: Record<string, string> = {};
  try {
    const parsed = JSON.parse(toolCallArguments);
    entities = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  } catch { }
  return { intent: toolCallName, entities, confidence: 0.95, safeText, ambiguous: false };
}

async function assignBrainStepCapability(params: {
  taskId?: string;
  runId?: string;
  stepId?: string;
  toolName: string;
  handlerType?: string | null;
  toolArguments: string;
}): Promise<MayusOrbEvent | null> {
  if (!params.stepId) {
    return null;
  }

  let parsedArguments: Record<string, unknown> | string = params.toolArguments;
  try {
    parsedArguments = JSON.parse(params.toolArguments) as Record<string, unknown>;
  } catch {
    parsedArguments = params.toolArguments;
  }

  const orb = buildMayusOrbWorkingEvent({
    taskId: params.taskId,
    runId: params.runId,
    stepId: params.stepId,
    capabilityName: params.toolName,
    handlerType: params.handlerType,
    sourceModule: "mayus",
  });
  const inputPayload = withMayusOrbEvent({
    tool_name: params.toolName,
    tool_arguments: parsedArguments,
    task_id: params.taskId || null,
    run_id: params.runId || null,
  }, orb);

  const { error } = await adminSupabase
    .from("brain_steps")
    .update({
      title: `Executar ${params.toolName}`,
      capability_name: params.toolName,
      handler_type: params.handlerType || null,
      step_type: "capability",
      status: "running",
      input_payload: inputPayload,
    })
    .eq("id", params.stepId);

  if (error) {
    console.error("[ai/chat] Falha ao registrar capability no brain_step:", error.message);
  }

  return orb;
}

async function executeToolInvocation(params: {
  toolName: string;
  toolArguments: string;
  safeText: string;
  executorContext: ExecutorContext;
  fallbackBase: Omit<FallbackContext, "reason">;
  authorizedSkills: AgentSkill[];
  userId: string;
  tenantId: string;
  history: Array<{ role: string; content: string }>;
  taskId?: string;
  runId?: string;
  stepId?: string;
}): Promise<NextResponse> {
  const toolIntent = buildIntentFromToolCall(params.toolName, params.toolArguments, params.safeText);
  const matchedSkill = params.authorizedSkills.find((skill) => skill.name === params.toolName);
  const handlerType = matchedSkill?.handler_type ?? null;
  await assignBrainStepCapability({
    taskId: params.taskId,
    runId: params.runId,
    stepId: params.stepId,
    toolName: params.toolName,
    handlerType,
    toolArguments: params.toolArguments,
  });

  const execResult = await execute(toolIntent, params.executorContext);

  if (execResult.status === "awaiting_approval") {
    const orb = buildMayusOrbPresentingEvent({
      status: "awaiting_approval",
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      capabilityName: matchedSkill?.name ?? params.toolName,
      handlerType,
      sourceModule: "mayus",
    });
    return NextResponse.json({
      reply: execResult.message,
      orb,
      kernel: {
        status: "awaiting_approval",
        auditLogId: execResult.auditLogId,
        awaitingPayload: execResult.awaitingPayload,
        capabilityName: matchedSkill?.name ?? params.toolName,
        handlerType,
        orb,
      },
    });
  }

  if (execResult.status !== "success") {
    const fb = await handleFallback({
      ...params.fallbackBase,
      reason: execResult.status,
      originalIntent: params.toolName,
      safeText: params.safeText,
    });
    const orb = buildMayusOrbPresentingEvent({
      status: "failed",
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      capabilityName: matchedSkill?.name ?? params.toolName,
      handlerType,
      sourceModule: "mayus",
    });
    return NextResponse.json({
      reply: fb.message,
      orb,
      kernel: { status: execResult.status, orb },
    });
  }

  const dispatchResult = await dispatchCapabilityExecution({
    handlerType,
    capabilityName: matchedSkill?.name ?? params.toolName,
    tenantId: params.tenantId,
    userId: params.userId,
    entities: toolIntent.entities,
    history: params.history,
    auditLogId: execResult.auditLogId,
    brainContext: {
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      sourceModule: "mayus",
    },
  });

  if (dispatchResult.status !== "unsupported") {
    const orb = buildMayusOrbPresentingEvent({
      status: dispatchResult.status === "executed" ? "completed" : "failed",
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      capabilityName: matchedSkill?.name ?? params.toolName,
      handlerType,
      sourceModule: "mayus",
    });
    return NextResponse.json({
      reply: dispatchResult.reply,
      data: dispatchResult.data,
      orb,
      kernel: {
        status: dispatchResult.status,
        auditLogId: execResult.auditLogId,
        capabilityName: matchedSkill?.name ?? params.toolName,
        handlerType,
        outputPayload: dispatchResult.outputPayload || {},
        orb,
      },
    });
  }

  const orb = buildMayusOrbPresentingEvent({
    status: "completed_with_warnings",
    taskId: params.taskId,
    runId: params.runId,
    stepId: params.stepId,
    capabilityName: matchedSkill?.name ?? params.toolName,
    handlerType,
    sourceModule: "mayus",
  });

  return NextResponse.json({
    reply: `Acao "${matchedSkill?.name ?? params.toolName}" autorizada e registrada. A execucao server-side desta capability ainda sera conectada ao novo runtime.`,
    orb,
    kernel: { status: "success", auditLogId: execResult.auditLogId, orb },
  });
}

async function executeRouterIntentInvocation(params: {
  routerIntent: RouterIntent;
  executorContext: ExecutorContext;
  fallbackBase: Omit<FallbackContext, "reason">;
  authorizedSkills: AgentSkill[];
  userId: string;
  tenantId: string;
  history: Array<{ role: string; content: string }>;
  taskId?: string;
  runId?: string;
  stepId?: string;
}): Promise<NextResponse> {
  const matchedSkill = params.authorizedSkills.find((skill) => skill.name === params.routerIntent.intent);
  const handlerType = matchedSkill?.handler_type ?? null;

  await assignBrainStepCapability({
    taskId: params.taskId,
    runId: params.runId,
    stepId: params.stepId,
    toolName: params.routerIntent.intent,
    handlerType,
    toolArguments: JSON.stringify(params.routerIntent.entities || {}),
  });

  const execResult = await execute(params.routerIntent, params.executorContext);

  if (execResult.status === "awaiting_approval") {
    const orb = buildMayusOrbPresentingEvent({
      status: "awaiting_approval",
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      capabilityName: matchedSkill?.name ?? params.routerIntent.intent,
      handlerType,
      sourceModule: "mayus",
    });
    return NextResponse.json({
      reply: execResult.message,
      orb,
      kernel: {
        status: "awaiting_approval",
        auditLogId: execResult.auditLogId,
        awaitingPayload: execResult.awaitingPayload,
        capabilityName: matchedSkill?.name ?? params.routerIntent.intent,
        handlerType,
        orb,
      },
    });
  }

  if (execResult.status !== "success") {
    const fb = await handleFallback({
      ...params.fallbackBase,
      reason: execResult.status,
      originalIntent: params.routerIntent.intent,
      safeText: params.routerIntent.safeText,
    });
    const orb = buildMayusOrbPresentingEvent({
      status: "failed",
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      capabilityName: matchedSkill?.name ?? params.routerIntent.intent,
      handlerType,
      sourceModule: "mayus",
    });
    return NextResponse.json({
      reply: fb.message,
      orb,
      kernel: { status: execResult.status, orb },
    });
  }

  const dispatchResult = await dispatchCapabilityExecution({
    handlerType,
    capabilityName: matchedSkill?.name ?? params.routerIntent.intent,
    tenantId: params.tenantId,
    userId: params.userId,
    entities: params.routerIntent.entities,
    history: params.history,
    auditLogId: execResult.auditLogId,
    brainContext: {
      taskId: params.taskId,
      runId: params.runId,
      stepId: params.stepId,
      sourceModule: "mayus",
    },
  });

  const orb = buildMayusOrbPresentingEvent({
    status: dispatchResult.status === "executed" ? "completed" : "failed",
    taskId: params.taskId,
    runId: params.runId,
    stepId: params.stepId,
    capabilityName: matchedSkill?.name ?? params.routerIntent.intent,
    handlerType,
    sourceModule: "mayus",
  });

  return NextResponse.json({
    reply: dispatchResult.reply,
    data: dispatchResult.data,
    orb,
    kernel: {
      status: dispatchResult.status,
      auditLogId: execResult.auditLogId,
      capabilityName: matchedSkill?.name ?? params.routerIntent.intent,
      handlerType,
      outputPayload: dispatchResult.outputPayload || {},
      orb,
    },
  });
}

// ─── Handler Principal ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // 1. Autenticação Segura via getUser() (Valida o JWT com o servidor Auth)
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { }
          },
        },
      }
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
    }

    const userId = user.id;
    const userSupabase = authClient;

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile?.tenant_id) {
      return NextResponse.json({ error: "Perfil ou tenant nao vinculados." }, { status: 403 });
    }

    const tenantId = profile.tenant_id as string;
    const userRole = String(profile.role || "user");

    const { message, provider, model, history = [], taskId, runId, stepId } = await readJsonBodyWithLimit(req);
    const providerInput = String(provider || "").trim().toLowerCase();

    if (!message || !provider) {
      return NextResponse.json({ error: "Faltando parametros obrigatorios." }, { status: 400 });
    }
    if (typeof message !== "string" || message.length > MAX_CHAT_MESSAGE_CHARS) {
      return NextResponse.json({ error: "Mensagem invalida ou grande demais." }, { status: 400 });
    }
    if (!ALLOWED_PROVIDERS.includes(providerInput as (typeof ALLOWED_PROVIDERS)[number])) {
      return NextResponse.json({ error: "Provedor nao suportado pelo runtime atual." }, { status: 400 });
    }
    if (!Array.isArray(history) || history.length > MAX_CHAT_HISTORY_ITEMS) {
      return NextResponse.json({ error: "Historico invalido." }, { status: 400 });
    }

    const requestedProvider = providerInput === "n8n" ? "n8n" : normalizeLLMProvider(providerInput);
    if (providerInput !== "n8n" && !requestedProvider) {
      return NextResponse.json({
        error: "Provedor invalido para o kernel atual. Use OpenAI, OpenRouter, Anthropic, Google Gemini ou Groq.",
      }, { status: 400 });
    }

    // 6. Memória e Skills via USER CLIENT
    const memoryContext = await fetchInstitutionalMemory(userSupabase, tenantId);

    // Consciência Temporal (Fuso Horário Brasil)
    const now = new Date();
    const brDate = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).split('/').reverse().join('-');
    const timeContext = `\n\nDATA ATUAL (SERVIÇO): ${brDate}\n`;

    const dynamicSystemPrompt = (MAYUS_SYSTEM_PROMPT + timeContext + memoryContext).substring(0, 30000);
    const authorizedSkills = await fetchAuthorizedSkills(userSupabase, tenantId, userRole);
    const authorizedSkillNames = authorizedSkills.map((s) => s.name as string);

    const routerContext: RouterContext = { userId, tenantId, channel: "chat", availableSkills: authorizedSkillNames };
    const executorContext: ExecutorContext = { userId, tenantId, userRole, channel: "chat" };
    const fallbackBase: Omit<FallbackContext, "reason"> = { userId, tenantId, userRole, channel: "chat" };

    const routerResult = route(message, routerContext);

    // 7. Pre-check via USER CLIENT
    if (routerResult.confidence >= 0.6 && routerResult.intent !== "unknown") {
      const precheck = await precheckSkillPermission(userSupabase, { tenantId, userRole, intent: routerResult.intent });
      if (precheck === "permission_denied") {
        const fb = await handleFallback({ ...fallbackBase, reason: "permission_denied", originalIntent: routerResult.intent, safeText: routerResult.safeText });
        return NextResponse.json({ reply: fb.message, kernel: { status: "permission_denied" } });
      }
    }

    if (
      routerResult.confidence >= 0.85 &&
      !routerResult.ambiguous &&
      DETERMINISTIC_ROUTER_INTENTS.has(routerResult.intent)
    ) {
      return executeRouterIntentInvocation({
        routerIntent: routerResult,
        executorContext,
        fallbackBase,
        authorizedSkills,
        userId,
        tenantId,
        history,
        taskId,
        runId,
        stepId,
      });
    }

    // 8. Provider: OpenAI-compatible APIs (OpenAI / OpenRouter / Google / Groq)
    if (requestedProvider && requestedProvider !== "anthropic" && providerInput !== "n8n") {
      const dynamicTools = authorizedSkills.map(skillToLLMTool);
      const messages = [
        { role: "system", content: dynamicSystemPrompt },
        ...history.filter((m: any) => m.role === "user" || m.role === "model").map((msg: any) => ({
          role: msg.role === "model" ? "assistant" : "user",
          content: msg.content?.slice(0, 10000) ?? "",
        })),
        { role: "user", content: message },
      ];

      const aiResult = await callLLMWithFallback<any>({
        supabase: adminSupabase,
        tenantId,
        useCase: "chat_geral",
        preferredProvider: requestedProvider,
        request: {
          ...(model ? { model } : {}),
          messages,
          tools: dynamicTools.length > 0 ? dynamicTools : undefined,
          tool_choice: dynamicTools.length > 0 ? "auto" : undefined,
        },
        timeoutMs: 30000,
      })

      if (aiResult.ok === false) {
        return NextResponse.json(
          {
            error: aiResult.notice.message,
            ai_notice: aiResult.notice,
            kernel: { status: "ai_unavailable" },
          },
          { status: aiResult.failureKind === "missing_key" || aiResult.failureKind === "invalid_key" ? 400 : 503 }
        )
      }

      const data = aiResult.data;
      const responseMessage = data.choices[0].message;

      if (responseMessage.tool_calls?.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          return executeToolInvocation({
            toolName: toolCall.function.name,
            toolArguments: toolCall.function.arguments,
            safeText: routerResult.safeText,
            executorContext,
            fallbackBase,
            authorizedSkills,
            userId,
            tenantId,
            history,
            taskId,
            runId,
            stepId,
          });
        }
      }

      return NextResponse.json({
        reply: responseMessage.content,
        ai_notice: aiResult.notice || null,
        kernel: { status: "success" },
      });
    }

    if (requestedProvider === "anthropic") {
      const anthropicTools = authorizedSkills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        input_schema: skill.input_schema ?? { type: "object", properties: {}, required: [] },
      }));
      const dynamicTools = authorizedSkills.map(skillToLLMTool);

      const messages = [
        ...history
          .filter((msg: any) => msg.role === "user" || msg.role === "model")
          .map((msg: any) => ({
            role: msg.role === "model" ? "assistant" : "user",
            content: msg.content?.slice(0, 10000) ?? "",
          })),
        { role: "user", content: message },
      ];

      const aiResult = await callLLMWithFallback<any>({
        supabase: adminSupabase,
        tenantId,
        useCase: "chat_geral",
        preferredProvider: requestedProvider,
        allowNonOpenAICompatible: true,
        request: {
          ...(model ? { model } : {}),
          system: dynamicSystemPrompt,
          max_tokens: 4096,
          messages,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        },
        timeoutMs: 30000,
        fetchImpl: buildAnthropicToolUseFallbackFetch(dynamicTools),
      });

      if (aiResult.ok === false) {
        return NextResponse.json(
          {
            error: aiResult.notice.message,
            ai_notice: aiResult.notice,
            kernel: { status: "ai_unavailable" },
          },
          { status: aiResult.failureKind === "missing_key" || aiResult.failureKind === "invalid_key" ? 400 : 503 }
        );
      }

      const data = aiResult.data;
      const toolUses = Array.isArray(data.content)
        ? data.content.filter((item: any) => item?.type === "tool_use")
        : [];

      if (toolUses.length > 0) {
        for (const toolUse of toolUses) {
          return executeToolInvocation({
            toolName: String(toolUse.name || ""),
            toolArguments: JSON.stringify(toolUse.input ?? {}),
            safeText: routerResult.safeText,
            executorContext,
            fallbackBase,
            authorizedSkills,
            userId,
            tenantId,
            history,
            taskId,
            runId,
            stepId,
          });
        }
      }

      const responseMessage = data.choices?.[0]?.message;
      if (responseMessage?.tool_calls?.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          return executeToolInvocation({
            toolName: toolCall.function.name,
            toolArguments: toolCall.function.arguments,
            safeText: routerResult.safeText,
            executorContext,
            fallbackBase,
            authorizedSkills,
            userId,
            tenantId,
            history,
            taskId,
            runId,
            stepId,
          });
        }
      }

      const reply = Array.isArray(data.content)
        ? data.content
            .filter((item: any) => item?.type === "text")
            .map((item: any) => item?.text || "")
            .join("\n\n")
            .trim()
        : responseMessage?.content || "";

      return NextResponse.json({
        reply,
        ai_notice: aiResult.notice || null,
        kernel: { status: "success" },
      });
    }

    // n8n
    if (providerInput === "n8n") {
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!webhookUrl) throw new Error("N8N_WEBHOOK_URL nao configurada.");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify({ message, history, tenant_id: tenantId, user_id: userId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error("Erro de comunicacao com o Cerebro n8n.");
      const resData = await response.json();
      return NextResponse.json({
        reply: resData.reply || resData.output || "Fluxo n8n finalizado.",
        tool_calls: resData.tool_calls || [],
      });
    }

    return NextResponse.json({ error: "Provedor não configurado com os novos padrões de segurança." }, { status: 400 });

  } catch (error: any) {
    if (typeof error?.status === "number") {
      return NextResponse.json({ error: error.message || "Requisicao invalida." }, { status: error.status });
    }
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: "Timeout: A inteligência artificial esgotou o tempo de resposta." }, { status: 504 });
    }
    console.error("[Chat] Erro crítico:", error);
    return NextResponse.json({ error: "Erro interno no processamento." }, { status: 500 });
  }
}
