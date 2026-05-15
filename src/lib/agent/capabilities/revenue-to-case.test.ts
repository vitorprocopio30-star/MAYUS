import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/brain/artifacts", () => ({
  createBrainArtifact: vi.fn(),
}));

vi.mock("@/lib/agenda/userTasks", () => ({
  buildAgendaPayloadFromProcessTask: vi.fn(),
  syncAgendaTaskBySource: vi.fn(),
}));

vi.mock("@/lib/lex/case-brain-bootstrap", () => ({
  executeCaseBrainBootstrapFlow: vi.fn(),
}));

import {
  buildRevenueCaseOpeningReviewMetadata,
  buildRevenueToCaseNotificationPayload,
  evaluateRevenueToCasePolicy,
} from "./revenue-to-case";

describe("revenue-to-case policy", () => {
  it("bloqueia pagamento SaaS/plataforma para nao abrir caso juridico", () => {
    const policy = evaluateRevenueToCasePolicy({
      billingArtifact: {
        metadata: {
          source: "platform_subscription",
          cobranca_id: "pay-saas",
        },
      },
    });

    expect(policy).toEqual(expect.objectContaining({
      canOpenCase: false,
      reason: "tenant_billing",
      confidence: "high",
    }));
    expect(policy.nextBestAction).toContain("receita SaaS");
  });

  it("bloqueia cobranca sem CRM, area juridica ou intencao explicita", () => {
    const policy = evaluateRevenueToCasePolicy({
      billingArtifact: {
        metadata: {
          cobranca_id: "pay-ambiguous",
          nome_cliente: "Maria Silva",
          valor: 1500,
        },
      },
    });

    expect(policy).toEqual(expect.objectContaining({
      canOpenCase: false,
      reason: "case_context_missing",
      confidence: "low",
    }));
    expect(policy.nextBestAction).toContain("revisar manualmente");
  });

  it("permite abertura quando ha CRM ou area juridica suficiente", () => {
    const crmPolicy = evaluateRevenueToCasePolicy({
      billingArtifact: {
        metadata: {
          cobranca_id: "pay-crm",
          crm_task_id: "crm-1",
        },
      },
    });
    const legalAreaPolicy = evaluateRevenueToCasePolicy({
      billingArtifact: {
        metadata: {
          cobranca_id: "pay-area",
          legal_area: "Previdenciario",
        },
      },
    });

    expect(crmPolicy).toEqual(expect.objectContaining({
      canOpenCase: true,
      reason: "eligible",
      confidence: "high",
    }));
    expect(legalAreaPolicy).toEqual(expect.objectContaining({
      canOpenCase: true,
      reason: "eligible",
      confidence: "medium",
    }));
  });

  it("monta metadata de recuperacao supervisionada sem erro bruto", () => {
    const metadata = buildRevenueCaseOpeningReviewMetadata({
      paymentId: "pay-1",
      customerId: "cus-1",
      tenantId: "tenant-1",
      clientId: "client-1",
      billingArtifactId: "billing-1",
      reason: "case_opening_failed",
      failureStage: "post_case",
      policy: evaluateRevenueToCasePolicy({
        billingArtifact: { metadata: { crm_task_id: "crm-1" } },
      }),
    });

    expect(metadata).toEqual(expect.objectContaining({
      status: "failed",
      review_reason: "case_opening_failed",
      requires_human_action: true,
      external_side_effects_blocked: true,
      failure_stage: "post_case",
    }));
    expect(metadata.recovery_actions).toEqual(expect.arrayContaining([
      expect.stringContaining("case, process_task ou sale"),
    ]));
    expect(JSON.stringify(metadata)).not.toMatch(/service_role|api_key|sk_test|sk_live/i);
  });

  it("monta notificacao direcionada ao responsavel juridico", () => {
    const notification = buildRevenueToCaseNotificationPayload({
      status: "success",
      tenantId: "tenant-1",
      userId: "owner-1",
      clientName: "Maria Silva",
      paymentId: "pay-1",
      caseId: "case-1",
    });

    expect(notification).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      user_id: "owner-1",
      title: "Caso aberto por pagamento",
      type: "success",
      link_url: "/dashboard",
    }));
    expect(notification.message).toContain("pay-1");
    expect(notification.message.length).toBeLessThanOrEqual(180);
  });
});
