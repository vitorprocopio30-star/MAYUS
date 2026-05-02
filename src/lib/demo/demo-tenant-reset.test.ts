import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

import {
  DEMO_CASE_COUNT,
  DEMO_HERO_CASE_COUNT,
  DEMO_SEED_TAG,
  buildDemoCaseSeeds,
  buildDemoResetPreview,
  resetDemoTenant,
} from "./demo-tenant-reset";
import {
  DEMO_OAB_ADVOGADO_NOME,
  DEMO_OAB_ESTADO,
  DEMO_OAB_NUMERO,
  buildDemoOrganizationResult,
  buildDemoOabCachePayload,
} from "./demo-oab-flow";

function buildQuery(table: string, demoMode = true) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "tenants") {
        return { data: { id: "tenant-demo", name: "MAYUS Demo" }, error: null };
      }
      if (table === "tenant_settings") {
        return { data: { ai_features: { demo_mode: demoMode } }, error: null };
      }
      return { data: null, error: null };
    }),
  };
  return query;
}

function buildSupabase(demoMode = true) {
  return {
    from: vi.fn((table: string) => buildQuery(table, demoMode)),
  } as any;
}

describe("demo tenant reset", () => {
  it("gera 100 casos sinteticos com 12 casos vitrine e 88 de volume", () => {
    const cases = buildDemoCaseSeeds();
    const preview = buildDemoResetPreview(cases);

    expect(cases).toHaveLength(DEMO_CASE_COUNT);
    expect(preview.heroCases).toBe(DEMO_HERO_CASE_COUNT);
    expect(preview.volumeCases).toBe(88);
    expect(preview.demoOab).toEqual({
      estado: DEMO_OAB_ESTADO,
      numero: DEMO_OAB_NUMERO,
      advogadoNome: DEMO_OAB_ADVOGADO_NOME,
      query: "SP/123456",
    });
    expect(preview.legalAreas.length).toBeGreaterThanOrEqual(6);
    expect(cases.every((item) => item.tags.includes(DEMO_SEED_TAG))).toBe(true);
    expect(cases.every((item) => item.clientName)).toBe(true);
    expect(JSON.stringify(cases)).not.toMatch(/dutra|vitor|service_role|supabase/i);
  });

  it("gera payload de OAB ficticia com processos e movimentacoes demonstraveis", () => {
    const payload = buildDemoOabCachePayload(buildDemoCaseSeeds());

    expect(payload.total).toBe(100);
    expect(payload.advogado.nome).toBe(DEMO_OAB_ADVOGADO_NOME);
    expect(payload.processos[0]).toEqual(expect.objectContaining({
      numero_processo: expect.stringMatching(/2026\.8\.26/),
      escavador_id: expect.stringContaining("demo-fonte"),
    }));
    expect(payload.processos[0].movimentacoes[0]).toEqual(expect.objectContaining({
      demo_seed: DEMO_SEED_TAG,
      tipo: "intimacao",
    }));
    expect(JSON.stringify(payload)).not.toMatch(/dutra|vitor|service_role|supabase/i);
  });

  it("gera organizacao demo com prazo, tarefa e resposta WhatsApp supervisionada", () => {
    const processo = buildDemoOabCachePayload(buildDemoCaseSeeds()).processos[0];
    const result = buildDemoOrganizationResult(processo, {
      kanbanStageId: "stage-demo",
      responsavelNome: "Dra. Mayus",
    });

    expect(result.kanban_stage_id).toBe("stage-demo");
    expect(result.prazos).toHaveLength(1);
    expect(result.tarefas).toHaveLength(1);
    expect(result.whatsapp_resposta_sugerida).toContain("MAYUS");
    expect(result.side_effects_externos).toBe("bloqueados");
  });

  it("permite dry-run apenas para tenant marcado como demo", async () => {
    const supabase = buildSupabase(true);

    const result = await resetDemoTenant({
      tenantId: "tenant-demo",
      actorUserId: "user-admin",
      dryRun: true,
      supabase,
    });

    expect(result.dryRun).toBe(true);
    expect(result.preview.totalCases).toBe(100);
    expect(result.inserted.processTasks).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith("tenants");
    expect(supabase.from).toHaveBeenCalledWith("tenant_settings");
  });

  it("bloqueia tenant sem demo_mode", async () => {
    await expect(resetDemoTenant({
      tenantId: "tenant-real",
      actorUserId: "user-admin",
      dryRun: true,
      supabase: buildSupabase(false),
    })).rejects.toThrow("TenantIsNotDemo");
  });
});
