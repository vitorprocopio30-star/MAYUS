const BASE_URL = "https://api.escavador.com/api/v2";

type OABSearchGuard = {
  allowPaidSearch?: boolean;
  source?: string;
};

function assertOABPaidSearchAllowed(guard?: OABSearchGuard) {
  if (!guard?.allowPaidSearch || guard?.source !== 'monitoramento_ui_sync_button') {
    throw new Error('Busca OAB bloqueada: consentimento explícito ausente.');
  }
}

async function fetchEscavador(endpoint: string, apiKey: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${apiKey}`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/json",
  };

  const res = await fetch(url, { ...options, headers });
  
  if (!res.ok) {
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error("Token Escavador inválido");
    if (res.status === 402) throw new Error("Sem créditos Escavador");
    if (res.status === 422) throw new Error("Número CNJ inválido");
    
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Erro Escavador: ${res.status}`);
  }

  return await res.json();
}

export const EscavadorService = {
  // 1. Consultar Processo (Capa)
  consultarProcesso: async (apiKey: string, numeroCNJ: string) => {
    return await fetchEscavador(`/processos/numero_cnj/${numeroCNJ}`, apiKey);
  },

  // 2. Buscar Movimentações
  movimentacoes: async (apiKey: string, numeroCNJ: string, limit = 50) => {
    return await fetchEscavador(`/processos/numero_cnj/${numeroCNJ}/movimentacoes?limit=${limit}`, apiKey);
  },

  // 3. Buscar por OAB
  buscarPorOAB: async (
    apiKey: string,
    oabEstado: string,
    oabNumero: string,
    page = 1,
    limit = 100,
    guard?: OABSearchGuard
  ) => {
    assertOABPaidSearchAllowed(guard)

    const params = new URLSearchParams({
      oab_estado: oabEstado,
      oab_numero: oabNumero,
      limit: String(limit),
      page: String(page)
    })
    return await fetchEscavador(`/advogado/processos?${params.toString()}`, apiKey)
  },

  // 3.1 Buscar por OAB Federal (Justiça Federal)
  buscarPorOABFederal: async (
    apiKey: string,
    oabEstado: string,
    oabNumero: string,
    page = 1,
    limit = 100,
    guard?: OABSearchGuard
  ) => {
    assertOABPaidSearchAllowed(guard)

    const params = new URLSearchParams({
      oab_estado: oabEstado,
      oab_numero: oabNumero,
      justica: 'FEDERAL',
      limit: String(limit),
      page: String(page)
    })
    return await fetchEscavador(`/advogado/processos?${params.toString()}`, apiKey)
  },

  // 4. Buscar por CPF/CNPJ
  buscarPorCPFCNPJ: async (apiKey: string, cpfCnpj: string) => {
    return await fetchEscavador(`/envolvido/processos?cpf_cnpj=${cpfCnpj}`, apiKey);
  },

  // 5. Criar Monitoramento (Requer confirmação humana)
  criarMonitoramento: async (apiKey: string, numeroCNJ: string, frequencia = 'SEMANAL') => {
    console.log('[Escavador] criarMonitoramento chamado:', numeroCNJ);
    
    const resp = await fetch('https://api.escavador.com/api/v2/monitoramentos/processos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ numero: numeroCNJ, frequencia: 'SEMANAL' })
    });
    
    const responseText = await resp.text();
    console.log('[Escavador] criarMonitoramento status:', resp.status);
    console.log('[Escavador] criarMonitoramento response:', responseText);
    
    if (!resp.ok) {
      throw new Error(`Escavador ${resp.status}: ${responseText}`);
    }
    
    return JSON.parse(responseText);
  },

  // 6. Solicitar Atualização Síncrona
  solicitarAtualizacao: async (apiKey: string, numeroCNJ: string) => {
    return await fetchEscavador(`/processos/numero_cnj/${numeroCNJ}/solicitar-atualizacao`, apiKey, {
      method: "POST",
      body: JSON.stringify({ enviar_callback: 1 }), // Opcional, vai disparar nosso webhook depois
    });
  }
};
