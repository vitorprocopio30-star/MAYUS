import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Cliente Supabase Administrativo (Service Role) ───────────────────────────
// Usamos a service_role key aqui para que o servidor possa validar o segredo
// e escrever dados sem precisar de sessão de usuário. 
// ⚠️ Esta chave NUNCA deve ser exposta ao cliente/browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Interfaces de Payload ─────────────────────────────────────────────────────
interface AsaasPayload {
  event: string;
  payment?: {
    id: string;
    value: number;
    netValue: number;
    customer: string;
    description?: string;
    billingType: string;
    status: string;
    confirmedDate?: string;
    paymentDate?: string;
  };
}

interface ZapSignPayload {
  event_action: string;
  document?: {
    token: string;
    name: string;
    status: string;
    created_at: string;
    signers?: Array<{ email: string; status: string }>;
  };
}

// ─── Processadores por Provedor ────────────────────────────────────────────────

/**
 * Driver Asaas: Processa eventos de pagamento.
 * Evento principal: PAYMENT_RECEIVED
 */
async function processAsaas(
  payload: AsaasPayload,
  tenantId: string
): Promise<{ action: string; message: string }> {
  const { event, payment } = payload;

  if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event)) {
    return { action: "ignored", message: `Evento "${event}" ignorado.` };
  }

  if (!payment) {
    return { action: "error", message: "Payload de pagamento ausente." };
  }

  // Insere a transação na tabela financials para alimentar o BI
  const { error } = await supabaseAdmin.from("financials").insert({
    tenant_id: tenantId,
    type: "receita",
    description: payment.description || "Pagamento via Asaas",
    amount: payment.netValue ?? payment.value,
    reference_date: payment.paymentDate || payment.confirmedDate || new Date().toISOString(),
    source: "asaas",
    external_id: payment.id,
    metadata: {
      asaas_event: event,
      billing_type: payment.billingType,
      customer: payment.customer,
      gross_value: payment.value,
    },
  });

  if (error) {
    // Se foi um erro de duplicidade (idempotência), não é um erro real
    if (error.code === "23505") {
      return { action: "duplicate", message: "Pagamento já registrado (idempotente)." };
    }
    console.error("[Asaas Driver] Erro ao inserir em financials:", error);
    return { action: "error", message: error.message };
  }

  return {
    action: "sale_registered",
    message: `Pagamento R$ ${payment.value} registrado com sucesso.`,
  };
}

/**
 * Driver ZapSign: Processa eventos de assinatura de documentos.
 * Evento principal: doc_signed
 */
async function processZapSign(
  payload: ZapSignPayload,
  tenantId: string
): Promise<{ action: string; message: string }> {
  const { event_action, document } = payload;

  if (!["doc_signed", "doc_completed"].includes(event_action)) {
    return { action: "ignored", message: `Evento "${event_action}" ignorado.` };
  }

  if (!document) {
    return { action: "error", message: "Payload de documento ausente." };
  }

  // Carrega as metas do escritório para atualizar automaticamente a de CTR
  const { data: settings } = await supabaseAdmin
    .from("tenant_settings")
    .select("strategic_goals")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (settings?.strategic_goals) {
    const goals = settings.strategic_goals as any[];
    let updated = false;

    const updatedGoals = goals.map((goal: any) => {
      // Localiza meta do tipo CTR (Contratos) para incrementar
      if (
        goal.unit === "CTR" ||
        goal.name?.toLowerCase().includes("contrato") ||
        goal.source === "vendas"
      ) {
        updated = true;
        return {
          ...goal,
          currentValue: (Number(goal.currentValue) || 0) + 1,
        };
      }
      return goal;
    });

    if (updated) {
      await supabaseAdmin
        .from("tenant_settings")
        .update({ strategic_goals: updatedGoals, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
    }
  }

  return {
    action: "contract_signed",
    message: `Documento "${document.name}" assinado. Meta CTR atualizada.`,
  };
}

// ─── Handler Principal do Webhook ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");

    if (!provider) {
      return NextResponse.json({ error: "Provedor não especificado." }, { status: 400 });
    }

    // Lê o body uma única vez
    const rawBody = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
    }

    // ── Busca a integração para obter o tenantId e o segredo ──────────────────
    // Nota: Procuramos por provider. Em prod, valide também o webhook_secret
    // via header específico de cada provedor (ex: Asaas-Webhook-Secret).
    const { data: integration, error: integError } = await supabaseAdmin
      .from("tenant_integrations")
      .select("tenant_id, webhook_secret, status")
      .eq("provider", provider)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (integError || !integration) {
      console.warn(`[Gateway] Integração "${provider}" não encontrada ou inativa.`);
      // Sempre respondemos 200 para não gerar retentativas desnecessárias
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const tenantId: string = integration.tenant_id;

    // ── Roteamento para o Driver correto ──────────────────────────────────────
    let result: { action: string; message: string };

    switch (provider) {
      case "asaas":
        result = await processAsaas(payload as AsaasPayload, tenantId);
        break;
      case "zapsign":
        result = await processZapSign(payload as ZapSignPayload, tenantId);
        break;
      default:
        result = { action: "unknown_provider", message: `Provedor "${provider}" sem driver configurado.` };
    }

    console.log(`[Gateway] ${provider} → ${result.action}: ${result.message}`);

    // Resposta rápida 200 para o provedor (evita retentativas)
    return NextResponse.json({ received: true, result }, { status: 200 });
  } catch (err: any) {
    console.error("[Gateway] Erro fatal:", err);
    // Mesmo em erro, retorna 200 para o provedor (processamos internamente)
    return NextResponse.json({ received: true, error: "internal" }, { status: 200 });
  }
}

// GET — Health check da rota
export async function GET() {
  return NextResponse.json({
    status: "online",
    gateway: "MAYUS Webhook Gateway v1",
    providers: ["asaas", "zapsign"],
    timestamp: new Date().toISOString(),
  });
}
