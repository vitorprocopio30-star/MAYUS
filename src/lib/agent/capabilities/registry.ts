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
const FINANCE_ROLES = [...EXECUTIVE_ROLES, "financeiro"];

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
    name: "marketing_copywriter",
    description: "Cria copy juridica responsavel por canal a partir de pauta, perfil e referencias como sinais, com variacoes, CTA, guardrails eticos e revisao humana obrigatoria.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "Pedido original do usuario." },
        content_id: { type: "string", description: "ID da pauta aprovada, quando conhecido." },
        content_title: { type: "string", description: "Titulo ou trecho da pauta." },
        legal_area: { type: "string", description: "Area juridica do conteudo." },
        channel: { type: "string", description: "Canal: LinkedIn, Instagram, blog, email ou WhatsApp." },
        objective: { type: "string", description: "Objetivo: awareness, authority, lead_generation, nurture ou retention." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_marketing_copywriter",
  },
  {
    name: "marketing_ops_assistant",
    description: "Opera Growth/Marketing por chat: resume calendario, conteudos aprovados, leads sem proximo passo e proximas acoes supervisionadas sem publicar ou enviar nada automaticamente.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "Pedido original do usuario." },
        legal_area: { type: "string", description: "Area juridica ou segmento de marketing." },
        channel: { type: "string", description: "Canal editorial: LinkedIn, Instagram, blog, email ou WhatsApp." },
        objective: { type: "string", description: "Objetivo de marketing ou crescimento." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_marketing_ops_assistant",
  },
  {
    name: "sales_profile_setup",
    description: "Auto-configura o perfil comercial do escritorio por bate-papo: cliente ideal, solucao, PUV, pilares e anti-cliente, gravando a base para o atendimento MAYUS.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        ideal_client: { type: "string", description: "Cliente ideal do escritorio." },
        core_solution: { type: "string", description: "Solucao central entregue ao cliente ideal." },
        unique_value_proposition: { type: "string", description: "PUV do escritorio, se ja existir." },
        value_pillars: { type: "array", items: { type: "string" }, description: "Tres pilares autorais que sustentam a PUV." },
        anti_client_signals: { type: "array", items: { type: "string" }, description: "Perfis de clientes que o escritorio deve evitar." },
        confirmation: { type: "string", description: "Confirmacao textual para validar e gravar o perfil." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_sales_profile_setup",
  },
  {
    name: "sales_consultation",
    description: "Investiga o lead em bate-papo consultivo pelo metodo DEF, ativa matriz de skills de excelencia, grava sinais comerciais, adapta atendimento, objecoes e proxima pergunta sem acao externa automatica.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        crm_task_id: { type: "string", description: "ID do card CRM do lead, se conhecido." },
        lead_name: { type: "string", description: "Nome do lead ou cliente." },
        legal_area: { type: "string", description: "Area juridica ou segmento." },
        pain: { type: "string", description: "Dor principal ou resumo do caso." },
        channel: { type: "string", description: "Canal de atendimento: WhatsApp, ligacao ou reuniao." },
        stage: { type: "string", description: "Fase comercial: descoberta, encantamento, fechamento ou recuperacao." },
        objective: { type: "string", description: "Objetivo do atendimento consultivo." },
        objection: { type: "string", description: "Objecao declarada pelo lead, se houver." },
        ticket_value: { type: "number", description: "Valor ou ticket comercial para ancoragem segura." },
        conversation_summary: { type: "string", description: "Resumo do historico da conversa." },
        office_ideal_client: { type: "string", description: "Cliente ideal do escritorio, quando o usuario MAYUS informar." },
        office_solution: { type: "string", description: "Solucao central que o escritorio entrega ao cliente ideal." },
        office_unique_value_proposition: { type: "string", description: "PUV do escritorio, se ja existir." },
        office_pillars: { type: "array", items: { type: "string" }, description: "Pilares autorais que sustentam a PUV." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_sales_consultation",
  },
  {
    name: "commercial_playbook_setup",
    description: "Cria ou adapta o playbook comercial do escritorio a partir de um modelo premium: atendimento DEF, primeiro atendimento MAYUS, fases SDR/closer, objecoes, treino de equipe e analise de call.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        firm_name: { type: "string", description: "Nome do escritorio." },
        legal_area: { type: "string", description: "Area juridica ou segmento." },
        ideal_client: { type: "string", description: "ICP ou cliente ideal." },
        core_solution: { type: "string", description: "Solucao central entregue ao cliente." },
        unique_value_proposition: { type: "string", description: "PUV do escritorio." },
        value_pillars: { type: "array", items: { type: "string" }, description: "Pilares comerciais do playbook." },
        template_flavor: { type: "string", description: "Modelo base: generic ou dutra_blindagem." },
        source_document: { type: "string", description: "Nome/resumo do documento usado como referencia." },
        notes: { type: "string", description: "Observacoes do usuario sobre adaptacao." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_commercial_playbook_setup",
  },
  {
    name: "lead_reactivation",
    description: "Cria plano supervisionado de reativacao de leads frios por segmento, com lista operacional, mensagens e aprovacao humana.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        legal_area: { type: "string", description: "Area juridica ou segmento principal." },
        segment: { type: "string", description: "Segmento comercial a reativar." },
        min_days_inactive: { type: "number", description: "Dias minimos sem interacao." },
        max_leads: { type: "number", description: "Limite de leads na lista operacional." },
        goal: { type: "string", description: "Objetivo da retomada." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_lead_reactivation",
  },
  {
    name: "client_acceptance_record",
    description: "Registra trilha auditavel de aceite do cliente para proposta, contrato, cobranca ou fechamento, sem executar acoes externas.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Nome do cliente." },
        crm_task_id: { type: "string", description: "ID do card CRM relacionado." },
        legal_area: { type: "string", description: "Area juridica." },
        acceptance_type: { type: "string", description: "Tipo de aceite: proposta, contrato, cobranca, pagamento ou fechamento." },
        acceptance_channel: { type: "string", description: "Canal em que o aceite foi recebido." },
        evidence_summary: { type: "string", description: "Resumo da evidencia do aceite." },
        amount: { type: "number", description: "Valor relacionado ao aceite, se houver." },
        accepted_at: { type: "string", description: "Data/hora do aceite." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "growth_client_acceptance_record",
  },
  {
    name: "external_action_preview",
    description: "Cria preview e checklist de aprovacao antes de acionar ZapSign, Asaas, WhatsApp ou outra integracao externa.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        action_type: { type: "string", description: "Acao externa pretendida: zapsign, contrato, asaas, cobranca, whatsapp." },
        client_name: { type: "string", description: "Nome do cliente ou lead." },
        legal_area: { type: "string", description: "Area juridica." },
        amount: { type: "number", description: "Valor da cobranca/proposta, se houver." },
        recipient_name: { type: "string", description: "Nome do destinatario/signatario." },
        recipient_email: { type: "string", description: "E-mail do signatario, usado apenas para validar preview." },
        crm_task_id: { type: "string", description: "ID do card CRM relacionado." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "growth_external_action_preview",
  },
  {
    name: "revenue_flow_plan",
    description: "Monta plano agentico supervisionado de proposta -> contrato -> cobranca -> abertura de caso, sem executar integracoes externas automaticamente.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        crm_task_id: { type: "string", description: "ID do card CRM da oportunidade." },
        client_name: { type: "string", description: "Nome do cliente." },
        legal_area: { type: "string", description: "Area juridica." },
        amount: { type: "number", description: "Valor comercial confirmado." },
        proposal_ready: { type: "boolean", description: "Se proposta ja esta pronta." },
        contract_ready: { type: "boolean", description: "Se contrato ja esta pronto." },
        billing_ready: { type: "boolean", description: "Se cobranca ja foi gerada." },
        payment_confirmed: { type: "boolean", description: "Se pagamento foi confirmado." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "growth_revenue_flow_plan",
  },
  {
    name: "lead_schedule",
    description: "Cria agendamento interno supervisionado para consulta, qualificacao ou retorno de lead, sem calendario externo automatico.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        crm_task_id: { type: "string", description: "ID do card CRM do lead, se conhecido." },
        lead_name: { type: "string", description: "Nome do lead, se nao houver CRM task." },
        legal_area: { type: "string", description: "Area juridica do lead." },
        pain: { type: "string", description: "Dor principal ou resumo do caso." },
        score: { type: "number", description: "Score comercial, se conhecido." },
        scheduled_for: { type: "string", description: "Data/hora ISO ou texto parseavel para o agendamento." },
        meeting_type: { type: "string", description: "Tipo: consulta, qualificacao ou retorno." },
        owner_id: { type: "string", description: "Responsavel interno pelo agendamento." },
        owner_name: { type: "string", description: "Nome snapshot do responsavel interno." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_lead_schedule",
  },
  {
    name: "lead_followup",
    description: "Monta cadencia supervisionada e mensagem sugerida para follow-up de lead, sem envio automatico externo.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        crm_task_id: { type: "string", description: "ID do card CRM do lead, se conhecido." },
        lead_name: { type: "string", description: "Nome do lead, se nao houver CRM task." },
        legal_area: { type: "string", description: "Area juridica do lead." },
        pain: { type: "string", description: "Dor principal ou resumo do caso." },
        score: { type: "number", description: "Score comercial, se conhecido." },
        goal: { type: "string", description: "Objetivo do follow-up." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_lead_followup",
  },
  {
    name: "lead_qualify",
    description: "Monta roteiro de qualificacao, documentos minimos, objecoes provaveis e proximo melhor movimento para um lead do CRM.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        crm_task_id: { type: "string", description: "ID do card CRM do lead, se conhecido." },
        lead_name: { type: "string", description: "Nome do lead, se nao houver CRM task." },
        legal_area: { type: "string", description: "Area juridica do lead." },
        pain: { type: "string", description: "Dor principal ou resumo do caso." },
        score: { type: "number", description: "Score comercial, se conhecido." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_lead_qualify",
  },
  {
    name: "lead_intake",
    description: "Captura e qualifica lead ou indicacao comercial, cria card CRM e registra artifact operacional no MAYUS.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do lead ou indicado." },
        phone: { type: "string", description: "Telefone/WhatsApp do lead, se informado." },
        email: { type: "string", description: "Email do lead, se informado." },
        origin: { type: "string", description: "Origem do lead: indicacao, Instagram, site, Google Ads etc." },
        channel: { type: "string", description: "Canal de entrada: WhatsApp, formulario, telefone etc." },
        legalArea: { type: "string", description: "Area juridica informada." },
        city: { type: "string", description: "Cidade do lead." },
        state: { type: "string", description: "UF do lead." },
        urgency: { type: "string", description: "Urgencia: low, medium, high, baixa, media ou alta." },
        pain: { type: "string", description: "Resumo da dor juridica/comercial." },
        notes: { type: "string", description: "Observacoes adicionais." },
        referredBy: { type: "string", description: "Quem indicou o lead, quando houver." },
        referralRelationship: { type: "string", description: "Vinculo com a pessoa que indicou." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: [],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "low",
    is_active: true,
    handler_type: "growth_lead_intake",
  },
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
        crm_task_id: { type: "string" },
        legal_area: { type: "string" },
        valor: { type: "number" },
        vencimento: { type: "string", description: "Data YYYY-MM-DD" },
        descricao: { type: "string" },
        billing_type: { type: "string", enum: ["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"] },
        parcelas: { type: "number" },
      },
      required: ["valor"],
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
    name: "collections_followup",
    description: "Monta plano supervisionado de cobranca/inadimplencia, separando atraso leve, inadimplencia e renegociacao, com mensagem sugerida, promessa de pagamento e proximo contato sem envio externo automatico.",
    version: "1.0",
    schema_version: "1",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Nome do cliente ou responsavel financeiro." },
        nome_cliente: { type: "string", description: "Alias para nome do cliente." },
        crm_task_id: { type: "string", description: "ID do card CRM relacionado, se houver." },
        billing_artifact_id: { type: "string", description: "ID do artifact asaas_billing relacionado, se houver." },
        financial_id: { type: "string", description: "ID do lancamento financeiro relacionado, se houver." },
        legal_area: { type: "string", description: "Area juridica ou frente do atendimento." },
        amount: { type: "number", description: "Valor pendente." },
        valor: { type: "number", description: "Alias para valor pendente." },
        days_overdue: { type: "number", description: "Dias em atraso." },
        due_date: { type: "string", description: "Vencimento original." },
        collection_stage: { type: "string", enum: ["light_overdue", "delinquency", "renegotiation"] },
        tone: { type: "string", description: "Tom desejado: firm, empathetic ou neutral." },
        channel: { type: "string", description: "Canal sugerido: whatsapp, phone ou email." },
        payment_promise_at: { type: "string", description: "Data prometida de pagamento, se o cliente informou." },
        next_contact_at: { type: "string", description: "Proximo contato combinado." },
        notes: { type: "string", description: "Contexto adicional da cobranca." },
      },
    },
    output_schema: { type: "object" },
    allowed_roles: FINANCE_ROLES,
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "medium",
    is_active: true,
    handler_type: "finance_collections_followup",
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
    name: "legal_process_mission_plan",
    description: "Monta uma missao agentica supervisionada para um processo, usando contexto juridico, memoria documental, minuta, fontes, confianca e proxima acao sem executar side effects automaticamente.",
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
    handler_type: "lex_process_mission_plan",
  },
  {
    name: "legal_process_mission_execute_next",
    description: "Executa o proximo passo seguro da missao agentica de um processo. Nesta fase, somente atualizacao de memoria documental pode rodar automaticamente; demais acoes ficam bloqueadas para supervisao.",
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
    handler_type: "lex_process_mission_execute_next",
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
        customer_id: { type: "string" },
        crm_task_id: { type: "string" },
        legal_area: { type: "string" },
        valor: { type: "number" },
        vencimento: { type: "string" },
        descricao: { type: "string" },
        billing_type: { type: "string", enum: ["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"] },
        parcelas: { type: "number" },
      },
      required: ["valor"],
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
