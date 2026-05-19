import { describe, expect, it } from "vitest";
import { buildAgenticReadinessReport } from "./readiness";
import type { TenantDoctorCheck } from "@/lib/setup/tenant-doctor";

describe("MAYUS agentic readiness", () => {
  it("groups tenant doctor checks into beta readiness modules", () => {
    const checks: TenantDoctorCheck[] = [
      { id: "tenant:record", category: "tenant", status: "ok", title: "Tenant", detail: "ok", autoFixable: false },
      { id: "agent:mayus_operating_partner", category: "skills", status: "ok", title: "Partner", detail: "ok", autoFixable: true },
      {
        id: "integration:escavador",
        category: "integrations",
        status: "blocked",
        title: "Escavador",
        detail: "sem chave",
        autoFixable: false,
        nextAction: "Conectar Escavador.",
      },
      {
        id: "commercial:sales_profile",
        category: "commercial",
        status: "warning",
        title: "Comercial",
        detail: "incompleto",
        autoFixable: false,
        nextAction: "Responder cliente ideal.",
      },
    ];

    const report = buildAgenticReadinessReport({ checks });

    expect(report.status).toBe("blocked");
    expect(report.modules.find((item) => item.id === "escavador")?.status).toBe("blocked");
    expect(report.modules.find((item) => item.id === "growth")?.status).toBe("warning");
    expect(report.pendingQuestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ question: "Conectar Escavador.", required: true }),
      expect.objectContaining({ question: "Responder cliente ideal.", required: false }),
    ]));
    expect(report.applicablePlan).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: "escavador", action: "connect_integration" }),
      expect.objectContaining({ module: "growth", action: "ask_owner" }),
    ]));
  });
});
