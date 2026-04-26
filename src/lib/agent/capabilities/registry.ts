import { createClient } from "@supabase/supabase-js";

export type AgentCapabilityRecord = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  version: string;
  schema_version: string;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  allowed_roles: string[] | null;
  allowed_channels: string[] | null;
  requires_human_confirmation: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  is_active: boolean;
  handler_type: string | null;
  created_at?: string;
  updated_at?: string;
};

type DefaultCapabilitySeed = Omit<
  AgentCapabilityRecord,
  "id" | "tenant_id" | "created_at" | "updated_at"
>;

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXECUTIVE_ROLES = ["admin", "administrador", "socio", "sócio", "mayus_admin"];

const SECURITY_FLOOR_SKILLS = {
  legal_artifact_publish_premium: {
    requires_human_confirmation: true,
    risk_level: "high" as const,
  },
};

function normalizeRole(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase();
}

function roleAllowed(userRole: string, allowedRoles: string[] | null | undefined) {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  const normalizedUserRole = normalizeRole(userRole);
  return allowedRoles.some((role) => normalizeRole(role) === normalizedUserRole);
}

function channelAllowed(channel: string, allowedChannels: string[] | null | undefined) {
  if (!allowedChannels || allowedChannels.length === 0) {
    return true;
  }

  return allowedChannels.includes(channel);
}

const DEFAULT_CAPABILITY_SEEDS: DefaultCapabilitySeed[] = [
  {
    name: "proposal_generate",
    description: "Gera proposta comercial interna do escritorio e projeta no CRM automaticamente.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        crm_task_id: { type: "string" },
        pipeline_id: { type: "string" },
        legal_area: { type: "string" },
        objective: { type: "string" },
        deliverables: { type: "string" },
        total_value: { type: "string" },
        entry_value: { type: "string" },
        installments: { type: "string" },
        payment_terms: { type: "string" },
        next_step: { type: "string" },
      },
      required: ["client_name"],
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "proposal_generate",
  },
  {
    name: "contract_generate",
    description: "Gera contrato comercial via ZapSign e retorna link de assinatura supervisionado.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        signer_name: { type: "string", description: "Nome do cliente que vai assinar." },
        signer_email: { type: "string", description: "Email do cliente para assinatura." },
      },
      required: ["signer_name", "signer_email"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "zapsign_contract",
  },
  {
    name: "billing_create",
    description: "Cria cobranca no Asaas com link de pagamento supervisionado.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        nome_cliente: { type: "string" },
        customer_id: { type: "string" },
        cpf_cnpj: { type: "string" },
        email: { type: "string" },
        valor: { type: "number" },
        vencimento: { type: "string", description: "Data YYYY-MM-DD" },
        descricao: { type: "string" },
      },
      required: ["valor", "vencimento"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "asaas_cobrar",
  },
  {
    name: "whatsapp_followup",
    description: "Envia follow-up comercial por WhatsApp de forma supervisionada.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        phone_number: { type: "string" },
        text: { type: "string" },
        audio_url: { type: "string" },
      },
      required: ["contact_id", "phone_number"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "whatsapp_send",
  },
  {
    name: "process_monitor_activate",
    description: "Ativa monitoramento processual supervisionado no Escavador.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        numero_cnj: { type: "string" },
        frequencia: { type: "string" },
      },
      required: ["numero_cnj"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "escavador_monitor",
  },
  {
    name: "whatsapp_process_query",
    description: "Consulta contexto processual para responder clientes no WhatsApp.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "whatsapp_process_query",
  },
  {
    name: "support_case_status",
    description: "Monta a resposta minima, curta e segura para atualizar cliente sobre status do caso, com handoff humano quando a base estiver fraca.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "lex_support_case_status",
  },
  {
    name: "escavador_consulta",
    description: "Consulta capa do processo no Escavador.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: { numero_cnj: { type: "string" } },
      required: ["numero_cnj"],
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "escavador_consulta",
  },
  {
    name: "escavador_cpf",
    description: "Busca processos por CPF ou CNPJ no Escavador.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: { cpf_cnpj: { type: "string" } },
      required: ["cpf_cnpj"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "escavador_cpf",
  },
  {
    name: "calculator",
    description: "Executa calculos matematicos seguros para suporte financeiro e honorarios.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: { expressao: { type: "string" } },
      required: ["expressao"],
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "calculator",
  },
  {
    name: "legal_case_context",
    description: "Consulta o contexto juridico consolidado de um processo, incluindo Case Brain, peca sugerida, pendencias documentais e status da primeira minuta.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "lex_case_context",
  },
  {
    name: "legal_first_draft_generate",
    description: "Gera ou atualiza a primeira minuta juridica sugerida pelo Case Brain para um processo especifico.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "lex_first_draft_generate",
  },
  {
    name: "legal_draft_workflow",
    description: "Aprova ou publica formalmente a versao atual da minuta juridica de um processo, com confirmacao humana obrigatoria.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        workflow_action: { type: "string", description: "Acao desejada: approve ou publish." },
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
        version_id: { type: "string", description: "ID da versao formal da minuta, se conhecido." },
        version_number: { type: "string", description: "Numero da versao formal da minuta, por exemplo 2." },
      },
      required: ["workflow_action"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "lex_draft_workflow",
  },
  {
    name: "legal_draft_review_guidance",
    description: "Revisa a versao atual da minuta juridica de um processo e devolve guidance objetivo antes de aprovar ou publicar.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
        version_id: { type: "string", description: "ID da versao formal da minuta, se conhecido." },
        version_number: { type: "string", description: "Numero da versao formal da minuta, por exemplo 2." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "lex_draft_review_guidance",
  },
  {
    name: "legal_draft_revision_loop",
    description: "Analisa a minuta juridica por secao, identifica os blocos mais fracos e monta um plano supervisionado de reforco antes da aprovacao.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
        version_id: { type: "string", description: "ID da versao formal da minuta, se conhecido." },
        version_number: { type: "string", description: "Numero da versao formal da minuta, por exemplo 2." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "lex_draft_revision_loop",
  },
  {
    name: "legal_artifact_publish_premium",
    description: "Publica o artifact juridico final em PDF no Drive do processo e registra a entrega premium da versao formal publicada.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
        version_id: { type: "string", description: "ID da versao formal da minuta, se conhecido." },
        version_number: { type: "string", description: "Numero da versao formal da minuta, por exemplo 2." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "lex_artifact_publish_premium",
  },
  {
    name: "legal_document_memory_refresh",
    description: "Sincroniza os documentos do processo no repositorio, atualiza a memoria documental e devolve o estado operacional do acervo juridico.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        process_task_id: { type: "string", description: "ID interno do processo, se conhecido." },
        process_number: { type: "string", description: "Numero do processo ou CNJ." },
        process_reference: { type: "string", description: "Nome do cliente, titulo do processo ou referencia textual do caso." },
        client_name: { type: "string", description: "Nome do cliente vinculado ao processo." },
        process_title: { type: "string", description: "Titulo do processo no board interno." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "lex_document_memory_refresh",
  },
  {
    name: "kanban_update",
    description: "Atualiza etapa e andamento de processo no Kanban supervisionado.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        numero_cnj: { type: "string" },
        andamento: { type: "string" },
        nova_etapa: { type: "string" },
      },
      required: ["numero_cnj", "andamento"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: true,
    handler_type: "kanban_update",
  },
  {
    name: "zapsign_contract",
    description: "Alias interno legado para geracao de contrato via ZapSign.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        signer_name: { type: "string" },
        signer_email: { type: "string" },
      },
      required: ["signer_name", "signer_email"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: false,
    handler_type: "zapsign_contract",
  },
  {
    name: "asaas_cobrar",
    description: "Alias interno legado para cobranca via Asaas.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        nome_cliente: { type: "string" },
        valor: { type: "number" },
        vencimento: { type: "string" },
      },
      required: ["valor", "vencimento"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: false,
    handler_type: "asaas_cobrar",
  },
  {
    name: "whatsapp_send",
    description: "Alias interno legado para envio supervisionado de WhatsApp.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        phone_number: { type: "string" },
        text: { type: "string" },
      },
      required: ["contact_id", "phone_number"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: false,
    handler_type: "whatsapp_send",
  },
  {
    name: "escavador_monitor",
    description: "Alias interno legado para ativacao de monitoramento no Escavador.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        numero_cnj: { type: "string" },
        frequencia: { type: "string" },
      },
      required: ["numero_cnj"],
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "high",
    is_active: false,
    handler_type: "escavador_monitor",
  },
  {
    name: "kanban_import_oab",
    description: "Alias legado bloqueado por politica de custo para importacao por OAB.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        oab_numero: { type: "string" },
        oab_estado: { type: "string" },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: EXECUTIVE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: true,
    risk_level: "critical",
    is_active: false,
    handler_type: "kanban_import_oab",
  },
];

export async function ensureDefaultAgentSkills(tenantId: string) {
  const { data: existing, error } = await serviceClient
    .from("agent_skills")
    .select("name, requires_human_confirmation, risk_level")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[capability-registry] load existing", error.message);
    return;
  }

  const existingNames = new Set((existing || []).map((item) => item.name));

  const floorSkillNames = Object.keys(SECURITY_FLOOR_SKILLS);
  for (const existingSkill of existing || []) {
    if (!floorSkillNames.includes(existingSkill.name)) continue;

    const floor = SECURITY_FLOOR_SKILLS[existingSkill.name as keyof typeof SECURITY_FLOOR_SKILLS];
    const { error: updateError } = await serviceClient
      .from("agent_skills")
      .update({
        requires_human_confirmation: floor.requires_human_confirmation,
        risk_level: floor.risk_level,
      })
      .eq("tenant_id", tenantId)
      .eq("name", existingSkill.name);

    if (updateError) {
      console.error("[capability-registry] enforce security floor", updateError.message);
    }
  }

  const rowsToInsert = DEFAULT_CAPABILITY_SEEDS
    .filter((seed) => !existingNames.has(seed.name))
    .map((seed) => ({
      tenant_id: tenantId,
      ...seed,
    }));

  if (rowsToInsert.length === 0) {
    return;
  }

  const { error: insertError } = await serviceClient
    .from("agent_skills")
    .insert(rowsToInsert);

  if (insertError) {
    console.error("[capability-registry] seed default skills", insertError.message);
  }
}

export async function fetchTenantAgentSkills(params: {
  tenantId: string;
  channel?: string;
  userRole?: string;
  activeOnly?: boolean;
}) {
  await ensureDefaultAgentSkills(params.tenantId);

  let query = serviceClient
    .from("agent_skills")
    .select("*")
    .eq("tenant_id", params.tenantId);

  if (params.activeOnly !== false) {
    query = query.eq("is_active", true);
  }

  if (params.channel) {
    query = query.contains("allowed_channels", [params.channel]);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error || !data) {
    if (error) {
      console.error("[capability-registry] fetch tenant skills", error.message);
    }
    return [] as AgentCapabilityRecord[];
  }

  return data.filter((skill) => {
    if (params.channel && !channelAllowed(params.channel, skill.allowed_channels)) {
      return false;
    }

    if (params.userRole && !roleAllowed(params.userRole, skill.allowed_roles)) {
      return false;
    }

    return true;
  }) as AgentCapabilityRecord[];
}

export async function fetchAgentSkillByName(params: {
  tenantId: string;
  name: string;
}) {
  await ensureDefaultAgentSkills(params.tenantId);

  const { data, error } = await serviceClient
    .from("agent_skills")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("name", params.name)
    .maybeSingle();

  if (error) {
    console.error("[capability-registry] fetch skill by name", error.message);
    return null;
  }

  return (data || null) as AgentCapabilityRecord | null;
}

export async function canExecuteAgentSkill(params: {
  tenantId: string;
  name: string;
  channel: string;
  userRole: string;
}) {
  const skill = await fetchAgentSkillByName({ tenantId: params.tenantId, name: params.name });
  if (!skill || !skill.is_active) {
    return { status: "not_found" as const, skill: null };
  }

  if (!channelAllowed(params.channel, skill.allowed_channels)) {
    return { status: "channel_not_allowed" as const, skill };
  }

  if (!roleAllowed(params.userRole, skill.allowed_roles)) {
    return { status: "permission_denied" as const, skill };
  }

  return { status: "allowed" as const, skill };
}
