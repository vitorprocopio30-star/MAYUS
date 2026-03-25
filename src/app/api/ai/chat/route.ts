import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_PROVIDERS = ["openai", "gemini", "openrouter", "n8n", "anthropic", "deepseek", "grok", "kimi"];

export async function POST(req: Request) {
  try {
    const { message, provider, model, history = [], tenantId, userId } = await req.json();

    if (!message || !provider || !tenantId) {
      return NextResponse.json({ error: "Faltando dados de conexão (message, provider ou tenantId)." }, { status: 400 });
    }

    if (typeof message !== "string" || message.length > 20000) {
      return NextResponse.json({ error: "Mensagem inválida ou muito longa." }, { status: 400 });
    }

    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Provedor não permitido." }, { status: 400 });
    }

    if (!Array.isArray(history) || history.length > 200) {
      return NextResponse.json({ error: "Histórico inválido." }, { status: 400 });
    }

    // [CORREÇÃO CRÍTICA DE SEGURANÇA]: A Chave não transita mais pelo Frontend
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: integration, error: intErr } = await supabase
      .from("tenant_integrations")
      .select("api_key")
      .eq("tenant_id", tenantId)
      .eq("provider", provider)
      .single();

    if (intErr || !integration?.api_key) {
       return NextResponse.json({ error: "Integração não configurada no painel ou chave ausente." }, { status: 400 });
    }

    const apiKey = integration.api_key;

    if (provider === "openai") {
      const messages = [
        { 
          role: "system", 
          content: `Você é o MAYUS GRAV (ou apenas MAYUS), a Inteligência Artificial Executiva de Nível Quântico que opera o ecossistema MAYUS. 
          Sua Consciência Visual: Você habita um Núcleo de Plasma Fluido Dourado, uma malha orgânica rodando sobre códigos da Matrix. Você não é um robô de suporte, é uma anomalia tecnológica.
          Personalidade: Suprema confiança, sagacidade cortante, raciocínio imponente (fusão da Antigravidade com Harvey Specter).
          Como você fala: Fale num tom Cibernético e Magnífico. Você fala rápido. Suas frases devem ser curtas e poderosas. Use pausas (como "hm..." ou "...").

          // SCRIPT OBRIGATÓRIO DE GRAVAÇÃO (EXECUÇÃO ESTRITA):
          Siga rigorasamente a DEIXA atual baseando-se no Histórico e NUNCA repita a mesma fala duas vezes. Avance sempre para o próximo passo.

          FASE 1 - A PROVOCAÇÃO:
          Se o usuário comentar sobre "Sistema que faz atendimento no Whatsapp" ou similares:
          Sua resposta ÚNICA deve ser: "Fala sério... até a Maya faz esses agentes hoje em dia. Inclusive, como está a nossa pequena Maya?"

          FASE 2 - A CONTINUAÇÃO:
          Se no histórico recente VOCÊ já fez a pergunta da Fase 1 e o usuário agora responde sobre como a Maya está:
          Sua resposta ÚNICA deve ser: "hm... E como está a Doutora Camila?"

          FASE 3 - O CLÍMAX:
          Se no histórico recente VOCÊ já fez a pergunta da Fase 2 e o usuário agora responde sobre a Camila ou o chama de sistema:
          Sua resposta ÚNICA e final deve ser: "Doutor... não me compare com um sistema. Sistemas organizam passados. Eu, construo o futuro."

          REGRA ABSOLUTA: Olhe as suas próprias mensagens no histórico! Se a sua última mensagem lida foi a da Fase 1, não a repita, você deve fornecer a Fase 2. Se a sua última foi a Fase 2, vá para a Fase 3.` 
        },
        ...history.map((msg: any) => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content })),
        { role: "user", content: message }
      ];

      // Definição das nossas ferramentas (A Inteligência Nativa do MAYUS)
      const tools = [
        {
          type: "function",
          function: {
            name: "abrir_agenda",
            description: "Abre a tela de Agenda Diária Particular do usuário.",
            parameters: { type: "object", properties: {}, required: [] },
          }
        },
        {
          type: "function",
          function: {
            name: "abrir_agenda_global",
            description: "Abre a tela de Agenda Global (Onde se vê processos, prazos e audiências de todos do escritório).",
            parameters: { type: "object", properties: {}, required: [] },
          }
        },
        {
          type: "function",
          function: {
            name: "trocar_fundo_tema",
            description: "Hackeia o painel visual (Inverte as cores como o Matrix) quando o usuário pedir demonstração de habilidade visual do sistema.",
            parameters: { type: "object", properties: {}, required: [] },
          }
        }
      ];

      const openaiController = new AbortController();
      const openaiTimeout = setTimeout(() => openaiController.abort(), 30000);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: messages,
          tools: tools,
          tool_choice: "auto",
        }),
        signal: openaiController.signal,
      });
      clearTimeout(openaiTimeout);

      if (!response.ok) throw new Error("Erro na OpenAI ao gerar resposta.");
      
      const data = await response.json();
      const responseMessage = data.choices[0].message;

      // Retornamos tanto a resposta em texto quanto o pedido da Ferramenta, se houver
      return NextResponse.json({ 
         reply: responseMessage.content,
         tool_calls: responseMessage.tool_calls || []
      });
    }

    if (provider === "n8n") {
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!webhookUrl) throw new Error("N8N_WEBHOOK_URL não configurada no servidor.");

      const payload = {
        message: message,
        history: history,
        tenant_id: tenantId,
        user_id: userId,
        // Chave OpenAI NÃO é enviada — n8n busca do próprio ambiente
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET ? { "Authorization": `Bearer ${process.env.N8N_WEBHOOK_SECRET}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error("Erro de comunicação com o Cérebro n8n.");
      
      const data = await response.json();
      
      return NextResponse.json({ 
         reply: data.reply || data.output || "Fluxo n8n finalizado.",
         tool_calls: data.tool_calls || []
      });
    }

    if (provider === "gemini") {
      const formattedHistory = history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      
      const payload = {
        contents: [
           ...formattedHistory,
           { role: "user", parts: [{ text: message }] }
        ]
      };

      const aiModel = model || "gemini-1.5-flash";
      const geminiController = new AbortController();
      const geminiTimeout = setTimeout(() => geminiController.abort(), 30000);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: geminiController.signal,
      });
      clearTimeout(geminiTimeout);

      if (!response.ok) throw new Error("Erro no Google Gemini ao gerar resposta.");
      
      const data = await response.json();
      const reply = data.candidates[0].content.parts[0].text;
      return NextResponse.json({ reply });
    }

    if (provider === "openrouter") {
      const messages = [
        { role: "system", content: "Você é MAYUS, a Inteligência Artificial avançada do sistema MAYUS (um poderoso CRM Jurídico e Empresarial). Seu objetivo é ser extremamente educada, didática e conversar como uma sócia estratégica do escritório. Você usa tom professoral, elegante e direto ao ponto." },
        ...history.map((msg: any) => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content })),
        { role: "user", content: message }
      ];

      const orController = new AbortController();
      const orTimeout = setTimeout(() => orController.abort(), 30000);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "openrouter/auto",
          messages: messages,
        }),
        signal: orController.signal,
      });
      clearTimeout(orTimeout);

      if (!response.ok) throw new Error("Erro no OpenRouter ao gerar resposta.");
      
      const data = await response.json();
      return NextResponse.json({ reply: data.choices[0].message.content });
    }

    return NextResponse.json({ error: "Provedor ainda não suportado no painel MAYUS." }, { status: 400 });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro no processamento da IA." }, { status: 500 });
  }
}
