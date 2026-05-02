export const DEMO_SEED_TAG = "mayus_demo_seed_v1";
export const DEMO_OAB_ESTADO = "SP";
export const DEMO_OAB_NUMERO = "123456";
export const DEMO_OAB_ADVOGADO_NOME = "Dra. Helena Monteiro Demo";
export const DEMO_OAB_MONITORAMENTO_ID = "demo-oab-sp-123456";

type DemoCaseForOab = {
  code: string;
  title: string;
  clientName: string;
  legalArea: string;
  description: string;
  demand: string;
  defendant: string;
  caseNumber: string;
  court: string;
  value: number;
  isHero: boolean;
  tags: string[];
  currentPhase: string;
};

type DemoTaskForOab = {
  source?: string | null;
  title?: string | null;
  client_name?: string | null;
  sector?: string | null;
  demanda?: string | null;
  processo_1grau?: string | null;
  orgao_julgador?: string | null;
  reu?: string | null;
  valor_causa?: number | string | null;
  andamento_1grau?: string | null;
  data_ultima_movimentacao?: string | null;
  tags?: string[] | null;
};

function pad(value: number) {
  return String(value).padStart(3, "0");
}

function addDemoDays(days: number) {
  const date = new Date("2026-05-02T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeMoney(value: unknown) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function codeIndex(code: string | null | undefined, fallback: number) {
  const match = String(code ?? "").match(/(\d+)$/);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sourceToCode(source: string | null | undefined, fallback: number) {
  const value = String(source ?? "");
  const code = value.includes(":") ? value.split(":").pop() : value;
  return code || `demo_case_${pad(fallback)}`;
}

export function normalizeDemoOab(estado: unknown, numero: unknown) {
  return {
    estado: String(estado ?? "").trim().toUpperCase(),
    numero: String(numero ?? "").replace(/\D/g, ""),
  };
}

export function isDemoOabQuery(estado: unknown, numero: unknown) {
  const normalized = normalizeDemoOab(estado, numero);
  return normalized.estado === DEMO_OAB_ESTADO && normalized.numero === DEMO_OAB_NUMERO;
}

export function buildDemoMovements(input: {
  code?: string | null;
  legalArea?: string | null;
  currentPhase?: string | null;
  demand?: string | null;
}, fallbackIndex = 1) {
  const index = codeIndex(input.code, fallbackIndex);
  const area = normalizeText(input.legalArea || "Juridico") || "Juridico";
  const phase = normalizeText(input.currentPhase || "Acompanhamento") || "Acompanhamento";
  const demand = normalizeText(input.demand || "demanda sintetica") || "demanda sintetica";

  return [
    {
      id: `demo-mov-${pad(index)}-003`,
      data: addDemoDays(-(index % 5) - 1).slice(0, 10),
      tipo: "intimacao",
      fonte: "TJSP demo",
      texto: `Intimacao demo em ${area}: MAYUS identificou movimento relevante e sugeriu organizar prazo, tarefa e resposta ao cliente.`,
      conteudo: `Intimacao demo em ${area}: MAYUS identificou movimento relevante e sugeriu organizar prazo, tarefa e resposta ao cliente.`,
      resumo: `Movimento relevante para ${phase}.`,
      demo_seed: DEMO_SEED_TAG,
    },
    {
      id: `demo-mov-${pad(index)}-002`,
      data: addDemoDays(-(index % 12) - 9).slice(0, 10),
      tipo: "juntada",
      fonte: "TJSP demo",
      texto: `Juntada sintetica vinculada a ${demand}.`,
      conteudo: `Juntada sintetica vinculada a ${demand}.`,
      resumo: "Documento demo anexado ao processo.",
      demo_seed: DEMO_SEED_TAG,
    },
    {
      id: `demo-mov-${pad(index)}-001`,
      data: addDemoDays(-(index % 20) - 25).slice(0, 10),
      tipo: "distribuicao",
      fonte: "TJSP demo",
      texto: "Processo demo distribuido para demonstracao comercial do MAYUS.",
      conteudo: "Processo demo distribuido para demonstracao comercial do MAYUS.",
      resumo: "Distribuicao sintetica.",
      demo_seed: DEMO_SEED_TAG,
    },
  ];
}

export function buildDemoOabProcessFromCase(item: DemoCaseForOab, fallbackIndex = 1) {
  const index = codeIndex(item.code, fallbackIndex);
  const movimentacoes = buildDemoMovements({
    code: item.code,
    legalArea: item.legalArea,
    currentPhase: item.currentPhase,
    demand: item.demand,
  }, index);
  const envolvidos = [
    { nome: item.clientName, polo: "ATIVO", tipo: "cliente", demo_seed: DEMO_SEED_TAG },
    { nome: item.defendant, polo: "PASSIVO", tipo: "parte_contraria", demo_seed: DEMO_SEED_TAG },
    { nome: DEMO_OAB_ADVOGADO_NOME, polo: "ADVOGADO", tipo: "advogado", oab: `${DEMO_OAB_ESTADO}/${DEMO_OAB_NUMERO}`, demo_seed: DEMO_SEED_TAG },
  ];

  return {
    numero_processo: item.caseNumber,
    numero_cnj: item.caseNumber,
    escavador_id: `demo-fonte-${item.code}`,
    tribunal: "TJSP",
    comarca: "Sao Paulo",
    vara: item.court,
    assunto: item.demand,
    classe_processual: `${item.legalArea} - Procedimento comum`,
    tipo_acao: item.legalArea,
    status: "ATIVO",
    fase_atual: item.currentPhase,
    fontes_tribunais_estao_arquivadas: false,
    status_predito: item.currentPhase,
    cliente_nome: item.clientName,
    polo_ativo: item.clientName,
    polo_passivo: item.defendant,
    valor_causa: item.value,
    data_distribuicao: addDemoDays(-120 - index).slice(0, 10),
    data_ultima_movimentacao: movimentacoes[0].data,
    ultima_movimentacao_texto: movimentacoes[0].texto,
    ultima_movimentacao_resumo: movimentacoes[0].resumo,
    envolvidos,
    movimentacoes,
    raw_escavador: {
      demo_seed: DEMO_SEED_TAG,
      id: `demo-processo-${item.code}`,
      numero_cnj: item.caseNumber,
      titulo_polo_ativo: item.clientName,
      titulo_polo_passivo: item.defendant,
      unidade_origem: { sigla_tribunal: "TJSP", comarca: "Sao Paulo" },
      fontes: [{
        processo_fonte_id: `demo-fonte-${item.code}`,
        status_predito: item.currentPhase,
        capa: {
          assunto: item.demand,
          classe: `${item.legalArea} - Procedimento comum`,
          orgao_julgador: item.court,
          valor_causa: { valor: item.value, valor_formatado: `R$ ${item.value.toLocaleString("pt-BR")}` },
          data_inicio: addDemoDays(-120 - index).slice(0, 10),
          data_ultima_movimentacao: movimentacoes[0].data,
        },
        envolvidos,
        movimentacoes,
      }],
    },
    demo_seed: DEMO_SEED_TAG,
  };
}

export function buildDemoOabProcessFromTask(item: DemoTaskForOab, fallbackIndex = 1) {
  const code = sourceToCode(item.source, fallbackIndex);
  return buildDemoOabProcessFromCase({
    code,
    title: String(item.title || `Caso demo ${pad(fallbackIndex)}`),
    clientName: String(item.client_name || `Cliente Demo ${pad(fallbackIndex)}`),
    legalArea: String(item.sector || "Juridico"),
    description: String(item.demanda || item.title || "Caso demo"),
    demand: String(item.demanda || "demanda juridica sintetica"),
    defendant: String(item.reu || "Parte Contraria Demo"),
    caseNumber: String(item.processo_1grau || `000${pad(fallbackIndex)}-45.2026.8.26.${String(1000 + fallbackIndex).slice(-4)}`),
    court: String(item.orgao_julgador || "Vara Modelo"),
    value: normalizeMoney(item.valor_causa),
    isHero: Array.isArray(item.tags) ? item.tags.includes("caso_vitrine") : fallbackIndex <= 12,
    tags: item.tags || [DEMO_SEED_TAG, "demo"],
    currentPhase: String(item.andamento_1grau || "Acompanhamento"),
  }, fallbackIndex);
}

export function buildDemoOabCachePayload(cases: DemoCaseForOab[]) {
  const processos = cases.map((item, index) => buildDemoOabProcessFromCase(item, index + 1));
  return {
    processos,
    total: processos.length,
    advogado: {
      nome: DEMO_OAB_ADVOGADO_NOME,
      quantidade_processos: processos.length,
      oab_estado: DEMO_OAB_ESTADO,
      oab_numero: DEMO_OAB_NUMERO,
      demo_seed: DEMO_SEED_TAG,
    },
  };
}

export function buildDemoOabCachePayloadFromTasks(tasks: DemoTaskForOab[]) {
  const processos = tasks.map((item, index) => buildDemoOabProcessFromTask(item, index + 1));
  return {
    processos,
    total: processos.length,
    advogado: {
      nome: DEMO_OAB_ADVOGADO_NOME,
      quantidade_processos: processos.length,
      oab_estado: DEMO_OAB_ESTADO,
      oab_numero: DEMO_OAB_NUMERO,
      demo_seed: DEMO_SEED_TAG,
    },
  };
}

export function isDemoProcessRecord(proc: any) {
  const raw = proc?.raw_escavador;
  return String(proc?.escavador_id || "").startsWith("demo-")
    || String(proc?.escavador_monitoramento_id || "").startsWith("demo-")
    || raw?.demo_seed === DEMO_SEED_TAG
    || Array.isArray(proc?.movimentacoes) && proc.movimentacoes.some((item: any) => item?.demo_seed === DEMO_SEED_TAG);
}

function addRuntimeDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function buildDemoOrganizationResult(proc: any, options: {
  kanbanStageId?: string | null;
  responsavelNome?: string | null;
} = {}) {
  const movimentacoes = Array.isArray(proc?.movimentacoes) ? proc.movimentacoes : [];
  const latest = movimentacoes[0] || {};
  const latestText = latest.texto || latest.descricao || latest.conteudo || "movimento demo pendente de revisao";
  const clientName = proc?.cliente_nome || proc?.partes?.polo_ativo || proc?.partes?.ativo || "Cliente Demo";
  const urgent = String(latestText).toLowerCase().includes("intim");

  return {
    resumo_curto: `Fluxo demo organizado para ${clientName}. MAYUS leu a OAB ficticia, encontrou o processo ${proc?.numero_processo || "demo"}, analisou movimentacoes sinteticas e preparou prazo, tarefa, card e resposta supervisionada.`,
    proxima_acao_sugerida: "Validar a providencia sugerida, conferir o prazo demo e aprovar a resposta curta ao cliente no WhatsApp.",
    urgencia_nivel: urgent ? "amarelo" : "verde",
    urgencia_motivo: urgent ? "Existe intimacao demo recente que exige conferencia humana antes de qualquer ato externo." : "",
    kanban_stage_id: options.kanbanStageId || null,
    prazos: [
      {
        tipo: "prazo",
        descricao: `Prazo demo para revisar movimentacao: ${String(latestText).slice(0, 120)}`,
        data_vencimento_iso: addRuntimeDays(7),
        prioridade: urgent ? "alta" : "media",
        responsavel_nome: options.responsavelNome || null,
      },
    ],
    tarefas: [
      {
        titulo: "Organizar providencia demo do processo",
        descricao: "Conferir movimento, validar documentos pendentes e aprovar resposta ao cliente antes de qualquer envio externo.",
        responsavel_nome: options.responsavelNome || null,
        prioridade: urgent ? "alta" : "media",
      },
    ],
    peca_sugerida: "Manifestacao de ciencia e providencias",
    whatsapp_resposta_sugerida: `Oi, ${clientName}. O MAYUS identificou uma movimentacao nova no seu processo e ja organizou prazo e providencia para revisao do escritorio. Assim que validarmos, te atualizo por aqui.`,
    demo_seed: DEMO_SEED_TAG,
    side_effects_externos: "bloqueados",
  };
}
