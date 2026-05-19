import type { TenantDoctorCheck } from "@/lib/setup/tenant-doctor";

export type AgenticReadinessStatus = "ready" | "warning" | "blocked";

export type AgenticReadinessModuleId =
  | "setup"
  | "operating_partner"
  | "ai_models"
  | "escavador"
  | "legal_ops"
  | "documents"
  | "client_service"
  | "growth"
  | "finance"
  | "integrations"
  | "security";

export type AgenticReadinessModule = {
  id: AgenticReadinessModuleId;
  label: string;
  status: AgenticReadinessStatus;
  score: number;
  summary: string;
  nextAction: string | null;
  blockingCheckIds: string[];
  warningCheckIds: string[];
};

export type AgenticSetupQuestion = {
  id: string;
  module: AgenticReadinessModuleId;
  question: string;
  required: boolean;
};

export type AgenticSetupPlanItem = {
  id: string;
  module: AgenticReadinessModuleId;
  title: string;
  action: "auto_fix" | "ask_owner" | "connect_integration" | "review_policy";
  requiresApproval: boolean;
  status: "ready" | "pending" | "blocked";
};

export type AgenticReadinessReport = {
  label: "Escritorio juridico AI First supervisionado";
  overallScore: number;
  status: AgenticReadinessStatus;
  nextBestAction: string | null;
  modules: AgenticReadinessModule[];
  pendingQuestions: AgenticSetupQuestion[];
  applicablePlan: AgenticSetupPlanItem[];
};

type BuildReadinessInput = {
  checks: TenantDoctorCheck[];
  aiFeatures?: Record<string, any> | null;
};

const MODULES: Array<{ id: AgenticReadinessModuleId; label: string; checkPrefixes: string[] }> = [
  { id: "setup", label: "Auto-configuracao", checkPrefixes: ["tenant:", "crm:", "skills:defaults"] },
  { id: "operating_partner", label: "Operating Partner", checkPrefixes: ["agent:mayus_operating_partner"] },
  { id: "ai_models", label: "BYOK e modelos", checkPrefixes: ["integration:openrouter", "integration:openai", "commercial:sales_llm_testbench"] },
  { id: "escavador", label: "Escavador controlado", checkPrefixes: ["integration:escavador", "agent:escavador_budget_policy"] },
  { id: "legal_ops", label: "Operacao juridica", checkPrefixes: ["office:knowledge_profile"] },
  { id: "documents", label: "Documentos", checkPrefixes: ["integration:google_drive", "office:knowledge_profile"] },
  { id: "client_service", label: "Atendimento", checkPrefixes: ["office:knowledge_profile", "agent:mayus_operating_partner"] },
  { id: "growth", label: "Growth e CRM", checkPrefixes: ["commercial:", "crm:"] },
  { id: "finance", label: "Financeiro", checkPrefixes: ["integration:asaas"] },
  { id: "integrations", label: "Integracoes", checkPrefixes: ["integration:"] },
  { id: "security", label: "Governanca e aprovacoes", checkPrefixes: ["agent:autonomy_policy"] },
];

const MODULE_WEIGHTS: Record<AgenticReadinessModuleId, number> = {
  setup: 12,
  operating_partner: 14,
  ai_models: 10,
  escavador: 10,
  legal_ops: 10,
  documents: 8,
  client_service: 8,
  growth: 8,
  finance: 6,
  integrations: 8,
  security: 6,
};

function checkMatchesPrefix(check: TenantDoctorCheck, prefix: string) {
  return prefix.endsWith(":") ? check.id.startsWith(prefix) : check.id === prefix || check.id.startsWith(`${prefix}:`);
}

function checksForModule(checks: TenantDoctorCheck[], prefixes: string[]) {
  return checks.filter((item) => prefixes.some((prefix) => checkMatchesPrefix(item, prefix)));
}

function scoreModule(checks: TenantDoctorCheck[]) {
  if (checks.length === 0) return 60;

  const scores = checks.map((item) => {
    if (item.status === "ok" || item.status === "fixed") return 100;
    if (item.status === "warning") return 58;
    return 18;
  });

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function statusFromChecks(checks: TenantDoctorCheck[]): AgenticReadinessStatus {
  if (checks.some((item) => item.status === "blocked")) return "blocked";
  if (checks.length === 0 || checks.some((item) => item.status === "warning")) return "warning";
  return "ready";
}

function buildQuestion(module: AgenticReadinessModuleId, check: TenantDoctorCheck): AgenticSetupQuestion | null {
  if (!check.nextAction) return null;
  return {
    id: `question:${check.id}`,
    module,
    question: check.nextAction,
    required: check.status === "blocked",
  };
}

function buildPlanItem(module: AgenticReadinessModuleId, check: TenantDoctorCheck): AgenticSetupPlanItem {
  const action = check.status === "blocked"
    ? "connect_integration"
    : check.autoFixable
      ? "auto_fix"
      : check.nextAction
        ? "ask_owner"
        : "review_policy";

  return {
    id: `plan:${check.id}`,
    module,
    title: check.title,
    action,
    requiresApproval: action !== "auto_fix",
    status: check.status === "blocked" ? "blocked" : check.status === "ok" || check.status === "fixed" ? "ready" : "pending",
  };
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildAgenticReadinessReport(input: BuildReadinessInput): AgenticReadinessReport {
  const modules = MODULES.map((module) => {
    const moduleChecks = checksForModule(input.checks, module.checkPrefixes);
    const blocking = moduleChecks.filter((item) => item.status === "blocked");
    const warnings = moduleChecks.filter((item) => item.status === "warning");
    const firstAction = [...blocking, ...warnings].find((item) => item.nextAction)?.nextAction || null;
    const status = statusFromChecks(moduleChecks);

    return {
      id: module.id,
      label: module.label,
      status,
      score: scoreModule(moduleChecks),
      summary: status === "ready"
        ? `${module.label} pronto para o beta supervisionado.`
        : status === "blocked"
          ? `${module.label} depende de acao humana ou credencial.`
          : `${module.label} tem pendencias que o MAYUS consegue organizar.`,
      nextAction: firstAction,
      blockingCheckIds: blocking.map((item) => item.id),
      warningCheckIds: warnings.map((item) => item.id),
    };
  });

  const weightedTotal = modules.reduce((sum, module) => sum + module.score * MODULE_WEIGHTS[module.id], 0);
  const totalWeight = modules.reduce((sum, module) => sum + MODULE_WEIGHTS[module.id], 0);
  const overallScore = Math.round(weightedTotal / totalWeight);
  const status = modules.some((module) => module.status === "blocked")
    ? "blocked"
    : modules.some((module) => module.status === "warning")
      ? "warning"
      : "ready";
  const firstBlockedOrWarning = modules.find((module) => module.status !== "ready");
  const pendingQuestions = uniqueById(modules.flatMap((module) => {
    const moduleChecks = checksForModule(input.checks, MODULES.find((item) => item.id === module.id)?.checkPrefixes || []);
    return moduleChecks.map((check) => buildQuestion(module.id, check)).filter((item): item is AgenticSetupQuestion => item !== null);
  }));
  const applicablePlan = uniqueById(modules.flatMap((module) => {
    const moduleChecks = checksForModule(input.checks, MODULES.find((item) => item.id === module.id)?.checkPrefixes || []);
    return moduleChecks
      .filter((check) => check.status !== "ok")
      .map((check) => buildPlanItem(module.id, check));
  }));

  return {
    label: "Escritorio juridico AI First supervisionado",
    overallScore,
    status,
    nextBestAction: firstBlockedOrWarning?.nextAction || firstBlockedOrWarning?.summary || null,
    modules,
    pendingQuestions,
    applicablePlan,
  };
}
