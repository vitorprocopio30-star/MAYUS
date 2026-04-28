import { describe, expect, it } from "vitest";
import {
  buildLeadScheduleAgendaPayload,
  buildLeadScheduleArtifactMetadata,
  buildLeadSchedulePlan,
} from "./lead-scheduling";

describe("lead scheduling", () => {
  it("builds urgent supervised consultation for hot lead", () => {
    const plan = buildLeadSchedulePlan({
      leadName: "Maria Silva",
      legalArea: "Previdenciario",
      pain: "Negativa do INSS com prazo para recurso.",
      score: 84,
      scheduledFor: "2026-04-28T13:00:00.000Z",
    });

    expect(plan.urgency).toBe("URGENTE");
    expect(plan.meetingType).toBe("consultation");
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.preparationChecklist).toContain("Separar CNIS/carta do INSS, se houver.");
    expect(plan.confirmationMessage).toContain("Maria");
  });

  it("builds agenda payload without external calendar data", () => {
    const plan = buildLeadSchedulePlan({
      leadName: "Ana Lead",
      legalArea: "Trabalhista",
      pain: "Verbas rescisorias pendentes.",
      score: 62,
      scheduledFor: "2026-05-05T12:00:00.000Z",
      meetingType: "qualificacao",
    });
    const payload = buildLeadScheduleAgendaPayload({
      tenantId: "tenant-1",
      crmTaskId: "crm-task-1",
      userId: "user-1",
      ownerId: "sdr-1",
      ownerName: "SDR MAYUS",
      plan,
    });

    expect(payload).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      source_table: "growth_lead_schedule",
      source_id: "crm:crm-task-1",
      assigned_to: "sdr-1",
      type: "Agendamento",
      criado_por_ia: true,
      show_only_on_date: true,
    }));
    expect(JSON.stringify(payload)).not.toMatch(/google|calendar|oauth|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("builds safe artifact metadata", () => {
    const plan = buildLeadSchedulePlan({
      leadName: "Bianca Indicada",
      legalArea: "Familia",
      pain: "Revisao de alimentos.",
      scheduledFor: "2026-05-01T14:00:00.000Z",
      meetingType: "retorno",
    });
    const metadata = buildLeadScheduleArtifactMetadata({
      crmTaskId: "crm-task-2",
      agendaTaskId: "agenda-task-1",
      plan,
    });

    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-2",
      agenda_task_id: "agenda-task-1",
      lead_name: "Bianca Indicada",
      meeting_type: "return",
      requires_human_approval: true,
    }));
    expect(metadata.preparation_checklist).toContain("Confirmar se ha menor, audiencia ou decisao anterior.");
    expect(JSON.stringify(metadata)).not.toMatch(/phone|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
