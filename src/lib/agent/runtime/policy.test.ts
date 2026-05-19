import { describe, expect, it } from "vitest";
import { DEFAULT_MAYUS_AGENTIC_POLICY, decideMayusAutonomy } from "./policy";

describe("MAYUS agentic policy", () => {
  it("auto-executes only low-risk internal actions in auto_low_risk mode", () => {
    expect(decideMayusAutonomy({
      autonomyMode: "auto_low_risk",
      risk: "low",
      surface: "internal",
    })).toMatchObject({
      outcome: "auto_execute",
      canExecuteNow: true,
      requiresApproval: false,
    });
  });

  it("prepares artifacts in draft_only mode", () => {
    expect(decideMayusAutonomy({
      autonomyMode: "draft_only",
      risk: "low",
      surface: "internal",
    })).toMatchObject({
      outcome: "prepare_artifact",
      canExecuteNow: false,
    });
  });

  it("requires approval for sensitive external or paid actions", () => {
    expect(decideMayusAutonomy({
      autonomyMode: "auto_low_risk",
      risk: "low",
      surface: "escavador_paid_search",
      estimatedCostCents: 120,
    })).toMatchObject({
      outcome: "requires_approval",
      requiresApproval: true,
    });
  });

  it("falls back to supervised policy instead of denylisting unknown skills", () => {
    expect(decideMayusAutonomy({
      autonomyMode: DEFAULT_MAYUS_AGENTIC_POLICY.autonomy_mode,
      risk: "low",
      surface: "internal",
      toolName: "office_setup_status",
      toolPolicy: DEFAULT_MAYUS_AGENTIC_POLICY.tool_policy,
    })).toMatchObject({
      outcome: "prepare_artifact",
      canExecuteNow: false,
    });
  });

  it("blocks actions that need missing credentials", () => {
    expect(decideMayusAutonomy({
      autonomyMode: "supervised",
      risk: "medium",
      requiresCredential: true,
      hasCredential: false,
    })).toMatchObject({
      outcome: "blocked_needs_credentials",
      canExecuteNow: false,
    });
  });

  it("lets deny rules win over allow rules", () => {
    expect(decideMayusAutonomy({
      autonomyMode: "auto_low_risk",
      risk: "low",
      surface: "internal",
      toolName: "publish_external",
      toolPolicy: {
        allow: ["*"],
        deny: ["publish_external"],
      },
    })).toMatchObject({
      outcome: "blocked_needs_credentials",
    });
  });
});
