import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEMO_OAB_ADVOGADO_NOME,
  DEMO_OAB_ESTADO,
  DEMO_OAB_MONITORAMENTO_ID,
  DEMO_OAB_NUMERO,
  DEMO_SEED_TAG,
  buildDemoMovements,
  buildDemoOabCachePayload,
  buildDemoOabProcessFromCase,
} from "@/lib/demo/demo-oab-flow";
import { isDemoModeEnabled } from "@/lib/demo/demo-mode";

export { DEMO_SEED_TAG } from "@/lib/demo/demo-oab-flow";
export const DEMO_RESET_CONFIRMATION = "RESET_DEMO";
export const DEMO_CASE_COUNT = 100;
export const DEMO_HERO_CASE_COUNT = 12;

type SupabaseLike = typeof supabaseAdmin;

export type DemoCaseSeed = {
  code: string;
  title: string;
  clientName: string;
  legalArea: string;
  stageName: string;
  description: string;
  demand: string;
  defendant: string;
  caseNumber: string;
  court: string;
  value: number;
  score: number;
  isHero: boolean;
  tags: string[];
  currentPhase: string;
  keyFacts: Array<{ label: string; value: string; source: string }>;
  missingDocuments: string[];
  nextTask: {
    title: string;
    urgency: "URGENTE" | "ATENCAO" | "ROTINA" | "TRANQUILO";
    type: string;
    daysFromNow: number;
  };
};

export type DemoResetPreview = {
  totalCases: number;
  heroCases: number;
  volumeCases: number;
  demoOab: {
    estado: string;
    numero: string;
    advogadoNome: string;
    query: string;
  };
  stages: string[];
  legalAreas: string[];
  sampleCases: Array<Pick<DemoCaseSeed, "code" | "title" | "legalArea" | "stageName" | "isHero">>;
};

export type DemoResetResult = {
  dryRun: boolean;
  tenantId: string;
  tenantName: string;
  preview: DemoResetPreview;
  deleted: {
    processTasks: number;
    userTasks: boolean;
    monitoredProcesses: boolean;
    movementInbox: boolean;
    oabCaches: boolean;
    oabMonitoramentos: boolean;
    oabsSalvas: boolean;
    whatsappContacts: number;
    whatsappMessages: boolean;
  };
  inserted: {
    processPipeline: boolean;
    processStages: number;
    processTasks: number;
    documentMemories: number;
    userTasks: number;
    oabCaches: number;
    oabMonitoramentos: number;
    monitoredProcesses: number;
    movementInbox: number;
    whatsappContacts: number;
    whatsappMessages: number;
  };
};

const STAGE_DEFINITIONS = [
  { name: "Triagem MAYUS", color: "#2563eb", order_index: 0 },
  { name: "Documentos", color: "#7c3aed", order_index: 1 },
  { name: "Minuta", color: "#ea580c", order_index: 2 },
  { name: "Revisao humana", color: "#ca8a04", order_index: 3 },
  { name: "Aguardando protocolo", color: "#0891b2", order_index: 4 },
  { name: "Acompanhamento", color: "#16a34a", order_index: 5 },
];

const LEGAL_AREAS = [
  "Previdenciario",
  "Trabalhista",
  "Familia",
  "Consumidor",
  "Bancario",
  "Civel",
  "Empresarial",
  "Imobiliario",
];

const CLIENT_FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Daniel",
  "Elisa",
  "Fabio",
  "Giovana",
  "Helena",
  "Igor",
  "Julia",
  "Leonardo",
  "Marina",
  "Nicolas",
  "Olivia",
  "Paulo",
  "Renata",
  "Sofia",
  "Tiago",
  "Vivian",
  "Walter",
];

const CLIENT_LAST_NAMES = [
  "Almeida",
  "Barros",
  "Campos",
  "Duarte",
  "Esteves",
  "Ferreira",
  "Gomes",
  "Henriques",
  "Lima",
  "Macedo",
];

function pad(value: number) {
  return String(value).padStart(3, "0");
}

function addDays(days: number) {
  const date = new Date("2026-05-02T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function areaDemand(area: string, index: number) {
  const map: Record<string, string> = {
    Previdenciario: "revisao de beneficio e analise de documentos previdenciarios",
    Trabalhista: "verbas rescisorias, horas extras e prova documental de jornada",
    Familia: "reorganizar alimentos, guarda e comunicacao entre as partes",
    Consumidor: "indenizacao por falha de servico e cobranca indevida",
    Bancario: "revisao contratual e contestacao de descontos recorrentes",
    Civel: "indenizacao e obrigacao de fazer com risco de urgencia",
    Empresarial: "cobranca contratual e negociacao de acordo supervisionado",
    Imobiliario: "regularizacao contratual, posse e documentacao do imovel",
  };
  return `${map[area] || "analise juridica operacional"} - caso demo ${pad(index)}`;
}

function buildCaseSeed(index: number): DemoCaseSeed {
  const legalArea = LEGAL_AREAS[index % LEGAL_AREAS.length];
  const stage = STAGE_DEFINITIONS[index % STAGE_DEFINITIONS.length];
  const firstName = CLIENT_FIRST_NAMES[index % CLIENT_FIRST_NAMES.length];
  const lastName = CLIENT_LAST_NAMES[Math.floor(index / CLIENT_FIRST_NAMES.length) % CLIENT_LAST_NAMES.length];
  const isHero = index <= DEMO_HERO_CASE_COUNT;
  const code = `demo_case_${pad(index)}`;
  const value = 18000 + (index % 17) * 2750;
  const score = isHero ? 78 + (index % 17) : 42 + (index % 31);
  const caseNumber = `000${pad(index)}-45.2026.8.26.${String(1000 + index).slice(-4)}`;
  const demand = areaDemand(legalArea, index);

  return {
    code,
    title: `${legalArea} - ${firstName} ${lastName}`,
    clientName: `${firstName} ${lastName}`,
    legalArea,
    stageName: stage.name,
    description: isHero
      ? `Caso vitrine sintetico para demonstrar Case Brain, documentos, riscos, prazos e proximo melhor movimento. Demanda: ${demand}.`
      : `Caso sintetico de volume para demonstrar acervo operacional, filtros, prazos e distribuicao por area. Demanda: ${demand}.`,
    demand,
    defendant: `${legalArea === "Previdenciario" ? "INSS" : legalArea === "Trabalhista" ? "Empresa Modelo" : "Parte Contraria Modelo"} ${pad(index)}`,
    caseNumber,
    court: `${(index % 12) + 1}a Vara ${legalArea} Modelo`,
    value,
    score,
    isHero,
    tags: [
      DEMO_SEED_TAG,
      "demo",
      isHero ? "caso_vitrine" : "caso_volume",
      legalArea.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    ],
    currentPhase: stage.name,
    keyFacts: [
      { label: "Contexto", value: demand, source: "seed_demo" },
      { label: "Status", value: stage.name, source: "seed_demo" },
      { label: "Risco", value: isHero ? "Necessita revisao humana antes de protocolo." : "Risco controlado para demonstracao.", source: "seed_demo" },
    ],
    missingDocuments: isHero
      ? ["comprovante atualizado", "documento pessoal", "historico de comunicacao"]
      : ["documento complementar"],
    nextTask: {
      title: isHero ? `Revisar plano do caso ${pad(index)}` : `Checar pendencia do caso ${pad(index)}`,
      urgency: index % 11 === 0 ? "URGENTE" : index % 5 === 0 ? "ATENCAO" : "ROTINA",
      type: isHero ? "Revisao MAYUS" : "Pendencia documental",
      daysFromNow: (index % 18) + 1,
    },
  };
}

export function buildDemoCaseSeeds(count = DEMO_CASE_COUNT): DemoCaseSeed[] {
  return Array.from({ length: count }, (_, itemIndex) => buildCaseSeed(itemIndex + 1));
}

export function buildDemoResetPreview(cases = buildDemoCaseSeeds()): DemoResetPreview {
  return {
    totalCases: cases.length,
    heroCases: cases.filter((item) => item.isHero).length,
    volumeCases: cases.filter((item) => !item.isHero).length,
    demoOab: {
      estado: DEMO_OAB_ESTADO,
      numero: DEMO_OAB_NUMERO,
      advogadoNome: DEMO_OAB_ADVOGADO_NOME,
      query: `${DEMO_OAB_ESTADO}/${DEMO_OAB_NUMERO}`,
    },
    stages: STAGE_DEFINITIONS.map((stage) => stage.name),
    legalAreas: LEGAL_AREAS,
    sampleCases: cases.slice(0, 6).map((item) => ({
      code: item.code,
      title: item.title,
      legalArea: item.legalArea,
      stageName: item.stageName,
      isHero: item.isHero,
    })),
  };
}

async function assertDemoTenant(supabase: SupabaseLike, tenantId: string) {
  const [{ data: tenant, error: tenantError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("tenants").select("id, name").eq("id", tenantId).maybeSingle(),
    supabase.from("tenant_settings").select("ai_features").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  if (tenantError) throw tenantError;
  if (settingsError) throw settingsError;
  if (!tenant) {
    const error = new Error("DemoTenantNotFound");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  if (!isDemoModeEnabled(settings?.ai_features)) {
    const error = new Error("TenantIsNotDemo");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  return { id: String(tenant.id), name: String(tenant.name || "MAYUS Demo") };
}

async function ensureDemoPipeline(supabase: SupabaseLike, tenantId: string) {
  const { data: existingPipeline, error: existingError } = await supabase
    .from("process_pipelines")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", "MAYUS Demo - Processos")
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingPipeline?.id) return String(existingPipeline.id);

  const { data: pipeline, error } = await supabase
    .from("process_pipelines")
    .insert({
      tenant_id: tenantId,
      name: "MAYUS Demo - Processos",
      description: "Pipeline sintetico usado somente para demonstracoes comerciais do MAYUS.",
      tags: [DEMO_SEED_TAG, "demo"],
      sectors: LEGAL_AREAS,
    })
    .select("id")
    .single();

  if (error) throw error;
  return String(pipeline.id);
}

async function ensureDemoStages(supabase: SupabaseLike, pipelineId: string) {
  const { data: existingStages, error: existingError } = await supabase
    .from("process_stages")
    .select("id, name")
    .eq("pipeline_id", pipelineId);

  if (existingError) throw existingError;
  const byName = new Map((existingStages || []).map((stage: any) => [String(stage.name), String(stage.id)]));

  for (const stage of STAGE_DEFINITIONS) {
    if (byName.has(stage.name)) continue;
    const { data: inserted, error } = await supabase
      .from("process_stages")
      .insert({
        pipeline_id: pipelineId,
        name: stage.name,
        color: stage.color,
        order_index: stage.order_index,
      })
      .select("id, name")
      .single();
    if (error) throw error;
    byName.set(stage.name, String(inserted.id));
  }

  return byName;
}

async function deleteExistingDemoData(supabase: SupabaseLike, tenantId: string) {
  const { data: demoContacts, error: contactsLookupError } = await supabase
    .from("whatsapp_contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .contains("lead_tags", [DEMO_SEED_TAG]);

  if (contactsLookupError) throw contactsLookupError;
  const contactIds = (demoContacts || []).map((item: any) => String(item.id)).filter(Boolean);
  let whatsappMessagesDeleted = false;

  if (contactIds.length > 0) {
    const { error: messageDeleteError } = await supabase
      .from("whatsapp_messages")
      .delete()
      .in("contact_id", contactIds);
    if (messageDeleteError) throw messageDeleteError;
    whatsappMessagesDeleted = true;

    const { error: contactDeleteError } = await supabase
      .from("whatsapp_contacts")
      .delete()
      .in("id", contactIds);
    if (contactDeleteError) throw contactDeleteError;
  }

  const { data: existingCases, error: existingCasesError } = await supabase
    .from("process_tasks")
    .select("id")
    .eq("tenant_id", tenantId)
    .contains("tags", [DEMO_SEED_TAG]);

  if (existingCasesError) throw existingCasesError;

  const caseIds = (existingCases || []).map((item: any) => String(item.id)).filter(Boolean);
  if (caseIds.length > 0) {
    const { error: memoryDeleteError } = await supabase
      .from("process_document_memory")
      .delete()
      .in("process_task_id", caseIds);
    if (memoryDeleteError) throw memoryDeleteError;
  }

  const { error: processDeleteError } = await supabase
    .from("process_tasks")
    .delete()
    .eq("tenant_id", tenantId)
    .contains("tags", [DEMO_SEED_TAG]);
  if (processDeleteError) throw processDeleteError;

  const { error: userTasksDeleteError } = await supabase
    .from("user_tasks")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("source_table", DEMO_SEED_TAG);
  if (userTasksDeleteError) throw userTasksDeleteError;

  const demoCases = buildDemoCaseSeeds();
  const demoCaseNumbers = demoCases.map((item) => item.caseNumber);

  const { error: monitoredDeleteError } = await supabase
    .from("monitored_processes")
    .delete()
    .eq("tenant_id", tenantId)
    .in("numero_processo", demoCaseNumbers);
  if (monitoredDeleteError) throw monitoredDeleteError;

  const { error: movementInboxDeleteError } = await supabase
    .from("process_movimentacoes_inbox")
    .delete()
    .eq("tenant_id", tenantId)
    .in("numero_cnj", demoCaseNumbers);
  if (movementInboxDeleteError) throw movementInboxDeleteError;

  const { error: cacheDeleteError } = await supabase
    .from("processos_cache")
    .delete()
    .eq("tenant_id", tenantId)
    .in("cache_key", [
      `OAB:${DEMO_OAB_ESTADO}:${DEMO_OAB_NUMERO}`,
      `OAB_FULL:${DEMO_OAB_ESTADO}:${DEMO_OAB_NUMERO}`,
      `OAB_V2:${DEMO_OAB_ESTADO}:${DEMO_OAB_NUMERO}:ROOT`,
    ]);
  if (cacheDeleteError) throw cacheDeleteError;

  const { error: oabDeleteError } = await supabase
    .from("oabs_salvas")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("oab_estado", DEMO_OAB_ESTADO)
    .eq("oab_numero", DEMO_OAB_NUMERO);
  if (oabDeleteError) throw oabDeleteError;

  const { error: monitoramentoDeleteError } = await supabase
    .from("tenant_oab_monitoramentos")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("oab_estado", DEMO_OAB_ESTADO)
    .eq("oab_numero", DEMO_OAB_NUMERO);
  if (monitoramentoDeleteError) throw monitoramentoDeleteError;

  return {
    processTasks: caseIds.length,
    userTasks: true,
    monitoredProcesses: true,
    movementInbox: true,
    oabCaches: true,
    oabMonitoramentos: true,
    oabsSalvas: true,
    whatsappContacts: contactIds.length,
    whatsappMessages: whatsappMessagesDeleted,
  };
}

async function seedDemoOabAndCache(supabase: SupabaseLike, tenantId: string, cases: DemoCaseSeed[]) {
  const now = new Date().toISOString();
  const payload = buildDemoOabCachePayload(cases);
  const cacheRows = [
    `OAB:${DEMO_OAB_ESTADO}:${DEMO_OAB_NUMERO}`,
    `OAB_FULL:${DEMO_OAB_ESTADO}:${DEMO_OAB_NUMERO}`,
    `OAB_V2:${DEMO_OAB_ESTADO}:${DEMO_OAB_NUMERO}:ROOT`,
  ].map((cacheKey) => ({
    tenant_id: tenantId,
    cache_key: cacheKey,
    processos: payload.processos,
    total: payload.total,
    advogado: payload.advogado,
    total_paginas: 1,
    pagina_atual: 1,
    sincronizado: true,
    updated_at: now,
  }));

  const { error: cacheError } = await supabase
    .from("processos_cache")
    .upsert(cacheRows, { onConflict: "tenant_id,cache_key" });
  if (cacheError) throw cacheError;

  const { error: oabError } = await supabase.from("oabs_salvas").upsert({
    tenant_id: tenantId,
    oab_estado: DEMO_OAB_ESTADO,
    oab_numero: DEMO_OAB_NUMERO,
    advogado: DEMO_OAB_ADVOGADO_NOME,
    total_processos: payload.total,
    ultima_busca: now,
  }, { onConflict: "tenant_id,oab_estado,oab_numero" });
  if (oabError) throw oabError;

  const { error: monitoramentoError } = await supabase.from("tenant_oab_monitoramentos").upsert({
    tenant_id: tenantId,
    oab_estado: DEMO_OAB_ESTADO,
    oab_numero: DEMO_OAB_NUMERO,
    advogado_nome: DEMO_OAB_ADVOGADO_NOME,
    monitoramento_oab_id: DEMO_OAB_MONITORAMENTO_ID,
    monitoramento_ativo: true,
    ultima_sincronizacao: now,
    updated_at: now,
  }, { onConflict: "tenant_id,oab_estado,oab_numero" });
  if (monitoramentoError) throw monitoramentoError;

  return {
    cacheRows: cacheRows.length,
    monitoramentos: 1,
  };
}

async function seedDemoMonitoredProcesses(
  supabase: SupabaseLike,
  tenantId: string,
  cases: DemoCaseSeed[],
  processBySource: Map<string, string>,
) {
  const now = new Date().toISOString();
  const monitoredRows = cases.slice(0, DEMO_HERO_CASE_COUNT).map((item, index) => {
    const processo = buildDemoOabProcessFromCase(item, index + 1);
    return {
      tenant_id: tenantId,
      numero_processo: processo.numero_processo,
      tribunal: processo.tribunal,
      comarca: processo.comarca,
      vara: processo.vara,
      assunto: processo.assunto,
      classe_processual: processo.classe_processual,
      tipo_acao: processo.tipo_acao,
      status: processo.status,
      fase_atual: processo.fase_atual,
      status_predito: processo.status_predito,
      cliente_nome: processo.cliente_nome,
      partes: {
        polo_ativo: processo.polo_ativo,
        polo_passivo: processo.polo_passivo,
        demo_seed: DEMO_SEED_TAG,
      },
      valor_causa: item.value,
      data_distribuicao: processo.data_distribuicao,
      data_ultima_movimentacao: processo.data_ultima_movimentacao,
      ultima_movimentacao_texto: processo.ultima_movimentacao_texto,
      envolvidos: processo.envolvidos,
      movimentacoes: processo.movimentacoes,
      escavador_id: processo.escavador_id,
      escavador_monitoramento_id: `demo-monitoramento-${item.code}`,
      raw_escavador: processo.raw_escavador,
      monitoramento_ativo: true,
      ativo: true,
      linked_task_id: processBySource.get(`${DEMO_SEED_TAG}:${item.code}`) || null,
      resumo_curto: `Caso demo monitorado pela OAB ficticia ${DEMO_OAB_ESTADO}/${DEMO_OAB_NUMERO}.`,
      urgencia_nivel: item.nextTask.urgency === "URGENTE" ? "vermelho" : "amarelo",
      proxima_acao_sugerida: "Clicar em Organizar com IA para gerar prazo, card, tarefa e resposta WhatsApp demo.",
      ultima_atualizacao_escavador: now,
      updated_at: now,
    };
  });

  const { error } = await supabase.from("monitored_processes").insert(monitoredRows);
  if (error) throw error;
  return monitoredRows.length;
}

async function seedDemoMovementInbox(supabase: SupabaseLike, tenantId: string, cases: DemoCaseSeed[]) {
  const now = new Date().toISOString();
  const rows = cases.map((item, index) => {
    const movements = buildDemoMovements({
      code: item.code,
      legalArea: item.legalArea,
      currentPhase: item.currentPhase,
      demand: item.demand,
    }, index + 1);
    const latest = movements[0];
    return {
      tenant_id: tenantId,
      numero_cnj: item.caseNumber,
      oab_estado: DEMO_OAB_ESTADO,
      oab_numero: DEMO_OAB_NUMERO,
      latest_data: latest.data,
      latest_conteudo: latest.texto,
      latest_fonte: latest.fonte,
      latest_created_at: now,
      quantidade_eventos: movements.length,
      movimentacoes: movements,
      payload_ultimo_evento: latest,
      monitorado: index < DEMO_HERO_CASE_COUNT,
      updated_at: now,
    };
  });

  const { error } = await supabase.from("process_movimentacoes_inbox").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function seedDemoWhatsapp(supabase: SupabaseLike, tenantId: string, cases: DemoCaseSeed[]) {
  const now = new Date().toISOString();
  const contactsSeed = [
    {
      phone_number: "+5511991000101",
      name: `${cases[0]?.clientName || "Cliente Demo"} - Demo`,
      tags: [DEMO_SEED_TAG, "demo_cliente", "previdenciario"],
      caseIndex: 0,
      unread: 2,
    },
    {
      phone_number: "+5511991000102",
      name: `${cases[1]?.clientName || "Cliente Demo"} - Demo`,
      tags: [DEMO_SEED_TAG, "demo_cliente", "trabalhista"],
      caseIndex: 1,
      unread: 0,
    },
    {
      phone_number: "+5511991000103",
      name: "Lead OAB Demo",
      tags: [DEMO_SEED_TAG, "demo_lead", "atendimento_ia"],
      caseIndex: 2,
      unread: 1,
    },
  ];

  const contactRows = contactsSeed.map((item, index) => ({
    tenant_id: tenantId,
    phone_number: item.phone_number,
    name: item.name,
    unread_count: item.unread,
    last_message_at: addDays(-(index + 1)),
    lead_tags: item.tags,
    updated_at: now,
  }));

  const { data: contacts, error: contactsError } = await supabase
    .from("whatsapp_contacts")
    .upsert(contactRows, { onConflict: "tenant_id,phone_number" })
    .select("id, phone_number");
  if (contactsError) throw contactsError;

  const contactByPhone = new Map((contacts || []).map((item: any) => [String(item.phone_number), String(item.id)]));
  const messageRows = contactsSeed.flatMap((contact, contactIndex) => {
    const caseItem = cases[contact.caseIndex] || cases[0];
    const contactId = contactByPhone.get(contact.phone_number);
    if (!contactId || !caseItem) return [];
    return [
      {
        tenant_id: tenantId,
        contact_id: contactId,
        direction: "inbound",
        message_type: "text",
        content: `Oi, queria saber se teve novidade no processo ${caseItem.caseNumber}.`,
        message_id_from_evolution: `demo-wa-${contactIndex}-in-1`,
        status: "received",
        created_at: addDays(-(contactIndex + 2)),
        metadata: { demo_seed: DEMO_SEED_TAG, processo: caseItem.caseNumber, simulated: true },
      },
      {
        tenant_id: tenantId,
        contact_id: contactId,
        direction: "outbound",
        message_type: "text",
        content: `Oi, ${caseItem.clientName}. Vi aqui no MAYUS que houve uma movimentacao nova. Vou organizar a providencia e te retorno com o proximo passo validado.`,
        message_id_from_evolution: `demo-wa-${contactIndex}-out-1`,
        status: "sent",
        created_at: addDays(-(contactIndex + 1)),
        metadata: {
          demo_seed: DEMO_SEED_TAG,
          processo: caseItem.caseNumber,
          simulated: true,
          mayus_response: true,
        },
      },
    ];
  });

  if (messageRows.length > 0) {
    const { error: messagesError } = await supabase.from("whatsapp_messages").insert(messageRows);
    if (messagesError) throw messagesError;
  }

  return {
    contacts: contactRows.length,
    messages: messageRows.length,
  };
}

export async function resetDemoTenant(params: {
  tenantId: string;
  actorUserId: string;
  dryRun?: boolean;
  supabase?: SupabaseLike;
}): Promise<DemoResetResult> {
  const supabase = params.supabase || supabaseAdmin;
  const tenant = await assertDemoTenant(supabase, params.tenantId);
  const cases = buildDemoCaseSeeds();
  const preview = buildDemoResetPreview(cases);

  if (params.dryRun) {
    return {
      dryRun: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      preview,
      deleted: {
        processTasks: 0,
        userTasks: false,
        monitoredProcesses: false,
        movementInbox: false,
        oabCaches: false,
        oabMonitoramentos: false,
        oabsSalvas: false,
        whatsappContacts: 0,
        whatsappMessages: false,
      },
      inserted: {
        processPipeline: false,
        processStages: 0,
        processTasks: 0,
        documentMemories: 0,
        userTasks: 0,
        oabCaches: 0,
        oabMonitoramentos: 0,
        monitoredProcesses: 0,
        movementInbox: 0,
        whatsappContacts: 0,
        whatsappMessages: 0,
      },
    };
  }

  const pipelineId = await ensureDemoPipeline(supabase, tenant.id);
  const stagesByName = await ensureDemoStages(supabase, pipelineId);
  const deleted = await deleteExistingDemoData(supabase, tenant.id);

  const processRows = cases.map((item, index) => ({
    tenant_id: tenant.id,
    pipeline_id: pipelineId,
    stage_id: stagesByName.get(item.stageName),
    title: item.title,
    client_name: item.clientName,
    description: item.description,
    position_index: index,
    value: item.value,
    tags: item.tags,
    sector: item.legalArea,
    source: `${DEMO_SEED_TAG}:${item.code}`,
    processo_1grau: item.caseNumber,
    demanda: item.demand,
    andamento_1grau: item.currentPhase,
    orgao_julgador: item.court,
    reu: item.defendant,
    valor_causa: item.value,
    lead_scoring: item.score,
    data_ultima_movimentacao: addDays(-(index % 30)),
    drive_structure_ready: false,
    drive_folder_id: null,
    drive_link: null,
  }));

  const { data: insertedProcesses, error: processInsertError } = await supabase
    .from("process_tasks")
    .insert(processRows)
    .select("id, source");

  if (processInsertError) throw processInsertError;

  const processBySource = new Map((insertedProcesses || []).map((item: any) => [String(item.source), String(item.id)]));
  const memoryRows = cases.map((item) => ({
    tenant_id: tenant.id,
    process_task_id: processBySource.get(`${DEMO_SEED_TAG}:${item.code}`),
    drive_folder_id: null,
    drive_folder_url: null,
    drive_folder_name: `Acervo ${item.clientName} - ${item.legalArea}`,
    folder_structure: {
      demo_seed: DEMO_SEED_TAG,
      folders: ["01-Documentos do Cliente", "02-Pecas", "03-Provas", "04-Decisoes"],
      ready_for_demo_drive_account: true,
    },
    document_count: item.isHero ? 9 + (Number(item.code.slice(-3)) % 6) : 2 + (Number(item.code.slice(-3)) % 4),
    sync_status: "completed",
    last_synced_at: addDays(-1),
    summary_master: `${item.title}: ${item.description}`,
    key_facts: item.keyFacts,
    key_documents: item.isHero
      ? [
          { name: "Inicial sintetica.pdf", document_type: "peticao_inicial", source: "demo" },
          { name: "Documentos pessoais.pdf", document_type: "documento_cliente", source: "demo" },
          { name: "Comprovantes principais.pdf", document_type: "prova", source: "demo" },
        ]
      : [{ name: "Resumo documental.pdf", document_type: "resumo", source: "demo" }],
    missing_documents: item.missingDocuments,
    current_phase: item.currentPhase,
  })).filter((item) => item.process_task_id);

  const { error: memoryInsertError } = await supabase
    .from("process_document_memory")
    .insert(memoryRows);
  if (memoryInsertError) throw memoryInsertError;

  const taskRows = cases.slice(0, 36).map((item) => ({
    tenant_id: tenant.id,
    title: item.nextTask.title,
    description: `Tarefa sintetica do demo para ${item.title}.`,
    created_by: params.actorUserId,
    created_by_agent: "mayus_demo_reset",
    source_table: DEMO_SEED_TAG,
    source_id: item.code,
    urgency: item.nextTask.urgency,
    status: "Pendente",
    scheduled_for: addDays(item.nextTask.daysFromNow),
    is_critical: item.nextTask.urgency === "URGENTE",
    category: "demo",
    type: item.nextTask.type,
    client_name: item.clientName,
  }));

  const { error: taskInsertError } = await supabase
    .from("user_tasks")
    .insert(taskRows);
  if (taskInsertError) throw taskInsertError;

  const oabSeed = await seedDemoOabAndCache(supabase, tenant.id, cases);
  const monitoredCount = await seedDemoMonitoredProcesses(supabase, tenant.id, cases, processBySource);
  const movementInboxCount = await seedDemoMovementInbox(supabase, tenant.id, cases);
  const whatsappSeed = await seedDemoWhatsapp(supabase, tenant.id, cases);

  await supabase.from("system_event_logs").insert({
    tenant_id: tenant.id,
    user_id: params.actorUserId,
    event_name: "demo_tenant_reset",
    source: "admin_demo_reset",
    status: "completed",
    payload: {
      demo_seed: DEMO_SEED_TAG,
      total_cases: cases.length,
      hero_cases: preview.heroCases,
      volume_cases: preview.volumeCases,
      oab_demo: `${DEMO_OAB_ESTADO}/${DEMO_OAB_NUMERO}`,
      whatsapp_contacts: whatsappSeed.contacts,
      external_side_effects_blocked: true,
    },
  });

  return {
    dryRun: false,
    tenantId: tenant.id,
    tenantName: tenant.name,
    preview,
    deleted,
    inserted: {
      processPipeline: true,
      processStages: STAGE_DEFINITIONS.length,
      processTasks: processRows.length,
      documentMemories: memoryRows.length,
      userTasks: taskRows.length,
      oabCaches: oabSeed.cacheRows,
      oabMonitoramentos: oabSeed.monitoramentos,
      monitoredProcesses: monitoredCount,
      movementInbox: movementInboxCount,
      whatsappContacts: whatsappSeed.contacts,
      whatsappMessages: whatsappSeed.messages,
    },
  };
}
