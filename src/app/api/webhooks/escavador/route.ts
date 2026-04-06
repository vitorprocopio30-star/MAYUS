import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usando admin client porque o webhook não tem sessão ativa de usuário
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Validação do Token de Segurança
    const authHeader = req.headers.get("Authorization");
    const expectedToken = process.env.ESCAVADOR_WEBHOOK_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      console.warn("[Escavador Webhook] Token inválido ou ausente.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Lê o payload do Escavador
    const payload = await req.json();
    const { event, event_data } = payload;

    if (!event_data?.numero_cnj) {
      console.warn("[Escavador Webhook] Payload sem numero_cnj.");
      return NextResponse.json({ received: true }); // Retornar 200 para evitar retries
    }

    // Processamos apenas eventos de movimentação ou conclusão
    if (event === "nova_movimentacao" || event === "atualizacao_processo_concluida") {
      
      // 3. Busca o processo pelo número CNJ
      const { data: cnjCase, error: caseError } = await adminSupabase
        .from("cases")
        .select("id, tenant_id, advogado_responsavel_id, client_name")
        .eq("numero_cnj", event_data.numero_cnj)
        .single();

      if (caseError || !cnjCase) {
        console.warn(`[Escavador Webhook] Processo não encontrado para o CNJ: ${event_data.numero_cnj}`);
        return NextResponse.json({ received: true }); 
      }

      // 4. Atualiza informações do processo
      const { error: updateError } = await adminSupabase
        .from("cases")
        .update({
          ultima_movimentacao: event_data.conteudo,
          ultima_movimentacao_at: event_data.data,
          ultima_atualizacao_escavador: new Date().toISOString(),
          status_escavador: 'ATIVO',
        })
        .eq("id", cnjCase.id);

      if (updateError) {
        console.error("[Escavador Webhook] Erro ao atualizar case:", updateError);
        return NextResponse.json({ received: true });
      }

      // Atualizar também o card no Kanban automaticamente
      const { data: card } = await adminSupabase
        .from('process_tasks')
        .select('id')
        .eq('processo_1grau', event_data.numero_cnj)
        .maybeSingle();

      if (card) {
        await adminSupabase
          .from('process_tasks')
          .update({
            andamento_1grau: event_data.conteudo,
            updated_at: new Date().toISOString()
          })
          .eq('id', card.id);
      }

      // 5. Cria notificação para o advogado responsável
      if (cnjCase.advogado_responsavel_id) {
        const { error: notificationError } = await adminSupabase
          .from("notifications")
          .insert({
            tenant_id: cnjCase.tenant_id,
            user_id: cnjCase.advogado_responsavel_id,
            title: `Nova movimentação: ${cnjCase.client_name}`,
            message: event_data.conteudo,
            type: "processo_movimentacao",
            metadata: { 
              numero_cnj: event_data.numero_cnj, 
              case_id: cnjCase.id 
            }
          });

        if (notificationError) {
          console.error("[Escavador Webhook] Erro ao criar notificação:", notificationError);
        }
      }
    }

    // 6. Retorno de SUCESSO Absoluto (Parar envio contínuo do Escavador)
    return NextResponse.json({ received: true });

  } catch (err) {
    console.error("[Escavador Webhook] Critical Error:", err);
    // Em qualquer erro interno, retornar 200 para evitar retry loop
    return NextResponse.json({ received: true });
  }
}
