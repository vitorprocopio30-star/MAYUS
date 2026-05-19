import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

type RoutinePatternSummary = {
  patternKind?: string;
  skipped?: boolean;
};

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

function getSupabaseConfig() {
  const localEnv = readLocalEnv();
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || localEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || localEnv.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
  };
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function selfImprovementMemoryKey(patternKind: string) {
  return `self_improvement:${patternKind}`.slice(0, 120);
}

test.describe("Configuracoes > Memoria self-correction real loop smoke", () => {
  const credentials = getPlaywrightCredentials();
  const supabaseConfig = getSupabaseConfig();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar o smoke autenticado real.");
  test.skip(!supabaseConfig.url || !supabaseConfig.anonKey || !supabaseConfig.serviceRoleKey, "Configure Supabase URL, anon key e service role para rodar o smoke real com cleanup.");

  test("observa correcao falha, aprende proposta, aprova pela tela e aplica memoria institucional", async ({ page }) => {
    test.setTimeout(240_000);

    const adminSupabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
      auth: { persistSession: false },
    });
    const authSupabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const startedAt = new Date(Date.now() - 1000).toISOString();
    const uniqueReason = `e2e_correction_${Date.now()}`;
    const normalizedReason = normalizeToken(uniqueReason);
    const patternKind = `correction_failed_operating_partner_reply_repair_${normalizedReason}`;
    const expectedMemoryKey = selfImprovementMemoryKey(patternKind);
    const createdLearningEventIds: string[] = [];
    const createdMemoryKeys = new Set<string>([expectedMemoryKey]);
    let tenantId: string | null = null;
    let userId: string | null = null;
    let taskId: string | null = null;
    let proposalId: string | null = null;
    let promotedEntryId: string | null = null;

    const authResult = await authSupabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    expect(authResult.error).toBeNull();
    userId = authResult.data.user?.id || null;
    expect(userId).toBeTruthy();

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", userId)
      .single();

    expect(profileError).toBeNull();
    tenantId = profile?.tenant_id || null;
    expect(tenantId).toBeTruthy();

    try {
      const { data: insertedEvents, error: insertEventsError } = await adminSupabase
        .from("learning_events")
        .insert(Array.from({ length: 3 }, (_, index) => ({
          tenant_id: tenantId,
          event_type: "self_correction_failed",
          source_module: "self_correction_e2e",
          created_by: userId,
          payload: {
            correction_status: "failed",
            correction_kind: "operating_partner_reply_repair",
            risk_level: "low",
            reason: uniqueReason,
            recommended_action: "Escalar para revisao humana antes de nova aplicacao automatica.",
            external_side_effects_blocked: true,
            metadata: {
              e2e_label: uniqueReason,
              sequence: index + 1,
            },
          },
        })))
        .select("id");

      expect(insertEventsError).toBeNull();
      expect(insertedEvents).toHaveLength(3);
      insertedEvents?.forEach((event) => createdLearningEventIds.push(event.id));

      await loginThroughUi(page, { browserProfileMode: "ui-harness" });
      await page.goto("/dashboard/configuracoes/memoria", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/configuracoes\/memoria/);
      await expect(page.getByTestId("memory-self-improvement-review-now")).toBeVisible({ timeout: 60_000 });

      const routineResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/agent/routines") && response.request().method() === "POST",
      );

      await page.getByTestId("memory-self-improvement-review-now").click();
      const routineResponse = await routineResponsePromise;
      expect(routineResponse.status()).toBe(200);
      const routineJson = await routineResponse.json();
      taskId = routineJson.result?.brainTrace?.taskId || null;

      const patterns = routineJson.result?.executionResult?.self_improvement_review?.patternsDetected;
      if (Array.isArray(patterns)) {
        patterns
          .filter((pattern: RoutinePatternSummary) => pattern.patternKind && !pattern.skipped)
          .forEach((pattern: RoutinePatternSummary) => {
            createdMemoryKeys.add(selfImprovementMemoryKey(String(pattern.patternKind)));
          });
      }

      expect(routineJson.result?.executionResult?.self_improvement_review?.proposalsCreated).toBeGreaterThan(0);
      await expect(page.getByText(expectedMemoryKey).first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/Correcao sugerida pelo MAYUS/i).first()).toBeVisible();

      const { data: proposalRow, error: proposalError } = await adminSupabase
        .from("brain_memories")
        .select("id, memory_key, source, promoted, value")
        .eq("tenant_id", tenantId)
        .eq("memory_key", expectedMemoryKey)
        .eq("source", "self_improvement_loop")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(proposalError).toBeNull();
      expect(proposalRow).toEqual(expect.objectContaining({
        memory_key: expectedMemoryKey,
        source: "self_improvement_loop",
        promoted: false,
      }));
      expect(proposalRow?.value?.evidence).toEqual(expect.objectContaining({
        pattern_kind: patternKind,
        correction_kind: "operating_partner_reply_repair",
      }));

      proposalId = proposalRow?.id || null;
      expect(proposalId).toBeTruthy();

      const approveResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/agent/memory") && response.request().method() === "PATCH",
      );
      await page.getByTestId(`memory-proposal-approve-${proposalId}`).click();
      const approveResponse = await approveResponsePromise;
      expect(approveResponse.status()).toBe(200);
      const approveJson = await approveResponse.json();
      promotedEntryId = approveJson.entry?.id || null;
      await expect(page.getByTestId(`memory-proposal-${proposalId}`)).toBeHidden({ timeout: 60_000 });
      expect(promotedEntryId).toBeTruthy();
      await expect(page.getByTestId(`memory-entry-${promotedEntryId}`)).toBeVisible({ timeout: 60_000 });

      const { data: promotedEntry, error: promotedEntryError } = await adminSupabase
        .from("office_institutional_memory")
        .select("id, key, category, enforced, created_by")
        .eq("tenant_id", tenantId)
        .eq("id", promotedEntryId)
        .single();

      expect(promotedEntryError).toBeNull();
      expect(promotedEntry).toEqual(expect.objectContaining({
        key: expectedMemoryKey,
        category: "compliance",
        enforced: true,
        created_by: userId,
      }));
      const { data: approvedProposal, error: approvedProposalError } = await adminSupabase
        .from("brain_memories")
        .select("id, promoted, value")
        .eq("tenant_id", tenantId)
        .eq("id", proposalId)
        .single();

      expect(approvedProposalError).toBeNull();
      expect(approvedProposal).toEqual(expect.objectContaining({
        id: proposalId,
        promoted: true,
      }));
      expect(approvedProposal?.value).toEqual(expect.objectContaining({
        status: "approved",
        memory_entry_id: promotedEntryId,
      }));
    } finally {
      if (tenantId && promotedEntryId) {
        await adminSupabase
          .from("office_institutional_memory")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("id", promotedEntryId);
      }

      if (tenantId && userId) {
        await adminSupabase
          .from("office_institutional_memory")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("created_by", userId)
          .gte("created_at", startedAt)
          .in("key", Array.from(createdMemoryKeys));
      }

      if (tenantId && createdMemoryKeys.size > 0) {
        await adminSupabase
          .from("brain_memories")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("source", "self_improvement_loop")
          .in("memory_key", Array.from(createdMemoryKeys));
      }

      if (tenantId && createdLearningEventIds.length > 0) {
        await adminSupabase
          .from("learning_events")
          .delete()
          .eq("tenant_id", tenantId)
          .in("id", createdLearningEventIds);
      }

      if (tenantId && taskId) {
        await adminSupabase
          .from("learning_events")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("task_id", taskId);

        await adminSupabase
          .from("brain_tasks")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("id", taskId);
      }

      if (tenantId && userId) {
        await adminSupabase
          .from("learning_events")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("created_by", userId)
          .gte("created_at", startedAt)
          .in("event_type", ["memory_promotion_approved"])
          .contains("payload", { key: expectedMemoryKey });

        await adminSupabase
          .from("system_event_logs")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .eq("event_name", "agentic_routine_woken")
          .gte("created_at", startedAt)
          .contains("payload", { routineId: "mayus-self-improvement-review" });
      }
    }
  });
});
