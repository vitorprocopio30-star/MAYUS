import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppSalesMessage } from "@/lib/growth/whatsapp-sales-reply";

export type WhatsAppProcessStatusConfidence = "high" | "medium" | "low";

export type WhatsAppProcessPhase =
  | "triagem"
  | "documentacao"
  | "peticao_inicial"
  | "protocolo"
  | "aguardando_citacao"
  | "defesa_contestacao"
  | "replica"
  | "provas_instrucao"
  | "audiencia"
  | "sentenca"
  | "recurso"
  | "cumprimento_sentenca"
  | "acordo"
  | "arquivado"
  | "sem_fase_confiavel";

export type WhatsAppProcessStatusContext = {
  verified: boolean;
  confidence: WhatsAppProcessStatusConfidence;
  accessScope: "linked_contact" | "tenant_authorized";
  senderPhoneAuthorized: boolean;
  processTaskId: string | null;
  clientName: string | null;
  processNumber: string | null;
  title: string | null;
  currentStage: string | null;
  detectedPhase: WhatsAppProcessPhase;
  detectedPhaseLabel: string | null;
  lastMovementAt: string | null;
  lastMovementText: string | null;
  deadlineAt: string | null;
  pendingItems: string[];
  nextStep: string | null;
  riskFlags: string[];
  clientReply: string | null;
  candidateProcesses?: Array<{
    processTaskId: string | null;
    clientName: string | null;
    processNumber: string | null;
    title: string | null;
    opposingParty?: string | null;
    summary?: string | null;
    isIncident?: boolean;
    currentStage: string | null;
    lastMovementAt: string | null;
    lastMovementText?: string | null;
  }>;
  grounding: {
    factualSources: string[];
    inferenceNotes: string[];
    missingSignals: string[];
  };
};

type ProcessTaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  phone: string | null;
  client_name: string | null;
  process_number: string | null;
  processo_1grau: string | null;
  processo_2grau: string | null;
  andamento_1grau: string | null;
  andamento_2grau: string | null;
  orgao_julgador: string | null;
  tutela_urgencia: string | null;
  sentenca: string | null;
  prazo_fatal: string | null;
  liminar_deferida: boolean | null;
  data_ultima_movimentacao: string | null;
  tags: string[] | null;
  urgency: string | null;
  reu?: string | null;
  process_stages?: { name?: string | null } | null;
  source?: "process_tasks" | "monitored_processes" | "processos_cache";
  opposing_party?: string | null;
};

type MonitoredProcessRow = {
  id: string;
  numero_processo: string | null;
  tribunal: string | null;
  assunto: string | null;
  classe_processual: string | null;
  status: string | null;
  fase_atual: string | null;
  status_predito: string | null;
  cliente_nome: string | null;
  resumo_curto: string | null;
  ultima_movimentacao_texto: string | null;
  data_ultima_movimentacao: string | null;
  partes: unknown;
  envolvidos: unknown;
  raw_escavador: unknown;
};

type MovementInboxRow = {
  latest_data: string | null;
  latest_conteudo: string | null;
  latest_created_at: string | null;
  quantidade_eventos: number | null;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function phoneLookupCandidates(value?: string | null) {
  const phone = normalizePhone(value);
  if (!phone) return [] as string[];
  return Array.from(new Set([
    phone,
    phone.length > 11 ? phone.slice(-11) : null,
    phone.length > 9 ? phone.slice(-9) : null,
    phone.length > 8 ? phone.slice(-8) : null,
  ].filter(Boolean))) as string[];
}

function normalizeDocument(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean))) as string[];
}

function nameSearchCandidates(value?: string | null) {
  const text = cleanText(value);
  if (!text) return [] as string[];
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/).filter((word) => word.length >= 3 && !/^(da|de|do|das|dos|e)$/i.test(word));
  return uniqueStrings([
    text,
    normalized !== text ? normalized : null,
    words.length >= 3 ? words.join(" ") : null,
    words.length >= 2 ? `${words[0]} ${words[words.length - 1]}` : null,
    words[0] || null,
    words[words.length - 1] || null,
  ]).slice(0, 8);
}

function extractCnjs(value?: string | null) {
  return Array.from(String(value || "").matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)).map((match) => match[0]);
}

function extractSelectedProcessNumber(messages: WhatsAppSalesMessage[]) {
  const lastInbound = normalizeText(getLastInboundText(messages));
  if (!/^(o\s+)?(ultimo|último|ultima|última|esse|essa|isso|este|esta|primeiro|segundo|terceiro|1|2|3)\.?$/.test(lastInbound)) return null;
  const previousText = previousMessages(messages).map((message) => message.content || "").join("\n");
  const numbers = extractCnjs(previousText);
  if (!numbers.length) return null;
  if (/^(o\s+)?(ultimo|último|ultima|última|esse|essa|isso|este|esta)$/.test(lastInbound)) return numbers[numbers.length - 1];
  if (/primeiro|^1$/.test(lastInbound)) return numbers[0] || null;
  if (/segundo|^2$/.test(lastInbound)) return numbers[1] || null;
  if (/terceiro|^3$/.test(lastInbound)) return numbers[2] || null;
  return null;
}

function escapeFilterValue(value: string) {
  return value.replace(/[,()]/g, " ").trim();
}

function nameTokens(value?: string | null) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !/^(da|de|do|das|dos|e)$/.test(word));
}

function scoreProcessTaskNameMatch(task: ProcessTaskRow, reference?: string | null) {
  const tokens = nameTokens(reference);
  if (!tokens.length) return 0;
  const clientText = normalizeText(task.client_name);
  const titleText = normalizeText(task.title);
  const descriptionText = normalizeText(task.description);
  const haystack = `${clientText} ${titleText} ${descriptionText} ${normalizeText(String(task.tags?.join(" ") || ""))}`;
  let score = 0;
  for (const token of tokens) {
    if (clientText.includes(token)) score += 4;
    else if (titleText.includes(token)) score += 3;
    else if (descriptionText.includes(token)) score += 1;
  }
  if (clientText === tokens.join(" ")) score += 8;
  if (tokens.every((token) => haystack.includes(token))) score += 6;
  return score;
}

function compactJsonText(value: unknown, limit = 2500) {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, limit);
  try {
    return JSON.stringify(value).slice(0, limit);
  } catch {
    return "";
  }
}

function pickValueFromObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const text = cleanText(String(record[key] || ""));
    if (text && !/^(null|undefined|—|-)$/.test(text)) return text;
  }
  return null;
}

function firstArrayName(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  for (const item of items) {
    const name = pickValueFromObject(item, ["nome", "name", "razao_social", "nome_normalizado"]);
    if (name) return name;
  }
  return null;
}

function pickPassiveParty(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return cleanText(String(record.polo_passivo || record.passivo || record.reu || record.requerido || ""));
}

function summarizeText(value?: string | null) {
  const text = cleanText(value);
  if (!text) return null;
  return text.split(" | ")[0]?.trim() || text;
}

function isIncidentProcess(row: ProcessTaskRow) {
  const processNumber = cleanText(row.process_number || row.processo_1grau || row.processo_2grau) || "";
  const text = normalizeText([row.title, row.description, row.process_stages?.name, ...(row.tags || [])].filter(Boolean).join(" "));
  return /\.0000$/.test(processNumber) || /agravo de instrumento|agravo/.test(text);
}

function normalizeMonitoredProcess(row: MonitoredProcessRow, source: ProcessTaskRow["source"] = "monitored_processes"): ProcessTaskRow {
  const partes = row.partes && typeof row.partes === "object" ? row.partes as Record<string, unknown> : {};
  const passive = pickPassiveParty(partes);
  const clientName = cleanText(row.cliente_nome)
    || cleanText(String(partes.polo_ativo || partes.ativo || ""))
    || firstArrayName(row.envolvidos)
    || null;
  const title = uniqueStrings([
    clientName,
    passive ? `x ${passive}` : row.assunto,
    row.tribunal,
  ]).join(" - ") || row.numero_processo || "Processo monitorado";
  const description = uniqueStrings([
    row.resumo_curto,
    row.assunto,
    row.classe_processual,
    compactJsonText(row.partes, 700),
    compactJsonText(row.envolvidos, 900),
    compactJsonText(row.raw_escavador, 1200),
  ]).join(" | ") || null;

  return {
    id: String(row.id || row.numero_processo || `monitorado-${Math.random()}`),
    title,
    description,
    phone: null,
    client_name: clientName,
    process_number: row.numero_processo,
    processo_1grau: row.numero_processo,
    processo_2grau: null,
    andamento_1grau: row.ultima_movimentacao_texto,
    andamento_2grau: null,
    orgao_julgador: row.tribunal,
    tutela_urgencia: null,
    sentenca: null,
    prazo_fatal: null,
    liminar_deferida: false,
    data_ultima_movimentacao: row.data_ultima_movimentacao,
    tags: uniqueStrings([row.status, row.assunto, row.classe_processual]).slice(0, 6),
    urgency: null,
    process_stages: { name: row.fase_atual || row.status_predito || row.status || null },
    source,
    opposing_party: passive,
  };
}

function normalizeCacheProcess(row: any): ProcessTaskRow {
  return normalizeMonitoredProcess({
    id: String(row.id || row.numero_processo || row.numero_cnj || row.escavador_id || "cache"),
    numero_processo: row.numero_processo || row.numero_cnj || null,
    tribunal: row.tribunal || null,
    assunto: row.assunto || null,
    classe_processual: row.classe_processual || null,
    status: row.status || null,
    fase_atual: row.fase_atual || row.fase || null,
    status_predito: row.status_predito || null,
    cliente_nome: row.cliente_nome || row.client_name || row.nome_cliente || null,
    resumo_curto: row.resumo_curto || row.ultima_movimentacao_resumo || null,
    ultima_movimentacao_texto: row.ultima_movimentacao_texto || row.ultima_movimentacao || null,
    data_ultima_movimentacao: row.data_ultima_movimentacao || row.ultima_movimentacao_data || null,
    partes: row.partes || { polo_ativo: row.polo_ativo, polo_passivo: row.polo_passivo },
    envolvidos: row.envolvidos || null,
    raw_escavador: row.raw_escavador || row,
  }, "processos_cache");
}

function dedupeProcessTasks(rows: ProcessTaskRow[]) {
  const seen = new Set<string>();
  const result: ProcessTaskRow[] = [];
  for (const row of rows) {
    const key = normalizeText(row.process_number || row.processo_1grau || row.processo_2grau || row.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function filterRowsByName(rows: ProcessTaskRow[], reference?: string | null) {
  const tokens = nameTokens(reference);
  if (!tokens.length) return rows;
  return rows.filter((row) => scoreProcessTaskNameMatch(row, reference) > 0);
}

function rankProcessTasksByName(tasks: ProcessTaskRow[], reference?: string | null) {
  if (!reference || tasks.length <= 1) return tasks;
  const ranked = tasks
    .map((task) => ({ task, score: scoreProcessTaskNameMatch(task, reference) }))
    .sort((a, b) => b.score - a.score);
  if (ranked[0]?.score > 0 && ranked[0].score > (ranked[1]?.score || 0)) return [ranked[0].task];
  return ranked.map((item) => item.task);
}

function getLastInboundText(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content))?.content || null;
}

function previousMessages(messages: WhatsAppSalesMessage[]) {
  const lastInboundIndex = [...messages].map((message, index) => ({ message, index })).reverse()
    .find((item) => item.message.direction === "inbound" && cleanText(item.message.content))?.index;
  return typeof lastInboundIndex === "number" ? messages.slice(0, lastInboundIndex) : messages;
}

function isPureGreetingText(value?: string | null) {
  return /^(oi|ola|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|boa)$/i.test(normalizeText(value));
}

function lastMessageLooksLikeName(value?: string | null) {
  const text = cleanText(value) || "";
  const normalized = normalizeText(text);
  if (!normalized || isPureGreetingText(text)) return false;
  if (/\d|@|processo|cnj|cpf|cnpj|boa noite|bom dia|boa tarde|oi|ola/.test(normalized)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 8 && words.every((word) => /^[A-Za-zÀ-ÿ'’-]{2,}$/.test(word));
}

function previousAskedForProcessIdentifier(messages: WhatsAppSalesMessage[]) {
  const previous = previousMessages(messages).slice(-6);
  const text = normalizeText(previous.map((message) => message.content || "").join(" "));
  return /processo|status|andamento|nome completo|cnj|numero do processo|cpf|cnpj|identificador|localizar com seguranca/.test(text);
}

export function isProcessStatusRequest(messages: WhatsAppSalesMessage[]) {
  const lastText = getLastInboundText(messages);
  if (isPureGreetingText(lastText)) return false;
  if (extractSelectedProcessNumber(messages)) return true;
  if (/nome completo\s+(?:e|é|eh)\s+/i.test(cleanText(lastText) || "") && previousAskedForProcessIdentifier(messages)) return true;
  if (lastMessageLooksLikeName(lastText) && previousAskedForProcessIdentifier(messages)) return true;
  const text = normalizeText(lastText);
  return /andamento|status|meu processo|meu caso|processos? d[aeo]|casos? d[aeo]|gostaria de saber (sobre |de )?(o |um )?processo|queria saber (sobre |de )?(o |um )?processo|saber (sobre |de )?(o |um )?processo|atualizacao do processo|atualizacao do caso|novidade no processo|numero do processo|cnj|movimentacao|movimentacao|qual fase|saiu decisao|teve novidade|processo andou/.test(text);
}

function isGenericProcessRequestWithoutReference(messages: WhatsAppSalesMessage[]) {
  const lastText = cleanText(getLastInboundText(messages)) || "";
  const text = normalizeText(lastText);
  if (!/processo|caso|andamento|status|atualizacao|novidade/.test(text)) return false;
  if (/\d{7}-\d{2}|cnj|cpf|cnpj|processos? d[aeo]\s+[a-z]{2,}|casos? d[aeo]\s+[a-z]{2,}|nome completo\s+(e|eh|é)/.test(text)) return false;
  if (lastMessageLooksLikeName(lastText)) return false;
  if (/^(o\s+)?(ultimo|último|ultima|última|esse|essa|isso|este|esta|primeiro|segundo|terceiro|1|2|3)\.?$/.test(text)) return false;
  return /um processo|sobre um processo|saber sobre um processo|gostaria de saber (sobre |de )?(o |um )?processo|queria saber (sobre |de )?(o |um )?processo/.test(text);
}

function extractProcessNumber(messages: WhatsAppSalesMessage[]) {
  const text = getLastInboundText(messages) || "";
  return text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || null;
}

function extractCpf(messages: WhatsAppSalesMessage[]) {
  const text = getLastInboundText(messages) || "";
  return normalizeDocument(text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/)?.[0]);
}

function extractProcessReference(messages: WhatsAppSalesMessage[]) {
  const text = cleanText(getLastInboundText(messages)) || "";
  const patterns = [
    /nome completo\s+(?:e|é|eh)\s+([^,.?!\n]{3,80})/i,
    /(?:meu nome|nome)\s+(?:e|é|eh)\s+([^,.?!\n]{3,80})/i,
    /processos?\s+d[aeo]\s+([^,.?!\n]{3,80})/i,
    /casos?\s+d[aeo]\s+([^,.?!\n]{3,80})/i,
    /cliente\s+([^,.?!\n]{3,80})/i,
    /refer[eê]ncia\s*[:\-]?\s*([^,.?!\n]{3,80})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1];
    if (match) return cleanText(match);
  }
  if (lastMessageLooksLikeName(text) && previousAskedForProcessIdentifier(messages)) return cleanText(text);
  return null;
}

function isDeadlineCritical(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  const days = (time - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 3;
}

function formatDateLabel(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

export function detectProcessPhase(input: {
  stageName?: string | null;
  andamento1?: string | null;
  andamento2?: string | null;
  sentence?: string | null;
  deadlineAt?: string | null;
  lastMovementText?: string | null;
  description?: string | null;
  tags?: string[] | null;
}) {
  const text = normalizeText([
    input.stageName,
    input.andamento1,
    input.andamento2,
    input.sentence,
    input.lastMovementText,
    input.description,
    ...(input.tags || []),
  ].filter(Boolean).join(" "));

  const rules: Array<{ phase: WhatsAppProcessPhase; label: string; confidence: number; pattern: RegExp; reason: string }> = [
    { phase: "cumprimento_sentenca", label: "cumprimento de sentença", confidence: 0.9, pattern: /cumprimento de sentenca|execucao|calculo|penhora|bloqueio sisba?jud/, reason: "há sinal de cumprimento/execução" },
    { phase: "recurso", label: "recurso", confidence: 0.88, pattern: /apelacao|recurso|contrarrazoes|agravo|embargos|segunda instancia|2 grau|tribunal/, reason: "há sinal de recurso ou tribunal" },
    { phase: "sentenca", label: "sentença", confidence: 0.9, pattern: /sentenca|sentenciad|julgad|procedente|improcedente|decisao final/, reason: "há sentença/decisão final registrada" },
    { phase: "audiencia", label: "audiência", confidence: 0.86, pattern: /audiencia|instrucao e julgamento|conciliacao/, reason: "há audiência ou ato de instrução" },
    { phase: "provas_instrucao", label: "provas/instrução", confidence: 0.82, pattern: /prova|pericia|testemunha|instrucao|documentos complementares/, reason: "há produção de provas ou instrução" },
    { phase: "replica", label: "réplica", confidence: 0.84, pattern: /replica|manifestacao sobre contestacao|impugnacao a contestacao|contestacao juntada|prazo de manifestacao/, reason: "há contestação ou prazo de manifestação" },
    { phase: "defesa_contestacao", label: "defesa/contestação", confidence: 0.82, pattern: /contestacao|defesa apresentada|prazo para defesa/, reason: "há sinal de defesa/contestação" },
    { phase: "aguardando_citacao", label: "aguardando citação", confidence: 0.8, pattern: /citacao|citar reu|aguardando citar|mandado de citacao/, reason: "há sinal de citação pendente" },
    { phase: "protocolo", label: "protocolo", confidence: 0.78, pattern: /protocolad|distribuid|ajuizad|processo distribuido/, reason: "há protocolo/distribuição" },
    { phase: "peticao_inicial", label: "petição inicial", confidence: 0.76, pattern: /peticao inicial|inicial|preparando acao|minuta inicial/, reason: "há sinal de petição inicial" },
    { phase: "documentacao", label: "documentação", confidence: 0.72, pattern: /documento|pendencia documental|contracheque|rg|cpf|comprovante/, reason: "há sinal de documentação pendente" },
    { phase: "acordo", label: "acordo", confidence: 0.86, pattern: /acordo|proposta de acordo|conciliacao exitosa/, reason: "há sinal de acordo" },
    { phase: "arquivado", label: "arquivado", confidence: 0.9, pattern: /arquivad|baixad|transitado em julgado.*arquiv/, reason: "há arquivamento/baixa" },
  ];

  const match = rules.find((rule) => rule.pattern.test(text));
  if (match) {
    return { phase: match.phase, label: match.label, confidence: match.confidence, reasons: [match.reason] };
  }

  if (input.stageName) {
    return { phase: "sem_fase_confiavel" as const, label: input.stageName, confidence: 0.55, reasons: ["fase inferida apenas pela etapa operacional"] };
  }

  return { phase: "sem_fase_confiavel" as const, label: null, confidence: 0.25, reasons: ["faltam sinais suficientes para fase confiável"] };
}

export function translateProcessStatusForClient(context: WhatsAppProcessStatusContext) {
  if (!context.verified) return null;

  const firstName = cleanText(context.clientName)?.split(/\s+/)[0] || null;
  const phase = context.detectedPhaseLabel || context.currentStage;
  const lastMovementDate = formatDateLabel(context.lastMovementAt);
  const lines = [
    firstName ? `Oi, ${firstName}. Verifiquei aqui com segurança.` : "Verifiquei aqui com segurança.",
    phase ? `Seu processo está na fase de ${phase}.` : null,
    context.lastMovementText
      ? `Última movimentação: ${context.lastMovementText}${lastMovementDate ? ` em ${lastMovementDate}` : ""}.`
      : lastMovementDate
        ? `A última atualização registrada foi em ${lastMovementDate}.`
        : null,
    context.nextStep ? `Próximo passo: ${context.nextStep}.` : "Próximo passo: acompanhar a próxima movimentação antes de qualquer conclusão.",
    context.pendingItems.length > 0
      ? `Pendência sua: ${context.pendingItems.join("; ")}.`
      : "No momento, não vi pendência sua registrada.",
  ].filter(Boolean);

  return lines.join("\n\n");
}

async function queryProcessTasks(params: {
  supabase: SupabaseClient;
  tenantId: string;
  processNumber?: string | null;
  phone?: string | null;
  clientName?: string | null;
}) {
  const found: ProcessTaskRow[] = [];
  try {
    const select = "id,title,description,phone,client_name,process_number,processo_1grau,processo_2grau,andamento_1grau,andamento_2grau,orgao_julgador,tutela_urgencia,sentenca,prazo_fatal,liminar_deferida,data_ultima_movimentacao,tags,urgency,reu,process_stages(name)";
    const base = () => params.supabase.from("process_tasks").select(select).eq("tenant_id", params.tenantId);

    if (params.processNumber) {
      const ref = params.processNumber.replace(/[,()]/g, " ").trim();
      const { data } = await base()
        .or(`process_number.eq.${ref},processo_1grau.eq.${ref},processo_2grau.eq.${ref},title.ilike.%${ref}%`)
        .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false })
        .limit(2);
      if (data?.length) found.push(...(data as ProcessTaskRow[]).map((row) => ({ ...row, opposing_party: row.reu || row.opposing_party || null, source: "process_tasks" as const })));
    }

    const phoneCandidates = phoneLookupCandidates(params.phone);
    if (phoneCandidates.length > 0) {
      const filters = phoneCandidates.flatMap((candidate) => [`phone.eq.${candidate}`, `phone.ilike.%${candidate}%`]).join(",");
      const { data } = await base()
        .or(filters)
        .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false })
        .limit(2);
      if (data?.length) found.push(...(data as ProcessTaskRow[]).map((row) => ({ ...row, opposing_party: row.reu || row.opposing_party || null, source: "process_tasks" as const })));
    }

    if (params.clientName) {
      const candidates = nameSearchCandidates(params.clientName).map(escapeFilterValue).filter(Boolean);
      const filters = candidates.flatMap((candidate) => [
        `client_name.ilike.%${candidate}%`,
        `title.ilike.%${candidate}%`,
        `description.ilike.%${candidate}%`,
      ]).join(",");
      const { data } = await base()
        .or(filters)
        .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false })
        .limit(8);
      if (data?.length) found.push(...(data as ProcessTaskRow[]).map((row) => ({ ...row, opposing_party: row.reu || row.opposing_party || null, source: "process_tasks" as const })));
    }
  } catch {
    // Continue with Escavador-backed local stores below.
  }

  try {
    const monitoredSelect = "id,numero_processo,tribunal,assunto,classe_processual,status,fase_atual,status_predito,cliente_nome,resumo_curto,ultima_movimentacao_texto,data_ultima_movimentacao,partes,envolvidos,raw_escavador";
    const base = () => params.supabase.from("monitored_processes").select(monitoredSelect).eq("tenant_id", params.tenantId);

    if (params.processNumber) {
      const ref = escapeFilterValue(params.processNumber);
      const { data } = await base().or(`numero_processo.eq.${ref},numero_processo.ilike.%${ref}%`).order("data_ultima_movimentacao", { ascending: false, nullsFirst: false }).limit(5);
      if (data?.length) found.push(...(data as MonitoredProcessRow[]).map((row) => normalizeMonitoredProcess(row)));
    }

    if (params.clientName) {
      const candidates = nameSearchCandidates(params.clientName).map(escapeFilterValue).filter(Boolean);
      const filters = candidates.flatMap((candidate) => [
        `cliente_nome.ilike.%${candidate}%`,
        `assunto.ilike.%${candidate}%`,
        `resumo_curto.ilike.%${candidate}%`,
        `ultima_movimentacao_texto.ilike.%${candidate}%`,
      ]).join(",");
      const { data } = await base().or(filters).order("data_ultima_movimentacao", { ascending: false, nullsFirst: false }).limit(20);
      if (data?.length) found.push(...(data as MonitoredProcessRow[]).map((row) => normalizeMonitoredProcess(row)));
    }
  } catch {
    // Missing table/columns should not block process_tasks results.
  }

  try {
    if (params.clientName || params.processNumber) {
      const { data } = await params.supabase
        .from("processos_cache")
        .select("processos")
        .eq("tenant_id", params.tenantId)
        .ilike("cache_key", "OAB_FULL:%")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(10);

      const cachedRows = (data || [])
        .flatMap((cache: any) => Array.isArray(cache?.processos) ? cache.processos : [])
        .map(normalizeCacheProcess);
      const byProcessNumber = params.processNumber
        ? cachedRows.filter((row) => normalizeText(row.process_number || row.processo_1grau).includes(normalizeText(params.processNumber)))
        : [];
      const byName = params.clientName ? filterRowsByName(cachedRows, params.clientName) : [];
      found.push(...byProcessNumber, ...byName);
    }
  } catch {
    // Cache is optional and must never trigger a paid Escavador lookup.
  }

  const ranked = params.clientName ? rankProcessTasksByName(dedupeProcessTasks(found), params.clientName) : dedupeProcessTasks(found);
  return ranked.slice(0, 5);
}

async function findClientByContact(params: { supabase: SupabaseClient; tenantId: string; phone?: string | null; cpf?: string | null; contactName?: string | null }) {
  try {
    const base = () => params.supabase.from("clients").select("name,phone,document").eq("tenant_id", params.tenantId);
    const document = normalizeDocument(params.cpf);
    if (document) {
      const { data } = await base().or(`document.eq.${document},document.ilike.%${document}%`).limit(1).maybeSingle<{ name: string | null; phone: string | null; document: string | null }>();
      if (data?.name) return data;
    }
    const phoneCandidates = phoneLookupCandidates(params.phone);
    if (phoneCandidates.length > 0) {
      const filters = phoneCandidates.flatMap((candidate) => [`phone.eq.${candidate}`, `phone.ilike.%${candidate}%`]).join(",");
      const { data } = await base().or(filters).limit(1).maybeSingle<{ name: string | null; phone: string | null; document: string | null }>();
      if (data?.name) return data;
    }
    if (params.contactName) {
      const { data } = await base().ilike("name", `%${params.contactName}%`).limit(1).maybeSingle<{ name: string | null; phone: string | null; document: string | null }>();
      if (data?.name) return data;
    }
  } catch {
    return null;
  }
  return null;
}

async function loadMovementInbox(params: { supabase: SupabaseClient; tenantId: string; processNumber?: string | null }) {
  if (!params.processNumber) return null;
  try {
    const { data } = await params.supabase
      .from("process_movimentacoes_inbox")
      .select("latest_data,latest_conteudo,latest_created_at,quantidade_eventos")
      .eq("tenant_id", params.tenantId)
      .eq("numero_cnj", params.processNumber)
      .maybeSingle<MovementInboxRow>();
    return data || null;
  } catch {
    return null;
  }
}

function processCandidates(rows: ProcessTaskRow[]) {
  return rows.slice(0, 5).map((row) => ({
    processTaskId: row.id || null,
    clientName: row.client_name || null,
    processNumber: row.process_number || row.processo_1grau || row.processo_2grau || null,
    title: row.title || null,
    opposingParty: row.opposing_party || null,
    summary: summarizeText(row.description) || null,
    isIncident: isIncidentProcess(row),
    currentStage: row.process_stages?.name || null,
    lastMovementAt: row.data_ultima_movimentacao || null,
    lastMovementText: cleanText(row.andamento_2grau) || cleanText(row.andamento_1grau) || null,
  }));
}

function buildFallbackContext(reason: string, params?: { senderPhoneAuthorized?: boolean; candidates?: ProcessTaskRow[] }) : WhatsAppProcessStatusContext {
  const senderPhoneAuthorized = params?.senderPhoneAuthorized === true;
  return {
    verified: false,
    confidence: "low",
    accessScope: senderPhoneAuthorized ? "tenant_authorized" : "linked_contact",
    senderPhoneAuthorized,
    processTaskId: null,
    clientName: null,
    processNumber: null,
    title: null,
    currentStage: null,
    detectedPhase: "sem_fase_confiavel",
    detectedPhaseLabel: null,
    lastMovementAt: null,
    lastMovementText: null,
    deadlineAt: null,
    pendingItems: [],
    nextStep: null,
    riskFlags: ["case_status_unverified"],
    clientReply: null,
    candidateProcesses: params?.candidates?.length ? processCandidates(params.candidates) : undefined,
    grounding: { factualSources: [], inferenceNotes: [], missingSignals: [reason] },
  };
}

async function loadBrainContextNotes(params: { supabase: SupabaseClient; tenantId: string; rows: ProcessTaskRow[]; clientName?: string | null }) {
  const references = uniqueStrings([
    params.clientName,
    ...params.rows.flatMap((row) => [row.client_name, row.process_number, row.processo_1grau, row.title]),
  ]).slice(0, 8);
  if (!references.length) return [] as string[];

  const filters = references.map((reference) => `title.ilike.%${escapeFilterValue(reference)}%`).join(",");
  try {
    const { data } = await params.supabase
      .from("brain_artifacts")
      .select("title,artifact_type,metadata,created_at")
      .eq("tenant_id", params.tenantId)
      .or(filters)
      .order("created_at", { ascending: false })
      .limit(8);
    return (data || []).map((artifact: any) => cleanText([
      artifact?.title,
      artifact?.artifact_type ? `tipo ${artifact.artifact_type}` : null,
      artifact?.metadata ? compactJsonText(artifact.metadata, 500) : null,
    ].filter(Boolean).join(" - "))).filter(Boolean) as string[];
  } catch {
    return [] as string[];
  }
}

async function buildClientProcessBriefingContext(params: {
  supabase: SupabaseClient;
  tenantId: string;
  senderPhoneAuthorized: boolean;
  rows: ProcessTaskRow[];
  clientName?: string | null;
  selectedProcessNumber?: string | null;
}) {
  const deduped = dedupeProcessTasks(params.rows);
  const selected = params.selectedProcessNumber
    ? deduped.filter((row) => normalizeText(row.process_number || row.processo_1grau || row.processo_2grau) === normalizeText(params.selectedProcessNumber))
    : [];
  const mainRows = deduped.filter((row) => !isIncidentProcess(row));
  const rowsForReply = selected.length ? selected : (mainRows.length ? mainRows : deduped);
  if (!rowsForReply.length) return null;
  const first = rowsForReply[0];
  const processNumber = first.process_number || first.processo_1grau || first.processo_2grau || null;
  const brainNotes = await loadBrainContextNotes({ supabase: params.supabase, tenantId: params.tenantId, rows: rowsForReply, clientName: params.clientName });
  const phase = detectProcessPhase({
    stageName: first.process_stages?.name,
    andamento1: first.andamento_1grau,
    andamento2: first.andamento_2grau,
    description: first.description,
    tags: first.tags,
  });
  const factualSources = uniqueStrings([
    "processos do cliente localizados por nome",
    rowsForReply.some((row) => row.source === "monitored_processes") ? "processos monitorados no Escavador" : null,
    rowsForReply.some((row) => row.source === "processos_cache") ? "cache local do Escavador" : null,
    rowsForReply.some((row) => cleanText(row.description)) ? "resumo processual salvo" : null,
    rowsForReply.some((row) => cleanText(row.andamento_1grau || row.andamento_2grau)) ? "último andamento registrado" : null,
    brainNotes.length ? "cérebro MAYUS" : null,
  ]);

  const context: WhatsAppProcessStatusContext = {
    verified: true,
    confidence: "high",
    accessScope: params.senderPhoneAuthorized ? "tenant_authorized" : "linked_contact",
    senderPhoneAuthorized: params.senderPhoneAuthorized,
    processTaskId: rowsForReply.length === 1 ? first.id : null,
    clientName: first.client_name || params.clientName || null,
    processNumber: rowsForReply.length === 1 ? processNumber : null,
    title: rowsForReply.length === 1 ? first.title : "Dossiê processual do cliente",
    currentStage: rowsForReply.length === 1 ? first.process_stages?.name || null : null,
    detectedPhase: phase.phase,
    detectedPhaseLabel: phase.label,
    lastMovementAt: rowsForReply.length === 1 ? first.data_ultima_movimentacao : null,
    lastMovementText: rowsForReply.length === 1 ? cleanText(first.andamento_2grau) || cleanText(first.andamento_1grau) : null,
    deadlineAt: rowsForReply.length === 1 ? first.prazo_fatal : null,
    pendingItems: [],
    nextStep: null,
    riskFlags: [],
    clientReply: null,
    candidateProcesses: processCandidates(rowsForReply),
    grounding: {
      factualSources,
      inferenceNotes: uniqueStrings([
        phase.reasons.join("; "),
        deduped.length !== rowsForReply.length ? "agravos/incidentes foram separados dos processos principais" : null,
        brainNotes.length ? "contexto complementar consultado no cérebro MAYUS" : null,
      ]),
      missingSignals: [],
    },
  };
  return context;
}

export async function fetchWhatsAppProcessStatusContext(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contact: { phone_number?: string | null; name?: string | null };
  messages: WhatsAppSalesMessage[];
  senderPhoneAuthorized?: boolean;
}): Promise<WhatsAppProcessStatusContext | null> {
  if (!isProcessStatusRequest(params.messages)) return null;

  const phone = normalizePhone(params.contact.phone_number);
  const senderPhoneAuthorized = params.senderPhoneAuthorized === true;
  const selectedProcessNumber = extractSelectedProcessNumber(params.messages);
  if (!selectedProcessNumber && isGenericProcessRequestWithoutReference(params.messages)) {
    return buildFallbackContext(senderPhoneAuthorized ? "authorized_process_access_needs_reference" : "process_access_needs_reference", { senderPhoneAuthorized });
  }
  const processNumberFromMessage = selectedProcessNumber || extractProcessNumber(params.messages);
  const cpf = extractCpf(params.messages);
  const explicitReference = extractProcessReference(params.messages);
  if (senderPhoneAuthorized && !processNumberFromMessage && !cpf && !explicitReference) {
    return buildFallbackContext("authorized_process_access_needs_reference", { senderPhoneAuthorized });
  }

  const client = await findClientByContact({
    supabase: params.supabase,
    tenantId: params.tenantId,
    phone: senderPhoneAuthorized ? null : phone,
    cpf,
    contactName: explicitReference || params.contact.name,
  });
  const processTasks = await queryProcessTasks({
    supabase: params.supabase,
    tenantId: params.tenantId,
    processNumber: processNumberFromMessage,
    phone: (explicitReference || senderPhoneAuthorized) ? null : phone || normalizePhone(client?.phone),
    clientName: explicitReference || client?.name || (!senderPhoneAuthorized ? params.contact.name : null) || null,
  });

  const briefingContext = await buildClientProcessBriefingContext({
    supabase: params.supabase,
    tenantId: params.tenantId,
    senderPhoneAuthorized,
    rows: processTasks,
    clientName: explicitReference || client?.name || (!senderPhoneAuthorized ? params.contact.name : null) || processTasks.find((row) => row.client_name)?.client_name || null,
    selectedProcessNumber,
  });
  const shouldUseBriefingContext = processTasks.length > 1
    || Boolean(selectedProcessNumber)
    || processTasks.some((row) => row.source === "monitored_processes" || row.source === "processos_cache");
  if (briefingContext && shouldUseBriefingContext) {
    return briefingContext;
  }

  if (processTasks.length !== 1) {
    return buildFallbackContext(processTasks.length > 1 ? "mais de um processo possivel" : "processo nao localizado", { senderPhoneAuthorized, candidates: processTasks });
  }

  const task = processTasks[0];
  const processNumber = task.process_number || task.processo_1grau || task.processo_2grau || processNumberFromMessage;
  const inbox = await loadMovementInbox({ supabase: params.supabase, tenantId: params.tenantId, processNumber });
  const stageName = task.process_stages?.name || null;
  const lastMovementText = cleanText(inbox?.latest_conteudo) || cleanText(task.andamento_2grau) || cleanText(task.andamento_1grau) || null;
  const lastMovementAt = inbox?.latest_data || inbox?.latest_created_at || task.data_ultima_movimentacao || null;
  const phase = detectProcessPhase({
    stageName,
    andamento1: task.andamento_1grau,
    andamento2: task.andamento_2grau,
    sentence: task.sentenca,
    deadlineAt: task.prazo_fatal,
    lastMovementText,
    description: task.description,
    tags: task.tags,
  });
  const pendingItems = uniqueStrings([
    /documento|pendencia|pendente/i.test(`${task.description || ""} ${lastMovementText || ""}`) ? "enviar/confirmar documento solicitado pela equipe" : null,
  ]).slice(0, 3);
  const nextStep = phase.phase === "replica"
    ? "a equipe revisar a defesa da outra parte e preparar a manifestação"
    : phase.phase === "sentenca"
      ? "a equipe avaliar a decisão e definir se cabe alguma medida"
      : phase.phase === "recurso"
        ? "acompanhar a análise do recurso pelo tribunal"
        : phase.phase === "aguardando_citacao"
          ? "aguardar a outra parte ser chamada oficialmente no processo"
          : null;
  const factualSources = uniqueStrings([
    stageName ? "etapa operacional do processo" : null,
    lastMovementText ? "último andamento registrado" : null,
    inbox?.latest_conteudo ? "inbox de movimentações processuais" : null,
    task.prazo_fatal ? "prazo fatal registrado" : null,
    processNumber ? "número do processo registrado" : null,
    task.source === "monitored_processes" ? "processo monitorado no Escavador" : null,
    task.source === "processos_cache" ? "cache local do Escavador" : null,
    task.client_name || client?.name ? "cliente vinculado ao processo" : null,
  ]);
  const riskFlags = uniqueStrings([
    task.liminar_deferida || /liminar|tutela|urgente/i.test(`${task.tutela_urgencia || ""} ${lastMovementText || ""}`) ? "legal_urgency" : null,
    isDeadlineCritical(task.prazo_fatal) ? "legal_urgency" : null,
    /audiencia|audiência/i.test(`${stageName || ""} ${lastMovementText || ""}`) ? "legal_urgency" : null,
  ]);
  const verified = factualSources.length >= 2 && Boolean(task.id);
  const context: WhatsAppProcessStatusContext = {
    verified,
    confidence: verified && phase.confidence >= 0.75 && lastMovementText ? "high" : verified ? "medium" : "low",
    accessScope: senderPhoneAuthorized ? "tenant_authorized" : "linked_contact",
    senderPhoneAuthorized,
    processTaskId: task.id,
    clientName: task.client_name || client?.name || params.contact.name || null,
    processNumber,
    title: task.title,
    currentStage: stageName,
    detectedPhase: phase.phase,
    detectedPhaseLabel: phase.label,
    lastMovementAt,
    lastMovementText,
    deadlineAt: task.prazo_fatal,
    pendingItems,
    nextStep,
    riskFlags,
    clientReply: null,
    candidateProcesses: processCandidates([task]),
    grounding: {
      factualSources,
      inferenceNotes: phase.reasons,
      missingSignals: uniqueStrings([
        !lastMovementText ? "último andamento claro" : null,
        !phase.label ? "fase processual confiável" : null,
        !nextStep ? "próximo passo específico" : null,
      ]),
    },
  };

  return context;
}
