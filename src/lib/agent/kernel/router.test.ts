import { describe, expect, it } from "vitest";
import { route } from "./router";

const baseContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  channel: "chat" as const,
  availableSkills: ["marketing_copywriter", "marketing_ops_assistant", "sales_profile_setup", "sales_consultation", "commercial_playbook_setup", "billing_create", "lead_reactivation", "client_acceptance_record", "external_action_preview", "revenue_flow_plan", "lead_schedule", "lead_followup", "lead_qualify", "lead_intake", "support_case_status", "legal_process_mission_plan", "legal_process_mission_execute_next", "legal_case_context", "legal_document_memory_refresh", "legal_first_draft_generate", "legal_draft_workflow", "legal_draft_review_guidance", "legal_draft_revision_loop", "legal_artifact_publish_premium", "query_process_status"],
};

describe("route - juridico MAYUS", () => {
  it("detecta copywriter juridico de marketing", () => {
    const result = route(
      "Mayus, crie uma copy para LinkedIn sobre Familia com objetivo lead_generation.",
      baseContext
    );

    expect(result.intent).toBe("marketing_copywriter");
    expect(result.entities).toEqual(expect.objectContaining({
      channel: "LinkedIn",
      legal_area: "Familia",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta operacao de marketing por chat", () => {
    const result = route(
      "Mayus, o que eu devo publicar esta semana no LinkedIn para Previdenciario?",
      baseContext
    );

    expect(result.intent).toBe("marketing_ops_assistant");
    expect(result.entities).toEqual(expect.objectContaining({
      channel: "LinkedIn",
      legal_area: "Previdenciario",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta atendimento consultivo de vendas pelo metodo DEF", () => {
    const result = route(
      "Mayus, crie um atendimento consultivo de vendas metodo DEF para lead Maria Silva area Previdenciario canal WhatsApp fase descoberta objecao achei caro valor 4500.",
      baseContext
    );

    expect(result.intent).toBe("sales_consultation");
    expect(result.entities).toEqual(expect.objectContaining({
      lead_name: "Maria Silva",
      legal_area: "Previdenciario",
      channel: "WhatsApp",
      stage: "descoberta",
      objection: "achei caro valor 4500",
      ticket_value: "4500",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta investigacao de posicionamento comercial do escritorio", () => {
    const result = route(
      "Mayus, investigue o cliente ideal do escritorio e monte a PUV se ainda nao tiver.",
      baseContext
    );

    expect(result.intent).toBe("sales_profile_setup");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta auto-configuracao comercial do MAYUS", () => {
    const result = route(
      "Mayus, configure a skill de vendas. Cliente ideal: empresarios com passivo trabalhista. Solucao central: reduzir risco em acordos. Pilares: Diagnostico | Prova | Negociacao. Pode salvar.",
      baseContext
    );

    expect(result.intent).toBe("sales_profile_setup");
    expect(result.entities).toEqual(expect.objectContaining({
      ideal_client: "empresarios com passivo trabalhista",
      core_solution: "reduzir risco em acordos",
      value_pillars: "Diagnostico | Prova | Negociacao",
      confirmation: "Pode salvar",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta criacao de playbook comercial a partir do documento Dutra", () => {
    const result = route(
      "Mayus, faca uma skill com esse documento gestao-comercial-dutra-advocacia.html para playbook comercial, primeiro atendimento e analise de call do Dutra.",
      baseContext
    );

    expect(result.intent).toBe("commercial_playbook_setup");
    expect(result.entities).toEqual(expect.objectContaining({
      source_document: "gestao-comercial-dutra-advocacia.html",
      template_flavor: "dutra",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta reativacao de leads frios por segmento", () => {
    const result = route(
      "Mayus, recupere leads frios de previdenciario ha 45 dias maximo 12 leads.",
      baseContext
    );

    expect(result.intent).toBe("lead_reactivation");
    expect(result.entities).toEqual(expect.objectContaining({
      legal_area: "previdenciario",
      min_days_inactive: "45",
      max_leads: "12",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta registro de aceite do cliente", () => {
    const result = route(
      "Registre o aceite da proposta cliente Maria Silva area Previdenciario valor 4500 por WhatsApp.",
      baseContext
    );

    expect(result.intent).toBe("client_acceptance_record");
    expect(result.entities).toEqual(expect.objectContaining({
      client_name: "Maria Silva",
      legal_area: "Previdenciario",
      acceptance_type: "proposta",
      acceptance_channel: "WhatsApp",
      amount: "4500",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta pedido de preview antes de acao externa", () => {
    const result = route(
      "Crie um preview antes de gerar contrato para cliente Maria Silva area Previdenciario email maria@example.com.",
      baseContext
    );

    expect(result.intent).toBe("external_action_preview");
    expect(result.entities).toEqual(expect.objectContaining({
      action_type: "contrato",
      client_name: "Maria Silva",
      legal_area: "Previdenciario",
      recipient_email: "maria@example.com",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta pedido de fluxo revenue-to-case supervisionado", () => {
    const result = route(
      "Monte o fluxo proposta -> contrato -> cobranca -> abertura de caso para cliente Maria Silva area Previdenciario valor 4500.",
      baseContext
    );

    expect(result.intent).toBe("revenue_flow_plan");
    expect(result.entities).toEqual(expect.objectContaining({
      client_name: "Maria Silva",
      legal_area: "Previdenciario",
      amount: "4500",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta cobranca agentica de entrada pelo chat", () => {
    const result = route(
      "Mayus, cobre a entrada da Maria Silva em R$ 1500 via PIX.",
      baseContext
    );

    expect(result.intent).toBe("billing_create");
    expect(result.entities).toEqual(expect.objectContaining({
      nome_cliente: "Maria Silva",
      valor: "1500",
      billing_type: "PIX",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detecta pedido de pix para cliente mesmo quando ainda falta valor", () => {
    const result = route(
      "Mayus, gerar PIX para cliente Carlos Souza.",
      baseContext
    );

    expect(result.intent).toBe("billing_create");
    expect(result.entities).toEqual(expect.objectContaining({
      nome_cliente: "Carlos Souza",
      billing_type: "PIX",
    }));
    expect(result.entities.valor).toBeUndefined();
  });

  it("detecta pedido de agendamento supervisionado de lead", () => {
    const result = route(
      "Agende consulta para lead Maria Silva area Previdenciario em 2026-04-28 10:00.",
      baseContext
    );

    expect(result.intent).toBe("lead_schedule");
    expect(result.entities).toEqual(expect.objectContaining({
      lead_name: "Maria Silva",
      legal_area: "Previdenciario",
      scheduled_for: "2026-04-28 10:00",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta pedido de follow-up supervisionado de lead", () => {
    const result = route(
      "Monte uma cadencia de follow-up do lead Maria Silva area Previdenciario dor negativa do INSS.",
      baseContext
    );

    expect(result.intent).toBe("lead_followup");
    expect(result.entities).toEqual(expect.objectContaining({
      lead_name: "Maria Silva",
      legal_area: "Previdenciario",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta pedido de qualificacao de lead", () => {
    const result = route(
      "Monte um roteiro de qualificacao do lead Maria Silva area Previdenciario dor negativa do INSS.",
      baseContext
    );

    expect(result.intent).toBe("lead_qualify");
    expect(result.entities).toEqual(expect.objectContaining({
      lead_name: "Maria Silva",
      legal_area: "Previdenciario",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detecta intake comercial de lead com dados minimos", () => {
    const result = route(
      "Registre novo lead: Maria Silva telefone (21) 99999-0000 area Previdenciario dor negativa do INSS sem resposta.",
      baseContext
    );

    expect(result.intent).toBe("lead_intake");
    expect(result.entities).toEqual(expect.objectContaining({
      name: "Maria Silva",
      phone: "(21) 99999-0000",
      legalArea: "Previdenciario",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detecta indicacao como lead_intake e preserva indicador", () => {
    const result = route(
      "Indicacao: lead Bianca Indicada telefone 21966665555 area Familia dor revisao de alimentos indicada por Pedro Cliente.",
      baseContext
    );

    expect(result.intent).toBe("lead_intake");
    expect(result.entities).toEqual(expect.objectContaining({
      name: "Bianca Indicada",
      referredBy: "Pedro Cliente",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detecta pedido de suporte para atualizar cliente sobre o caso", () => {
    const result = route(
      "O cliente perguntou como esta o caso 1234567-89.2024.8.26.0100. Me de um status curto para responder.",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("extrai nome do cliente em pedido de status do caso", () => {
    const result = route(
      "O cliente Maria da Silva perguntou como anda o caso. Me de uma resposta curta.",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ client_name: "Maria da Silva" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("extrai referencia textual em pedido de status do caso", () => {
    const result = route(
      "Preciso de status do caso: revisional banco exemplo para responder o cliente.",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ process_reference: "revisional banco exemplo para responder o cliente" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("roteia status direto de processo para suporte de caso", () => {
    const result = route(
      "Qual o status do processo 1234567-89.2024.8.26.0100?",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta consulta de contexto juridico e extrai o numero do processo", () => {
    const result = route(
      "Quero o contexto jurídico, a peça sugerida e o status da minuta do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_case_context");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido de plano de missao agentica processual", () => {
    const result = route(
      "Mayus, monte um plano agentico do processo 1234567-89.2024.8.26.0100 e diga a proxima acao segura.",
      baseContext
    );

    expect(result.intent).toBe("legal_process_mission_plan");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("roteia organizacao de missao processual em linguagem natural", () => {
    const result = route(
      "Mayus, organize a missao desse processo.",
      baseContext
    );

    expect(result.intent).toBe("legal_process_mission_plan");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("roteia pedido de proximo passo desse processo para plano de missao", () => {
    const result = route(
      "Mayus, veja o proximo passo desse processo.",
      baseContext
    );

    expect(result.intent).toBe("legal_process_mission_plan");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para executar proximo passo seguro da missao processual", () => {
    const result = route(
      "Mayus, execute o proximo passo seguro da missao do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_process_mission_execute_next");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("roteia execucao curta do proximo passo seguro", () => {
    const result = route(
      "Mayus, execute o proximo passo seguro.",
      baseContext
    );

    expect(result.intent).toBe("legal_process_mission_execute_next");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta execucao de proxima acao segura com acento e referencia textual", () => {
    const result = route(
      "Mayus, rode a próxima ação segura da missão do processo da Maria da Silva.",
      baseContext
    );

    expect(result.intent).toBe("legal_process_mission_execute_next");
    expect(result.entities).toEqual(expect.objectContaining({
      process_reference: "Maria da Silva",
    }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para gerar a primeira minuta juridica", () => {
    const result = route(
      "Pode gerar a primeira minuta do processo 1234567-89.2024.8.26.0100 pela Draft Factory?",
      baseContext
    );

    expect(result.intent).toBe("legal_first_draft_generate");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para aprovar a minuta formal do processo", () => {
    const result = route(
      "Pode aprovar a minuta V2 do processo 1234567-89.2024.8.26.0100?",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_workflow");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      workflow_action: "aprovar",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para publicar a minuta formal do processo", () => {
    const result = route(
      "Publique a minuta do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_workflow");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      workflow_action: "Publique",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido de revisao juridica orientada da minuta", () => {
    const result = route(
      "Revise a minuta V2 do processo 1234567-89.2024.8.26.0100 e me diga o que falta antes de aprovar.",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_review_guidance");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para sincronizar a memoria documental do processo", () => {
    const result = route(
      "Sincronize os documentos do processo 1234567-89.2024.8.26.0100 e atualize a memória documental.",
      baseContext
    );

    expect(result.intent).toBe("legal_document_memory_refresh");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para montar o loop supervisionado de revisao da minuta", () => {
    const result = route(
      "Melhore a minuta por seção e monte um plano de revisão da V2 do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_revision_loop");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para publicar o artifact premium final no drive", () => {
    const result = route(
      "Publique o artifact premium da versão 2 do processo 1234567-89.2024.8.26.0100 no Drive.",
      baseContext
    );

    expect(result.intent).toBe("legal_artifact_publish_premium");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });
});
