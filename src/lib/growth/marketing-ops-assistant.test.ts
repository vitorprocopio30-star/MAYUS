import { describe, expect, it } from "vitest";

import { buildMarketingOpsAssistantPlan } from "./marketing-ops-assistant";

const now = new Date("2026-04-28T12:00:00.000Z");

describe("buildMarketingOpsAssistantPlan", () => {
  it("monta visao operacional de marketing sem side effects", () => {
    const plan = buildMarketingOpsAssistantPlan({
      request: "Mayus, o que eu devo publicar esta semana?",
      now,
      state: {
        profile: {
          firmName: "MAYUS Advocacia",
          positioning: "Autoridade juridica premium",
          legalAreas: ["Previdenciario"],
          audiences: ["Segurados do INSS"],
          channels: ["linkedin"],
          voiceTone: "premium",
          websites: [],
          socialProfiles: [],
          admiredReferences: [],
          ethicsGuardrails: ["Nao prometer resultado juridico."],
        },
        calendar: [
          {
            id: "item-1",
            title: "Previdenciario: guia educativo",
            channel: "linkedin",
            legalArea: "Previdenciario",
            objective: "authority",
            tone: "premium",
            audience: "Segurados do INSS",
            angle: "guia educativo",
            guardrails: [],
            sourcePatternIds: [],
            date: "2026-04-30",
            status: "approved",
            notes: "",
          },
        ],
      },
      crmTasks: [
        { id: "crm-1", title: "Maria", description: "Lead novo sem combinado", created_at: "2026-04-25T10:00:00.000Z" },
      ],
    });

    expect(plan.mode).toBe("weekly_plan");
    expect(plan.thisWeek).toHaveLength(1);
    expect(plan.approvedWithoutTask).toHaveLength(1);
    expect(plan.leadsNeedingNextStep).toHaveLength(1);
    expect(plan.externalSideEffectsBlocked).toBe(true);
    expect(plan.humanApprovalRequired).toBe(true);
  });
});
