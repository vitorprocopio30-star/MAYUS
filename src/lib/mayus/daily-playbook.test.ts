import { describe, expect, it } from "vitest";

import {
  buildDailyPlaybook,
  buildDailyPlaybookMetadata,
  normalizeDailyPlaybookPreferences,
  registerDailyPlaybookBrainArtifact,
} from "./daily-playbook";

const now = new Date("2026-04-30T09:00:00.000Z");

describe("daily playbook", () => {
  it("normaliza preferencias configuraveis pelo usuario", () => {
    const preferences = normalizeDailyPlaybookPreferences({
      enabled: true,
      deliveryTime: "6:30",
      weekdays: [1, 1, 2, 8],
      channels: ["whatsapp", "mayus_panel"],
      scope: "growth",
      detailLevel: "short",
    });

    expect(preferences.enabled).toBe(true);
    expect(preferences.deliveryTime).toBe("06:30");
    expect(preferences.weekdays).toEqual([1, 2]);
    expect(preferences.channels).toEqual(["whatsapp", "mayus_panel"]);
    expect(preferences.scope).toBe("growth");
    expect(preferences.detailLevel).toBe("short");
  });

  it("monta playbook diario com CRM, agenda e resumo WhatsApp sem side effects", () => {
    const playbook = buildDailyPlaybook({
      firmName: "Dutra Advocacia",
      now,
      preferences: {
        enabled: true,
        deliveryTime: "07:15",
        channels: ["whatsapp", "mayus_panel"],
        detailLevel: "standard",
      },
      crmTasks: [
        {
          id: "crm-1",
          title: "Maria Previdenciario",
          description: "Lead pediu ajuda com aposentadoria rural.",
          sector: "Previdenciario",
          assignedName: "Dutra",
          phone: "21999990000",
          created_at: "2026-04-29T10:00:00.000Z",
        },
      ],
      userTasks: [
        {
          id: "task-1",
          title: "Prazo de recurso INSS",
          urgency: "URGENTE",
          status: "Pendente",
          scheduled_for: "2026-04-30T13:00:00.000Z",
          assigned_name_snapshot: "Equipe Juridica",
        },
      ],
    });

    expect(playbook.title).toBe("Dutra Advocacia - Playbook do dia");
    expect(playbook.metrics.crmLeadsNeedingNextStep).toBe(1);
    expect(playbook.metrics.agendaCriticalTasks).toBe(1);
    expect(playbook.metrics.agendaTodayTasks).toBe(1);
    expect(playbook.priorityActions[0]).toMatchObject({
      area: "agenda",
      urgency: "critical",
      ownerLabel: "Equipe Juridica",
    });
    expect(playbook.crm.leadsNeedingNextStep[0].organizedObjective).toContain("qualificar Maria Previdenciario em Previdenciario");
    expect(playbook.whatsappSummary).toContain("*Dutra Advocacia: leitura operacional do dia*");
    expect(playbook.whatsappSummary).toContain("*Radar rapido*");
    expect(playbook.whatsappSummary).toContain("Minha ordem de ataque");
    expect(playbook.whatsappSummary).toContain("Nada foi enviado ou executado fora do MAYUS");
    expect(playbook.reportMenu.map((item) => item.id)).toEqual(expect.arrayContaining(["executive", "crm", "frontdesk", "calls", "playbook"]));
    expect(playbook.htmlReport).toContain("<nav class=\"sidebar\">");
    expect(playbook.htmlReport).toContain("Front desk");
    expect(playbook.externalSideEffectsBlocked).toBe(true);
  });

  it("gera metadata segura para artifact/evento", () => {
    const playbook = buildDailyPlaybook({
      firmName: "Dutra Advocacia",
      now,
      crmTasks: [],
      userTasks: [],
    });

    const metadata = buildDailyPlaybookMetadata(playbook);

    expect(metadata.summary).toContain("operacao sem alerta prioritario");
    expect(metadata.html_report_available).toBe(true);
    expect(metadata.html_report_mime_type).toBe("text/html");
    expect(metadata.html_report).toContain("<!DOCTYPE html>");
    expect(metadata.report_menu).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "frontdesk" }),
      expect.objectContaining({ id: "calls" }),
    ]));
    expect(metadata.external_side_effects_blocked).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain("2199999");
  });

  it("gera briefing humano mesmo quando nao ha alerta prioritario", () => {
    const playbook = buildDailyPlaybook({
      firmName: "Dutra Advocacia",
      now,
      crmTasks: [],
      userTasks: [],
    });

    expect(playbook.whatsappSummary).toContain("nao encontrei nada pedindo sirene");
    expect(playbook.whatsappSummary).toContain("rotina limpa");
    expect(playbook.whatsappSummary).toContain("use a primeira janela do dia");
    expect(playbook.whatsappSummary).not.toContain("Acoes prioritarias:");
  });

  it("registra artifact e learning event do playbook", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const ids: Record<string, string> = {
      brain_tasks: "task-1",
      brain_runs: "run-1",
      brain_steps: "step-1",
      brain_artifacts: "artifact-1",
    };
    const supabase = {
      from: (table: string) => ({
        insert: (payload: any) => {
          inserts.push({ table, payload });

          if (table === "learning_events") return Promise.resolve({ error: null });

          return {
            select: () => ({
              single: async () => ({ data: { id: ids[table] }, error: null }),
            }),
          };
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const playbook = buildDailyPlaybook({
      firmName: "Dutra Advocacia",
      now,
      crmTasks: [],
      userTasks: [],
    });

    const trace = await registerDailyPlaybookBrainArtifact({
      tenantId: "tenant-1",
      userId: "user-1",
      playbook,
      supabase,
    });

    expect(trace).toEqual({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      artifactId: "artifact-1",
    });
    expect(inserts.some((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook")).toBe(true);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "daily_playbook_created")).toBe(true);
    expect(JSON.stringify(inserts)).not.toContain("2199999");
  });
});
