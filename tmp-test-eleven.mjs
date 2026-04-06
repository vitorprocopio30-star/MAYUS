// Node 18+ has fetch built-in
async function testSignedUrl() {
  const agentId = 'agent_2601kmdr9rfpf51apgwxqm9pe01k'; // ID do usuário
  const apiKey = '4adaea0fdd8733ae000618d732fec7fe62ff8ca0971b8e17bd448c39c281dc79'; // Key do usuário no banco

  console.log("-----------------------------------------");
  console.log("Diagnóstico ElevenLabs ConvAI");
  console.log("-----------------------------------------");
  console.log("Solicitando Signed URL para o Agente:", agentId);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey
      }
    });

    console.log("Status HTTP:", response.status);
    const data = await response.json();
    console.log("Resposta ElevenLabs:", JSON.stringify(data, null, 2));
    
    if (response.status === 200 && data.signed_url) {
       console.log("\n[SUCESSO] A chave e o Agente são válidos.");
    } else {
       console.log("\n[ERRO] Verifique se o Agente está 'Public' ou se o 'Client-Side Authentication' está ativado.");
    }

  } catch (err) {
    console.error("Erro interno no script de teste:", err);
  }
}

testSignedUrl();
