import { describe, expect, it } from "vitest";

import {
  buildTenantOperationalMethodologyContext,
  findTenantOperationalAreaMethod,
  summarizeTenantOperationalMethodologyContext,
} from "./tenant-operational-methodology";
import type { OfficeOperationalMethodology } from "./office-setup-conversation";

function makeMethodology(overrides: Partial<OfficeOperationalMethodology> = {}): OfficeOperationalMethodology {
  return {
    status: "approved",
    identity: {
      office_name: "Dutra Advocacia",
      practice_areas: ["Bancario/RMC", "Previdenciario"],
      ideal_client: "Aposentados com desconto indevido",
      unique_value_proposition: "Atendimento consultivo com prova documental",
      value_pillars: ["clareza", "seguranca"],
      anti_client_signals: ["quer promessa de resultado"],
      communication_tone: "curto e consultivo",
      forbidden_claims: ["nunca prometer ganho"],
    },
    intake: {
      methodology_base_used: false,
      rules: ["perguntar origem do desconto"],
      required_documents_by_case: ["RG", "Comprovante de residencia"],
      human_handoff_rules: ["risco juridico chama humano"],
      response_sla: "1 hora",
      missing_information_policy: "pedir uma informacao por vez",
    },
    case_flow: {
      phases: [
        {
          name: "Triagem",
          owner_team: "comercial",
          advance_criteria: "documentos minimos recebidos",
          block_criteria: "sem autorizacao do cliente",
        },
      ],
      departments: ["comercial", "juridico"],
      permission_policy: "socio aprova contrato",
      calendar_policy: "consulta sugerida, confirmacao humana",
      finance_policy: "cobrancas supervisionadas",
    },
    area_methods: [
      {
        area: "Bancario/RMC",
        intake_questions: ["qual banco?", "qual desconto?"],
        required_documents: ["Contrato", "Extrato", "Contracheque"],
        phases: ["Entrevista", "Documentos", "Analise", "Proposta"],
        document_structure: ["01-Contrato", "02-Extratos"],
        owner_team: "juridico",
        validation_status: "validated",
        next_review_question: "Confirmar fluxo RMC.",
      },
    ],
    improvement_rules: [
      {
        id: "rule-1",
        title: "Validar documentos RMC",
        suggestion: "Pedir contrato e contracheque antes de proposta.",
        status: "pending",
        source: "office_interview",
        requires_approval: true,
      },
    ],
    internet_policy: {
      enabled: true,
      allowed_sources: ["tribunais", "gov.br"],
      required_citation_fields: ["fonte", "link", "data"],
      usage: "sugerir revisao, nunca ativar regra sozinho",
      sensitive_data_policy: "nao enviar dados de cliente",
      no_auto_activation: true,
    },
    updated_at: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("tenant operational methodology context", () => {
  it("normaliza metodologia aprovada como contexto interno ativo do tenant", () => {
    const context = buildTenantOperationalMethodologyContext(makeMethodology());

    expect(context.status).toBe("approved");
    expect(context.activation).toBe("active_internal");
    expect(context.canGuideInternalDecisions).toBe(true);
    expect(context.source).toBe("tenant_settings.ai_features.operational_methodology");
    expect(context.practiceAreas).toEqual(["Bancario/RMC", "Previdenciario"]);
    expect(context.defaultRequiredDocuments).toEqual(["RG", "Comprovante de residencia"]);
    expect(context.areaMethods[0]).toEqual(expect.objectContaining({
      area: "Bancario/RMC",
      requiredDocuments: ["Contrato", "Extrato", "Contracheque"],
      phases: ["Entrevista", "Documentos", "Analise", "Proposta"],
      validationStatus: "validated",
    }));
    expect(context.pendingImprovementRules).toHaveLength(1);
    expect(context.reviewReasons).toEqual(["methodology_improvement_requires_approval"]);
  });

  it("mantem draft/recommended como sugestao supervisionada e exige revisao humana", () => {
    const context = buildTenantOperationalMethodologyContext(makeMethodology({
      status: "recommended",
      intake: {
        ...makeMethodology().intake,
        methodology_base_used: true,
      },
      area_methods: [
        {
          ...makeMethodology().area_methods[0],
          validation_status: "needs_area_review",
        },
      ],
    }));

    expect(context.activation).toBe("supervised_suggestion");
    expect(context.canGuideInternalDecisions).toBe(false);
    expect(context.requiresHumanReview).toBe(true);
    expect(context.reviewReasons).toEqual(expect.arrayContaining([
      "methodology_recommended_not_approved",
      "methodology_base_requires_tenant_validation",
      "area_methods_need_review",
    ]));
  });

  it("nao mantem trava da metodologia base quando o dono aprovou a metodologia", () => {
    const context = buildTenantOperationalMethodologyContext(makeMethodology({
      status: "approved",
      intake: {
        ...makeMethodology().intake,
        methodology_base_used: true,
      },
      improvement_rules: [],
    }));

    expect(context.activation).toBe("active_internal");
    expect(context.canGuideInternalDecisions).toBe(true);
    expect(context.requiresHumanReview).toBe(false);
    expect(context.reviewReasons).not.toContain("methodology_base_requires_tenant_validation");
  });

  it("localiza metodo de area com normalizacao e resume o contexto sem aprendizado global", () => {
    const context = buildTenantOperationalMethodologyContext(makeMethodology());

    expect(findTenantOperationalAreaMethod(context, "rmc")).toEqual(expect.objectContaining({
      area: "Bancario/RMC",
    }));

    const summary = summarizeTenantOperationalMethodologyContext(context, {
      area: "bancario",
    });

    expect(summary).toContain("status=approved");
    expect(summary).toContain("area_metodo=Bancario/RMC");
    expect(summary).toContain("documentos=Contrato, Extrato, Contracheque");
    expect(summary).not.toMatch(/global|todos os escrit/i);
  });

  it("retorna contexto missing quando nao ha metodologia do tenant", () => {
    const context = buildTenantOperationalMethodologyContext(null);

    expect(context.status).toBe("missing");
    expect(context.activation).toBe("missing");
    expect(context.canGuideInternalDecisions).toBe(false);
    expect(context.reviewReasons).toEqual(["operational_methodology_missing"]);
    expect(summarizeTenantOperationalMethodologyContext(context)).toBe("");
  });
});
