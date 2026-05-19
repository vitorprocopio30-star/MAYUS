import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

const OFFICE_SETUP_MEMORY_KEYS = [
  "tom_de_atendimento",
  "regras_de_triagem",
  "handoff_humano",
  "documentos_por_caso",
  "promessas_proibidas",
  "politica_de_preco",
  "sla_de_resposta",
  "politica_de_permissoes",
  "politica_de_agenda",
  "politica_financeira",
  "notas_de_playbook",
  "playbooks_por_area",
];

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

test.describe("Office setup conversation via Chat real API smoke", () => {
  const credentials = getPlaywrightCredentials();
  const supabaseConfig = getSupabaseConfig();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar o smoke autenticado real.");
  test.skip(!supabaseConfig.url || !supabaseConfig.anonKey || !supabaseConfig.serviceRoleKey, "Configure Supabase URL, anon key e service role para rodar o smoke com cleanup.");

  test("configura perfil operacional pelo chat deterministico e restaura tenant_settings", async ({ page }) => {
    test.setTimeout(180_000);
    const adminSupabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
      auth: { persistSession: false },
    });
    const authSupabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const officeName = `Escritorio E2E ${Date.now()}`;
    const startedAt = new Date().toISOString();
    let tenantId: string | null = null;
    let userId: string | null = null;
    let taskId: string | null = null;
    let runId: string | null = null;
    let stepId: string | null = null;
    let hadSettings = false;
    let originalAiFeatures: Record<string, unknown> | null = null;

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

    const { data: originalSettings, error: settingsError } = await adminSupabase
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    expect(settingsError).toBeNull();
    hadSettings = Boolean(originalSettings);
    originalAiFeatures = originalSettings?.ai_features && typeof originalSettings.ai_features === "object"
      ? originalSettings.ai_features as Record<string, unknown>
      : null;

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });

    try {
      taskId = randomUUID();
      runId = randomUUID();
      stepId = randomUUID();

      await adminSupabase.from("brain_tasks").insert({
        id: taskId,
        tenant_id: tenantId,
        created_by: userId,
        channel: "e2e",
        module: "setup",
        status: "executing",
        title: "Office setup E2E",
        goal: "Validar onboarding operacional pelo Chat MAYUS",
        task_input: { office_name: officeName },
        task_context: { source: "office_setup_chat_smoke" },
        policy_snapshot: { supervised: true },
        started_at: startedAt,
      });

      await adminSupabase.from("brain_runs").insert({
        id: runId,
        task_id: taskId,
        tenant_id: tenantId,
        attempt_number: 1,
        status: "executing",
        summary: "Office setup chat smoke",
        started_at: startedAt,
      });

      await adminSupabase.from("brain_steps").insert({
        id: stepId,
        task_id: taskId,
        run_id: runId,
        tenant_id: tenantId,
        order_index: 1,
        step_key: "office-setup-chat-smoke",
        title: "Configurar perfil operacional",
        step_type: "capability",
        capability_name: "office_setup_conversation",
        handler_type: "setup_office_profile_conversation",
        approval_policy: "auto_low_risk",
        status: "running",
        input_payload: { office_name: officeName },
      });

      const response = await page.request.post("/api/ai/chat", {
        data: {
          provider: "openrouter",
          message: [
            `Mayus, configure o escritorio. Nome do escritorio: ${officeName}.`,
            "Areas de atuacao: Bancario | Previdenciario.",
            "Tom: curto e consultivo.",
            "Triagem: perguntar cidade e se ja possui documentos.",
            "Handoff: urgencia juridica chama humano.",
            "Documentos: contrato, contracheque e RG.",
            "Promessas proibidas: nunca prometer ganho.",
            "Honorarios: nao falar valor sem humano aprovar.",
            "SLA: responder em ate 1 hora.",
            "Departamentos: comercial e juridico.",
            "Permissoes: socio aprova contrato, cobranca e envio externo.",
            "Agenda: consultas podem ser sugeridas, confirmacao externa precisa humano.",
            "Financeiro: cobrancas e renegociacoes ficam supervisionadas.",
            "Playbook: usar roteiro consultivo curto com proximo passo claro.",
            "Pode salvar.",
          ].join(" "),
          history: [],
          taskId,
          runId,
          stepId,
        },
      });

      expect(response.status()).toBe(200);
      const json = await response.json();

      expect(json.kernel).toEqual(expect.objectContaining({
        status: "executed",
        capabilityName: "office_setup_conversation",
        handlerType: "setup_office_profile_conversation",
        outputPayload: expect.objectContaining({
          office_setup_persisted: true,
          setup_status: "validated",
          external_side_effects_blocked: true,
        }),
      }));
      expect(json.data?.persisted).toBe(true);
      expect(json.data?.plan?.profile).toEqual(expect.objectContaining({
        office_name: officeName,
        status: "validated",
        communication_tone: "curto e consultivo",
        permission_policy: "socio aprova contrato, cobranca e envio externo",
        calendar_policy: "consultas podem ser sugeridas, confirmacao externa precisa humano",
        finance_policy: "cobrancas e renegociacoes ficam supervisionadas",
        playbook_notes: "usar roteiro consultivo curto com proximo passo claro",
        practice_area_playbooks: expect.arrayContaining([
          expect.objectContaining({
            area: "Bancario",
            validation_status: "needs_area_review",
          }),
          expect.objectContaining({
            area: "Previdenciario",
            required_documents: expect.arrayContaining(["CNIS"]),
          }),
        ]),
      }));

      const { data: updatedSettings, error: updatedSettingsError } = await adminSupabase
        .from("tenant_settings")
        .select("ai_features")
        .eq("tenant_id", tenantId)
        .single();

      expect(updatedSettingsError).toBeNull();
      expect(updatedSettings?.ai_features?.office_knowledge_profile).toEqual(expect.objectContaining({
        office_name: officeName,
        status: "validated",
        communication_tone: "curto e consultivo",
        permission_policy: "socio aprova contrato, cobranca e envio externo",
        calendar_policy: "consultas podem ser sugeridas, confirmacao externa precisa humano",
        finance_policy: "cobrancas e renegociacoes ficam supervisionadas",
        playbook_notes: "usar roteiro consultivo curto com proximo passo claro",
        practice_area_playbooks: expect.arrayContaining([
          expect.objectContaining({
            area: "Bancario",
            document_structure: expect.arrayContaining(["00-bancario-intake-e-resumo"]),
          }),
          expect.objectContaining({
            area: "Previdenciario",
            default_pipeline: expect.arrayContaining(["Triagem do beneficio e historico INSS"]),
          }),
        ]),
      }));

      const { data: artifacts, error: artifactError } = await adminSupabase
        .from("brain_artifacts")
        .select("id, artifact_type, metadata")
        .eq("tenant_id", tenantId)
        .eq("artifact_type", "office_setup_conversation")
        .contains("metadata", { profile: { office_name: officeName } });

      expect(artifactError).toBeNull();
      expect(artifacts?.length).toBeGreaterThan(0);

      const { data: events, error: eventError } = await adminSupabase
        .from("learning_events")
        .select("id, event_type, payload")
        .eq("tenant_id", tenantId)
        .eq("created_by", userId)
        .gte("created_at", startedAt)
        .in("event_type", ["office_setup_profile_configured", "memory_promotion_proposed"])
        .contains("payload", { office_name: officeName });

      expect(eventError).toBeNull();
      expect(events?.some((event) => event.event_type === "office_setup_profile_configured")).toBe(true);
      expect(events?.some((event) => event.event_type === "memory_promotion_proposed")).toBe(true);

      const { data: proposals, error: proposalError } = await adminSupabase
        .from("brain_memories")
        .select("id, memory_key, source, promoted, created_by")
        .eq("tenant_id", tenantId)
        .eq("source", "office_setup_conversation")
        .eq("created_by", userId)
        .gte("created_at", startedAt)
        .in("memory_key", OFFICE_SETUP_MEMORY_KEYS);

      expect(proposalError).toBeNull();
      expect(proposals?.length).toBeGreaterThan(0);
      expect(proposals?.every((proposal) => proposal.promoted === false)).toBe(true);
    } finally {
      if (tenantId && officeName) {
        await adminSupabase
          .from("learning_events")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("created_by", userId)
          .gte("created_at", startedAt)
          .in("event_type", ["office_setup_profile_configured", "memory_promotion_proposed"])
          .contains("payload", { office_name: officeName });

        await adminSupabase
          .from("brain_artifacts")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("artifact_type", "office_setup_conversation")
          .contains("metadata", { profile: { office_name: officeName } });

        await adminSupabase
          .from("brain_memories")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("source", "office_setup_conversation")
          .eq("created_by", userId)
          .gte("created_at", startedAt)
          .in("memory_key", OFFICE_SETUP_MEMORY_KEYS);

        if (hadSettings) {
          await adminSupabase
            .from("tenant_settings")
            .update({
              ai_features: originalAiFeatures || {},
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantId);
        } else {
          await adminSupabase
            .from("tenant_settings")
            .delete()
            .eq("tenant_id", tenantId);
        }

        if (stepId) {
          await adminSupabase.from("brain_steps").delete().eq("id", stepId);
        }
        if (runId) {
          await adminSupabase.from("brain_runs").delete().eq("id", runId);
        }
        if (taskId) {
          await adminSupabase.from("brain_tasks").delete().eq("id", taskId);
        }
      }
    }
  });
});
