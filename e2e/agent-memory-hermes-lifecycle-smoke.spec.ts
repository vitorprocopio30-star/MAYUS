import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

function readLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {} as Record<string, string>;

  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function getSupabaseAdminConfig() {
  const localEnv = readLocalEnv();
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || localEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || localEnv.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
  };
}

test.describe("Agent memory Hermes lifecycle real API smoke", () => {
  const credentials = getPlaywrightCredentials();
  const adminConfig = getSupabaseAdminConfig();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar o smoke autenticado real.");
  test.skip(!adminConfig.url || !adminConfig.serviceRoleKey, "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para cleanup/validacao do smoke.");

  test("propoe lifecycle Hermes autenticado, persiste proposta supervisionada e limpa dados", async ({ page }) => {
    test.setTimeout(180_000);
    const supabase = createClient(adminConfig.url, adminConfig.serviceRoleKey, {
      auth: { persistSession: false },
    });
    const uniqueSlug = `hermes-e2e-${Date.now()}`;
    let proposalId: string | null = null;
    let tenantId: string | null = null;
    let lifecycleId: string | null = null;

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });

    try {
      const response = await page.request.post("/api/agent/memory", {
        data: {
          action: "propose_hermes_lifecycle",
          kind: "skill",
          slug: uniqueSlug,
          title: "Hermes E2E lifecycle",
          description: "Confirmar proximo passo sem repetir bearer_token=secret-e2e-token.",
          confidence: 82,
          payload: {
            api_key: "api-secret-e2e-value",
            phone: "+55 11 98888-7777",
            safe_note: "Smoke E2E supervisionado.",
          },
        },
      });

      expect(response.status()).toBe(201);
      const json = await response.json();
      proposalId = json.proposal?.id || null;
      tenantId = json.lifecycleEntry?.tenantId || null;
      lifecycleId = json.lifecycleEntry?.id || null;

      expect(json.proposal).toEqual(expect.objectContaining({
        key: `skill:${uniqueSlug}`,
        category: "hermes_skill_lifecycle",
        source: "hermes_lifecycle",
        confidence: 0.82,
        status: "proposed",
        promoted: false,
      }));
      expect(json.lifecycleEntry).toEqual(expect.objectContaining({
        kind: "skill",
        slug: uniqueSlug,
        status: "proposed",
        approvedBy: null,
      }));

      const serialized = JSON.stringify(json);
      expect(serialized).toContain("[redacted]");
      expect(serialized).toContain("[pii-redacted]");
      expect(serialized).not.toContain("api-secret-e2e-value");
      expect(serialized).not.toContain("secret-e2e-token");
      expect(serialized).not.toContain("98888-7777");
      expect(serialized).not.toContain("\"status\":\"approved\"");

      const { data: memoryRow, error: memoryError } = await supabase
        .from("brain_memories")
        .select("id, tenant_id, memory_key, memory_type, promoted, source, confidence")
        .eq("id", proposalId)
        .eq("tenant_id", tenantId)
        .single();

      expect(memoryError).toBeNull();
      expect(memoryRow).toEqual(expect.objectContaining({
        id: proposalId,
        tenant_id: tenantId,
        memory_key: `skill:${uniqueSlug}`,
        memory_type: "institutional_memory_proposal",
        promoted: false,
        source: "hermes_lifecycle",
      }));

      const { data: eventRows, error: eventError } = await supabase
        .from("learning_events")
        .select("id, event_type, source_module, payload")
        .eq("tenant_id", tenantId)
        .eq("event_type", "hermes_lifecycle_proposed")
        .contains("payload", { hermes_lifecycle_id: lifecycleId });

      expect(eventError).toBeNull();
      expect(eventRows?.length).toBeGreaterThan(0);
      expect(eventRows?.[0]).toEqual(expect.objectContaining({
        event_type: "hermes_lifecycle_proposed",
        source_module: "agent_memory",
      }));
    } finally {
      if (tenantId && lifecycleId) {
        await supabase
          .from("learning_events")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("event_type", "hermes_lifecycle_proposed")
          .contains("payload", { hermes_lifecycle_id: lifecycleId });
      }
      if (tenantId && proposalId) {
        await supabase
          .from("brain_memories")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("id", proposalId);
      }
    }
  });
});
