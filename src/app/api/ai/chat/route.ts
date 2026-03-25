import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, provider, apiKey, model, history = [], tenantId, userId } = await req.json();

    if (!message || !provider || !apiKey) {
      return NextResponse.json({ error: "Faltando dados de conexão. Configure sua chave em Integrações." }, { status: 400 });
    }

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

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini", // GPT-4o-mini é excepcionalmente superior e mais barato
          messages: messages,
          tools: tools,
          tool_choice: "auto",
        }),
      });

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
      // Essa é a URL Magistral onde sua Nuvem do n8n atende o telefone
      const webhookUrl = "https://n8n-dgfor3z98ea5lkal7s135lu7.187.77.240.109.sslip.io/webhook-test/7c177cf3-cf25-445a-86f4-a7d9a80e5afb";
      
       const payload = {
        message: message,
        history: history,
        tenant_id: tenantId,
        user_id: userId,
        openai_key: apiKey // Enviamos sua Chave OpenAI pro n8n usar nos Tools dele!
       };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
      });

      if (!response.ok) throw new Error("Erro no OpenRouter ao gerar resposta.");
      
      const data = await response.json();
      return NextResponse.json({ reply: data.choices[0].message.content });
    }

    return NextResponse.json({ error: "Provedor ainda não suportado no painel MAYUS." }, { status: 400 });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro no processamento da IA." }, { status: 500 });
  }
}
