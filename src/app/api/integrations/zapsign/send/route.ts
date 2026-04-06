import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ZapSignService } from "@/lib/services/zapsign";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * API Route para envio de contratos ZapSign a partir do MAYUS.
 * Pode ser chamado por IA (Tools) ou pelo Botão "Um Clique" no Chat.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenant_id, contact_id, template_id, variables, doc_name } = await req.json();

    if (!tenant_id || !template_id) {
      return NextResponse.json({ error: "Parâmetros insuficientes" }, { status: 400 });
    }

    // 1. Buscar API Key do ZapSign para o Tenant
    const { data: ntegration, error: intErr } = await supabase
      .from("tenant_integrations")
      .select("api_key")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapsign")
      .single();

    if (intErr || !ntegration?.api_key) {
      return NextResponse.json({ error: "Integração ZapSign não configurada ou ativa." }, { status: 404 });
    }

    // 2. Buscar Dados do Contato para preenchimento automático (se houver id)
    let signerName = "Cliente";
    let signerEmail = "";
    let signerPhone = "";

    if (contact_id) {
      const { data: contact } = await supabase
        .from("whatsapp_contacts")
        .select("name, phone_number")
        .eq("id", contact_id)
        .single();
      
      if (contact) {
        signerName = contact.name || "Cliente";
        signerPhone = contact.phone_number || "";
      }
    }

    // 3. Chamar Serviço ZapSign
    const result = await ZapSignService.createFromTemplate({
      apiToken: ntegration.api_key,
      templateId: template_id,
      docName: doc_name || `Contrato - ${signerName}`,
      externalId: contact_id || undefined,
      signers: [
        {
          name: signerName,
          email: signerEmail || undefined,
          phone_number: signerPhone || undefined,
        }
      ],
      variables: variables || []
    });

    // 4. Registrar envio na timeline (opcional, mas recomendado)
    if (contact_id) {
      await supabase.from("whatsapp_messages").insert([{
        tenant_id,
        contact_id,
        direction: "outbound",
        message_type: "text",
        content: `📄 *Contrato Enviado!* \n\nAproveite e assine agora: ${result.signers?.[0]?.sign_url}`,
        status: "sent"
      }]);
    }

    return NextResponse.json({ 
      success: true, 
      sign_url: result.signers?.[0]?.sign_url,
      doc_token: result.token
    });

  } catch (error: any) {
    console.error("[ZapSign API] Erro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
