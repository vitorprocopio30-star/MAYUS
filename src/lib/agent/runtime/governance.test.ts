import { describe, expect, it } from "vitest";
import { buildMayusActivityEvent, evaluateMayusBudget, shouldWakeMayusRoutine } from "./governance";

describe("MAYUS runtime governance", () => {
  it("blocks paid work when a hard-stop budget would be exceeded", () => {
    const decision = evaluateMayusBudget({
      estimatedCostCents: 200,
      policies: [{
        id: "escavador",
        scope: "escavador",
        label: "Escavador",
        limitCents: 100,
        spentCents: 0,
        hardStop: true,
      }],
    });

    expect(decision.status).toBe("blocked");
    expect(decision.reasons[0]).toContain("ultrapassa");
  });

  it("warns when projected cost reaches the alert threshold", () => {
    const decision = evaluateMayusBudget({
      estimatedCostCents: 100,
      policies: [{
        id: "tenant",
        scope: "tenant",
        label: "Tenant",
        limitCents: 1000,
        spentCents: 700,
        warnAtRatio: 0.8,
      }],
    });

    expect(decision.status).toBe("warning");
  });

  it("redacts secrets from activity payloads", () => {
    const event = buildMayusActivityEvent({
      tenantId: "tenant-1",
      source: "runtime_governance",
      eventName: "agent_policy_checked",
      status: "ok",
      payload: {
        provider: "openrouter",
        api_key: "sk-secret",
        nested: { webhook_secret: "secret" },
      },
    });

    expect(JSON.stringify(event.payload)).not.toContain("sk-secret");
    expect(event.payload.api_key).toBe("[redacted]");
  });

  it("does not wake paused routines or budget-blocked routines", () => {
    expect(shouldWakeMayusRoutine({
      routine: {
        id: "r1",
        agentId: "monitoring",
        module: "monitoramento",
        enabled: true,
        paused: true,
        wakeReason: "daily check",
      },
    }).shouldWake).toBe(false);

    expect(shouldWakeMayusRoutine({
      routine: {
        id: "r2",
        agentId: "monitoring",
        module: "monitoramento",
        enabled: true,
        wakeReason: "daily check",
      },
      budgetDecision: {
        status: "blocked",
        projectedCents: 100,
        remainingCents: 0,
        reasons: ["budget blocked"],
      },
    }).shouldWake).toBe(false);
  });
});
