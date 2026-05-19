import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsSafe: vi.fn(),
}));

import {
  MAYUS_AGENT_PROFILE_SURFACE_MATRIX,
  classifyMayusAgentProfileSurface,
  evaluateMayusAgentProfile,
  buildMayusAgentProfileExplanation,
} from "./agent-profiles";
import { decideMayusSkillAutonomy } from "./tenant-policy";

describe("MAYUS agent profiles", () => {
  it("lets restrictive profiles win over permissive policy configuration", () => {
    const decision = decideMayusSkillAutonomy({
      policy: {
        autonomy_mode: "auto_low_risk",
        module_modes: { client_service: "auto_low_risk" },
        tool_policy: { allow: ["*"], deny: [] },
        agent_profiles: {
          global: {
            allow: {
              agents: ["*"],
              modules: ["*"],
              channels: ["*"],
              tools: ["*"],
              surfaces: ["*"],
            },
          },
          agents: {
            openclaw: {
              deny: { surfaces: ["internal"] },
            },
          },
        },
      },
      skill: { name: "office_setup_status", handler_type: "internal", risk_level: "low" },
      agentId: "openclaw",
      module: "client_service",
      channel: "chat",
      toolName: "office_setup_status",
      surface: "internal",
    });

    expect(decision).toMatchObject({
      outcome: "blocked_needs_credentials",
      canExecuteNow: false,
    });
    expect(decision.profileDecision.blockedReason).toEqual(expect.objectContaining({
      code: "surface_denied",
      layer: "agent",
    }));
  });

  it("blocks denied tools", () => {
    const decision = evaluateMayusAgentProfile({
      profiles: {
        tenant: {
          deny: { tools: ["escavador_paid_search"] },
        },
      },
      agentId: "openclaw",
      module: "monitoring",
      tool: "escavador_paid_search",
      surface: "escavador_paid_search",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toEqual(expect.objectContaining({
      code: "tool_denied",
      layer: "tenant",
    }));
  });

  it("does not leak secrets in blocked reasons or explanations", () => {
    const decision = evaluateMayusAgentProfile({
      profiles: {
        tools: {
          "secret_tool": {
            enabled: false,
            blocked_reason: "Bloqueado por token sk-secret e service_role=super-hidden",
          },
        },
      },
      agentId: "openclaw",
      module: "internal",
      tool: "secret_tool",
      surface: "internal",
    });
    const explanation = buildMayusAgentProfileExplanation(decision);
    const serialized = JSON.stringify({ decision, explanation });

    expect(decision.allowed).toBe(false);
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("super-hidden");
    expect(serialized).toContain("[redacted-secret]");
  });

  it("classifies and exposes matrix entries for core MAYUS surfaces", () => {
    expect(classifyMayusAgentProfileSurface({ tool: "escavador_paid_search" })).toBe("escavador_paid_search");
    expect(classifyMayusAgentProfileSurface({ tool: "billing_create" })).toBe("financial");
    expect(classifyMayusAgentProfileSurface({ tool: "legal_first_draft_generate" })).toBe("legal_decision");
    expect(classifyMayusAgentProfileSurface({ tool: "whatsapp_send" })).toBe("external_message");
    expect(classifyMayusAgentProfileSurface({ tool: "office_setup_status" })).toBe("internal");

    expect(Object.keys(MAYUS_AGENT_PROFILE_SURFACE_MATRIX)).toEqual(expect.arrayContaining([
      "internal",
      "external_message",
      "financial",
      "legal_decision",
      "permission",
      "publication",
      "escavador_paid_search",
    ]));
  });
});
