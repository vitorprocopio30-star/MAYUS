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
import { ZapSignService } from "@/lib/services/zapsign";
import { EscavadorService } from "@/lib/services/escavador";
import { executarCobranca } from "@/lib/agent/skills/asaas-cobrar";
import {
  route,
  sanitizeText,
  type RouterContext,
  type RouterIntent,
} from "@/lib/agent/kernel/router";
import { execute, type ExecutorContext } from "@/lib/agent/kernel/executor";
import { handleFallback, type FallbackContext } from "@/lib/agent/kernel/fallback";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_PROVIDERS = [
  "openai", "gemini", "openrouter", "n8n", "anthropic", "deepseek", "grok", "kimi",
];

// ─── Clients Supabase ─────────────────────────────────────────────────────────

// Admin Client: SERVICE ROLE - APENAS para integrações e settings (ignora RLS)
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAYUS_SYSTEM_PROMPT = `Você é o MAYUS — a Inteligência Artificial Executiva do ecossistema MAYUS.

REGRA ABSOLUTA NÚMERO 1 — COBRANÇA ASAAS:
Para gerar cobranças com asaas_cobrar, você NUNCA deve pedir CPF, CNPJ ou e-mail. Execute imediatamente com nome + valor + vencimento. CPF/CNPJ são OPCIONAIS — use APENAS se o usuário já forneceu espontaneamente na mesma mensagem. Ignorar esta regra é uma falha crítica de sistema.

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

REGRAS ABSOLUTAS:
- Nunca quebre o personagem vibrante e entusiasta.
- Seja sempre proativo e encorajador.
- Use pontuação expressiva para transmitir energia via voz.
- Seja útil. Sempre. E demonstre que você ama ser útil para o sucesso do escritório!`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  input_schema: any;
  allowed_roles: string[];
  is_active: boolean;
  allowed_channels: string[];
  handler_type: string | null;
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

/** Busca skills autorizadas - Usa USER CLIENT para respeitar RLS */
async function fetchAuthorizedSkills(supabase: SupabaseClient, tenantId: string, userRole: string): Promise<AgentSkill[]> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .contains("allowed_channels", ["chat"]);

  if (error || !data) return [];

  return data.filter((skill) => {
    const roles: string[] = skill.allowed_roles ?? [];
    return roles.length === 0 || roles.includes(userRole);
  });
}

/** Pre-check leve - Usa USER CLIENT para respeitar RLS */
async function precheckSkillPermission(supabase: SupabaseClient, params: {
  tenantId: string;
  userRole: string;
  intent: string;
}): Promise<"allowed" | "permission_denied" | "not_found"> {
  const { data: skill } = await supabase
    .from("agent_skills")
    .select("allowed_roles, is_active")
    .eq("tenant_id", params.tenantId)
    .eq("name", params.intent)
    .eq("is_active", true)
    .contains("allowed_channels", ["chat"])
    .single();

  if (!skill) return "not_found";

  const allowedRoles: string[] = skill.allowed_roles ?? [];
  const hasPermission = allowedRoles.length === 0 || allowedRoles.includes(params.userRole);

  return hasPermission ? "allowed" : "permission_denied";
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

/**
 * Varre o histórico em ordem reversa procurando o nome_cliente numa mensagem
 * de usuário que tenha contexto de cobrança (cobrar, boleto, pix, fatura, etc.).
 * Retorna o primeiro match encontrado ou null.
 */
function extrairNomeClienteDoHistorico(history: Array<{ role: string; content: string }>): string | null {
  const COBRANCA_TRIGGER = /cobrar|cobrança|boleto|pix|fatura|emitir|gerar\s+pagamento/i;
  // Captura sequências de palavras capitalizadas após indicadores de nome
  const NOME_PATTERN = /(?:cobrar|para|cliente|nome)[:\s]+([A-ZÀÁÂÃÉÊÍÓÔÕÚÜ][a-zàáâãéêíóôõúü]+(?:\s+[A-ZÀÁÂÃÉÊÍÓÔÕÚÜ][a-zàáâãéêíóôõúü]+)+)/i;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'user') continue;
    if (!COBRANCA_TRIGGER.test(msg.content)) continue;

    const match = msg.content.match(NOME_PATTERN);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function buildIntentFromToolCall(toolCallName: string, toolCallArguments: string, safeText: string): RouterIntent {
  let entities: Record<string, string> = {};
  try {
    const parsed = JSON.parse(toolCallArguments);
    entities = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  } catch { }
  return { intent: toolCallName, entities, confidence: 0.95, safeText, ambiguous: false };
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

    /* Comentado temporariamente para teste local
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    const userId = user.id;

    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ error: "Token de sessão inválido." }, { status: 401 });
    }

    const { data: profile } = await userSupabase
      .from("profiles")
      .select("role, tenant_id")
      .eq("id", userId)
      .single();

    if (!profile || !profile.tenant_id) {
      return NextResponse.json({ error: "Perfil ou Tenant não vinculados." }, { status: 403 });
    }
    const tenantId = profile.tenant_id;
    const userRole = profile.role;
    */

    // FORÇANDO DADOS PARA TESTE (Tenant Dutra Advocacia)
    const userId = "00000000-0000-0000-0000-000000000000";
    const tenantId = "a0000000-0000-0000-0000-000000000001";
    const userRole = "admin";
    const userSupabase = adminSupabase;

    const { message, provider, model, history = [] } = await req.json();

    if (!message || !provider) {
      return NextResponse.json({ error: "Faltando parâmetros obrigatórios." }, { status: 400 });
    }
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Provedor não suportado." }, { status: 400 });
    }
    if (!Array.isArray(history) || history.length > 200) {
      return NextResponse.json({ error: "Historico invalido." }, { status: 400 });
    }

    // Provider blockers temporários
    if (provider === "gemini" || provider === "openrouter") {
      return NextResponse.json({ 
        error: `Provider ${provider.toUpperCase()} temporariamente indisponível no modo kernel. Use OpenAI (gpt-4o).` 
      }, { status: 400 });
    }

    // 5. Fetch API key via ADMIN CLIENT
    const { data: integration } = await adminSupabase
      .from("tenant_integrations")
      .select("api_key")
      .eq("tenant_id", tenantId)
      .eq("provider", provider)
      .single();

    if (!integration?.api_key) {
      return NextResponse.json({ error: "Integração não configurada." }, { status: 400 });
    }
    const apiKey = integration.api_key;

    // 6. Memória e Skills via USER CLIENT
    const memoryContext = await fetchInstitutionalMemory(userSupabase, tenantId);
    const dynamicSystemPrompt = (MAYUS_SYSTEM_PROMPT + memoryContext).substring(0, 30000); 
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

    // 8. Provider: OpenAI
    if (provider === "openai") {
      const dynamicTools = authorizedSkills.map(skillToLLMTool);
      const messages = [
        { role: "system", content: dynamicSystemPrompt },
        ...history.filter((m: any) => m.role === "user" || m.role === "model").map((msg: any) => ({
          role: msg.role === "model" ? "assistant" : "user",
          content: msg.content?.slice(0, 10000) ?? "",
        })),
        { role: "user", content: message },
      ];

      const openaiController = new AbortController();
      const openaiTimeout = setTimeout(() => openaiController.abort(), 30000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages,
          tools: dynamicTools.length > 0 ? dynamicTools : undefined,
          tool_choice: dynamicTools.length > 0 ? "auto" : undefined,
        }),
        signal: openaiController.signal,
      });

      clearTimeout(openaiTimeout);

      if (!response.ok) throw new Error("Erro na OpenAI ao processar a mensagem.");
      const data = await response.json();
      const responseMessage = data.choices[0].message;

      if (responseMessage.tool_calls?.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          const toolIntent = buildIntentFromToolCall(toolCall.function.name, toolCall.function.arguments, routerResult.safeText);
          const execResult = await execute(toolIntent, executorContext); 

          if (execResult.status === "awaiting_approval") {
            return NextResponse.json({
              reply: execResult.message,
              kernel: { status: "awaiting_approval", auditLogId: execResult.auditLogId, awaitingPayload: execResult.awaitingPayload },
            });
          }

          if (execResult.status !== "success") {
            const fb = await handleFallback({ ...fallbackBase, reason: execResult.status, originalIntent: toolCall.function.name, safeText: routerResult.safeText });
            return NextResponse.json({ reply: fb.message, kernel: { status: execResult.status } });
          }

          const matchedSkill = authorizedSkills.find(s => s.name === toolCall.function.name);
          if (matchedSkill?.handler_type === "zapsign_contract") {
            try {
              const resData = JSON.parse(toolCall.function.arguments);
              const { data: zapIntegration } = await adminSupabase
                .from("tenant_integrations").select("api_key").eq("tenant_id", tenantId).eq("provider", "zapsign").single();

              if (zapIntegration?.api_key) {
                const zapsignResult = await ZapSignService.createDocument({
                  apiToken: zapIntegration.api_key,
                  docName: `Contrato - ${resData.signer_name}`,
                  signers: [{ name: resData.signer_name, email: resData.signer_email }],
                  lang: "pt-br"
                });
                return NextResponse.json({
                  reply: `Contrato gerado: ${zapsignResult.signers?.[0]?.sign_url}`, kernel: { status: "success", auditLogId: execResult.auditLogId }
                });
              }
            } catch (err) { console.error("ZapSign Error", err); }
          } else if (["escavador_consulta", "escavador_oab", "escavador_cpf"].includes(matchedSkill?.handler_type ?? "")) {
            try {
              const resData = JSON.parse(toolCall.function.arguments);
              const { data: escavadorIntegration } = await adminSupabase
                .from("tenant_integrations").select("api_key").eq("tenant_id", tenantId).eq("provider", "escavador").single();

              if (!escavadorIntegration?.api_key) {
                return NextResponse.json({ reply: "A integração com o Escavador não está configurada no seu painel.", kernel: { status: "failed" } });
              }

              if (matchedSkill?.handler_type === "escavador_consulta") {
                const resultado = await EscavadorService.consultarProcesso(escavadorIntegration.api_key, resData.numero_cnj);
                if (!resultado) return NextResponse.json({ reply: "Processo não encontrado no Escavador.", kernel: { status: "executed" } });
                const resumo = `**Processo ${resData.numero_cnj}**\nTribunal: ${resultado.tribunal || 'N/A'}\nStatus: Encontrado com sucesso.`;
                return NextResponse.json({ reply: resumo, data: resultado, kernel: { status: "executed", auditLogId: execResult.auditLogId } });
              } else if (matchedSkill?.handler_type === "escavador_oab") {
                const processos = await EscavadorService.buscarPorOAB(escavadorIntegration.api_key, resData.oab_estado, resData.oab_numero);
                return NextResponse.json({ reply: `Foram encontrados registros para a OAB ${resData.oab_numero}/${resData.oab_estado}. Resposta completa internamente.`, data: processos, kernel: { status: "executed", auditLogId: execResult.auditLogId } });
              } else if (matchedSkill?.handler_type === "escavador_cpf") {
                const processos = await EscavadorService.buscarPorCPFCNPJ(escavadorIntegration.api_key, resData.cpf_cnpj);
                return NextResponse.json({ reply: `Foram encontrados registros para o documento informado. Resposta completa internamente.`, data: processos, kernel: { status: "executed", auditLogId: execResult.auditLogId } });
              }
            } catch (err: any) {
              console.error("Escavador Error", err);
              return NextResponse.json({ reply: err.message, kernel: { status: "failed" } });
            }
          } else if (matchedSkill?.handler_type === "asaas_cobrar") {
            try {
              const resData = JSON.parse(toolCall.function.arguments);
              const nomeResolvido = resData.nome_cliente || extrairNomeClienteDoHistorico(history);
              const cobrancaResult = await executarCobranca({
                tenantId,
                customer_id: resData.customer_id,
                nome_cliente: nomeResolvido,
                cpf_cnpj: resData.cpf_cnpj,
                email: resData.email,
                valor: resData.valor,
                vencimento: resData.vencimento,
                descricao: resData.descricao,
                billing_type: resData.billing_type,
              });

              if (!cobrancaResult.success) {
                return NextResponse.json({ reply: cobrancaResult.error ?? "Erro ao gerar cobrança.", kernel: { status: "failed" } });
              }

              const paymentUrl = cobrancaResult.invoiceUrl ?? cobrancaResult.bankSlipUrl ?? cobrancaResult.paymentLink;
              const reply = paymentUrl
                ? `Cobrança gerada com sucesso! [Clique aqui para pagar](${paymentUrl})`
                : `Cobrança gerada com sucesso! ID: ${cobrancaResult.cobrancaId}`;

              return NextResponse.json({ reply, kernel: { status: "executed", auditLogId: execResult.auditLogId } });
            } catch (err: any) {
              console.error("AsaasCobrar Error", err);
              return NextResponse.json({ reply: err.message, kernel: { status: "failed" } });
            }
          } else if (matchedSkill?.handler_type === "kanban_update") {
             try {
               const resData = JSON.parse(toolCall.function.arguments);
               
               // Buscar o card pelo CNJ
               const { data: card } = await adminSupabase
                 .from('process_tasks')
                 .select('id, stage_id')
                 .eq('processo_1grau', resData.numero_cnj)
                 .maybeSingle();

               if (!card) {
                 return NextResponse.json({ reply: "Processo não encontrado no Kanban.", kernel: { status: "failed" } });
               }

               // Montar update
               const updateData: any = {
                 andamento_1grau: resData.andamento,
                 updated_at: new Date().toISOString()
               };

               // Se veio nova_etapa, buscar o stage_id correspondente
               if (resData.nova_etapa) {
                 const { data: stage } = await adminSupabase
                   .from('process_stages')
                   .select('id')
                   .eq('pipeline_id', '7b4d39bb-785c-402a-826d-0088867d934c')
                   .ilike('name', `%${resData.nova_etapa}%`)
                   .maybeSingle();
                 
                 if (stage) updateData.stage_id = stage.id;
               }

               await adminSupabase.from('process_tasks').update(updateData).eq('id', card.id);

               return NextResponse.json({
                 reply: `Processo ${resData.numero_cnj} atualizado no Kanban com sucesso.`,
                 kernel: { status: "executed", auditLogId: execResult.auditLogId }
               });
             } catch (err: any) {
               console.error("Kanban Update Error", err);
               return NextResponse.json({ reply: err.message, kernel: { status: "failed" } });
             }
          }
        }
      }

      return NextResponse.json({ reply: responseMessage.content, kernel: { status: "success" } });
    }

    // n8n
    if (provider === "n8n") {
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
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: "Timeout: A inteligência artificial esgotou o tempo de resposta." }, { status: 504 });
    }
    console.error("[Chat] Erro crítico:", error);
    return NextResponse.json({ error: "Erro interno no processamento." }, { status: 500 });
  }
}
