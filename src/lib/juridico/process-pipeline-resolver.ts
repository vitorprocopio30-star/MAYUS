export type ProcessPipelineRecord = {
  id: string;
  name?: string | null;
};

export type ProcessStageRecord = {
  id: string;
  name?: string | null;
  order_index?: number | null;
};

export type ProcessTaskPipelineContext = {
  pipeline_id?: string | null;
  title?: string | null;
  description?: string | null;
  client_name?: string | null;
};

type SupabaseLike = {
  from(table: string): any;
};

export type ResolveProcessPipelineInput = {
  supabase: SupabaseLike;
  tenantId: string;
  linkedTaskId?: string | null;
  processNumber?: string | null;
};

export type ProcessPipelineResolution = {
  pipelineId: string | null;
  linkedTaskContext: ProcessTaskPipelineContext | null;
  stages: ProcessStageRecord[];
  visibleStages: ProcessStageRecord[];
  fallbackStageId: string | null;
};

export function normalizeLegalStageName(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeLegalSignal(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMovementStage(name?: string | null) {
  return normalizeLegalStageName(name).includes("movimentac");
}

export function scoreLegalPipelineName(name?: string | null) {
  const normalized = normalizeLegalStageName(name);
  let score = 0;
  if (normalized.includes("controle juridico")) score += 6;
  if (normalized.includes("jurid")) score += 4;
  if (normalized.includes("processo")) score += 2;
  if (normalized.includes("crm")) score -= 3;
  if (normalized.includes("venda")) score -= 2;
  return score;
}

export function chooseFallbackLegalStage(stages: ProcessStageRecord[]): string | null {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const visibleStages = stages.filter((stage) => !isMovementStage(stage?.name));
  if (visibleStages.length === 0) return stages[0]?.id ?? null;

  const priorities = [
    "recolher documentos",
    "fazer inicial",
    "protocolar inicial",
    "contestacao",
    "contrarrazoes",
  ];

  for (const priority of priorities) {
    const match = visibleStages.find((stage) => normalizeLegalStageName(stage?.name).includes(priority));
    if (match?.id) return match.id;
  }

  return visibleStages[0]?.id ?? null;
}

export function chooseSemanticLegalStage(stages: ProcessStageRecord[], signals: string[]) {
  const visibleStages = (stages || []).filter((stage) => !isMovementStage(stage?.name));
  if (visibleStages.length === 0) return null;

  const context = normalizeLegalSignal(signals.join(" "));
  const rules = [
    { match: ["contrarrazo", "agravo"], stage: ["contrarrazoes de agravo", "contrarrazoes"] },
    { match: ["agravo"], stage: ["agravo de instrumento", "agravo"] },
    { match: ["replica"], stage: ["replica", "contrarrazoes"] },
    { match: ["contest"], stage: ["contestacao"] },
    { match: ["protocol"], stage: ["protocolar inicial", "protocolo"] },
    { match: ["inicial", "peticao"], stage: ["fazer inicial", "peticao inicial"] },
    { match: ["document", "diligenc"], stage: ["recolher documentos", "documentos"] },
    { match: ["sentenca", "embargos"], stage: ["embargos", "sentenca", "recursos"] },
    { match: ["sentenca"], stage: ["sentenca", "recursos"] },
    { match: ["recurso"], stage: ["recursos", "recurso"] },
    { match: ["audienc"], stage: ["audiencia", "instrução", "instrucao"] },
  ];

  for (const rule of rules) {
    if (!rule.match.every((item) => context.includes(item))) continue;
    const found = visibleStages.find((stage) => {
      const normalized = normalizeLegalStageName(stage?.name);
      return rule.stage.some((candidate) => normalized.includes(candidate));
    });
    if (found?.id) return found.id;
  }

  return null;
}

export async function resolveProcessPipelineContext(
  input: ResolveProcessPipelineInput
): Promise<ProcessPipelineResolution> {
  const { supabase, tenantId, linkedTaskId, processNumber } = input;
  let pipelineId: string | null = null;
  let linkedTaskContext: ProcessTaskPipelineContext | null = null;

  if (linkedTaskId) {
    const { data: linkedTask } = await supabase
      .from("process_tasks")
      .select("pipeline_id, title, description, client_name")
      .eq("id", linkedTaskId)
      .maybeSingle();
    linkedTaskContext = linkedTask || null;
    pipelineId = linkedTask?.pipeline_id ?? null;
  }

  if (!pipelineId && processNumber) {
    const { data: taskByProcess } = await supabase
      .from("process_tasks")
      .select("pipeline_id")
      .eq("processo_1grau", processNumber)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    pipelineId = taskByProcess?.pipeline_id ?? null;
  }

  if (!pipelineId) {
    const { data: allPipelines } = await supabase
      .from("process_pipelines")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(50);

    const ranked = ((allPipelines || []) as ProcessPipelineRecord[])
      .map((pipeline) => ({ ...pipeline, score: scoreLegalPipelineName(pipeline.name) }))
      .sort((a, b) => b.score - a.score);

    pipelineId = ranked[0]?.id ?? null;
  }

  const { data: stages } = pipelineId
    ? await supabase
        .from("process_stages")
        .select("id, name, order_index")
        .eq("pipeline_id", pipelineId)
        .order("order_index", { ascending: true })
    : { data: [] as ProcessStageRecord[] };

  const normalizedStages = Array.isArray(stages) ? stages : [];
  const visibleStages = normalizedStages.filter((stage) => !isMovementStage(stage?.name));

  return {
    pipelineId,
    linkedTaskContext,
    stages: normalizedStages,
    visibleStages,
    fallbackStageId: chooseFallbackLegalStage(normalizedStages),
  };
}
