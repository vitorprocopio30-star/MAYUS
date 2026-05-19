import { describe, expect, it } from "vitest";
import {
  buildInstitutionalMemoryAuditTrace,
  buildInstitutionalMemoryPromptBlock,
  loadEnforcedInstitutionalMemory,
  summarizeInstitutionalMemoryForPrompt,
  type InstitutionalMemoryEntry,
} from "./institutional";

type FakeRow = Record<string, unknown>;

function makeSupabase(responses: {
  office: { data: FakeRow[] | null; error: { message: string } | null };
  brain: { data: FakeRow[] | null; error: { message: string } | null };
}) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  function builder(table: "office_institutional_memory" | "brain_memories") {
    const filters: Record<string, unknown> = {};
    const api = {
      select() { return api; },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return api;
      },
      order() { return api; },
      limit() {
        calls.push({ table, filters });
        const response = table === "office_institutional_memory" ? responses.office : responses.brain;
        return Promise.resolve(response);
      },
    };
    return api;
  }
  return {
    calls,
    from(table: string) {
      return builder(table as "office_institutional_memory" | "brain_memories");
    },
  } as any;
}

describe("loadEnforcedInstitutionalMemory", () => {
  it("retorna entradas enforced=true de office_institutional_memory mais aprovadas de brain_memories", async () => {
    const supabase = makeSupabase({
      office: {
        data: [
          { id: "m1", category: "Atendimento", key: "tom", value: { text: "Sempre cordial." }, enforced: true, created_at: "2026-01-01" },
          { id: "m2", category: "Financeiro", key: "vencimento", value: "Padrao 3 dias uteis", enforced: true, created_at: "2026-01-02" },
        ],
        error: null,
      },
      brain: {
        data: [
          {
            id: "p1",
            memory_key: "Promessa",
            value: { text: "Nunca prometer vitoria juridica.", category: "compliance", source_label: "office_setup", status: "approved" },
            source: "office_setup",
            confidence: 0.92,
            promoted: true,
            created_at: "2026-01-03",
          },
        ],
        error: null,
      },
    });

    const entries = await loadEnforcedInstitutionalMemory(supabase, "tenant-1");
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(["office_institutional_memory", "brain_memory_promoted"]),
    );
    const compliance = entries.find((entry) => entry.category === "compliance");
    expect(compliance?.text).toBe("Nunca prometer vitoria juridica.");
    expect(compliance?.sourceLabel).toBe("office_setup");
    expect(compliance?.confidence).toBe(0.92);
  });

  it("carrega memoria promovida pelo self-improvement loop como regra aplicavel no prompt", async () => {
    const supabase = makeSupabase({
      office: { data: [], error: null },
      brain: {
        data: [
          {
            id: "p-self-correction",
            memory_key: "self_improvement:correction_failed_operating_partner_reply_repair_timeout",
            value: {
              text: "Quando a auto-correcao operating_partner_reply_repair falhar por timeout, bloquear autoenvio e pedir revisao humana.",
              category: "compliance",
              source_label: "MAYUS detectou padrao",
              evidence: {
                correction_kind: "operating_partner_reply_repair",
                recommended_action: "Escalar para revisao humana antes de nova aplicacao automatica.",
              },
              status: "approved",
            },
            source: "self_improvement_loop",
            confidence: 0.6,
            promoted: true,
            created_at: "2026-05-19",
          },
        ],
        error: null,
      },
    });

    const entries = await loadEnforcedInstitutionalMemory(supabase, "tenant-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({
      key: "self_improvement:correction_failed_operating_partner_reply_repair_timeout",
      category: "compliance",
      source: "brain_memory_promoted",
      sourceLabel: "MAYUS detectou padrao",
      confidence: 0.6,
    }));
    expect(entries[0].text).toContain("bloquear autoenvio");

    const prompt = buildInstitutionalMemoryPromptBlock(entries).block;
    expect(prompt).toContain("Memoria institucional aprovada");
    expect(prompt).toContain("MAYUS detectou padrao");
    expect(prompt).toContain("bloquear autoenvio");
  });

  it("ignora propostas com status rejected/revoked mesmo se promoted=true", async () => {
    const supabase = makeSupabase({
      office: { data: [], error: null },
      brain: {
        data: [
          {
            id: "p1",
            memory_key: "Promessa",
            value: { text: "Texto rejeitado", status: "rejected" },
            source: "office_setup",
            confidence: 0.5,
            promoted: true,
            created_at: "2026-01-03",
          },
          {
            id: "p2",
            memory_key: "Outra",
            value: { text: "Texto revogado", status: "revoked" },
            source: "office_setup",
            confidence: 0.5,
            promoted: true,
            created_at: "2026-01-04",
          },
        ],
        error: null,
      },
    });

    const entries = await loadEnforcedInstitutionalMemory(supabase, "tenant-1");
    expect(entries).toHaveLength(0);
  });

  it("deduplica entradas com mesma categoria/key/texto", async () => {
    const supabase = makeSupabase({
      office: {
        data: [
          { id: "m1", category: "atendimento", key: "tom", value: { text: "Sempre cordial." }, enforced: true, created_at: "2026-01-01" },
        ],
        error: null,
      },
      brain: {
        data: [
          {
            id: "p1",
            memory_key: "tom",
            value: { text: "Sempre cordial.", category: "atendimento", status: "approved" },
            source: null,
            confidence: 0.9,
            promoted: true,
            created_at: "2026-01-02",
          },
        ],
        error: null,
      },
    });

    const entries = await loadEnforcedInstitutionalMemory(supabase, "tenant-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("office_institutional_memory");
  });

  it("retorna lista vazia quando tenant nao informado", async () => {
    const supabase = makeSupabase({ office: { data: [], error: null }, brain: { data: [], error: null } });
    const entries = await loadEnforcedInstitutionalMemory(supabase, "");
    expect(entries).toEqual([]);
  });
});

describe("summarizeInstitutionalMemoryForPrompt", () => {
  it("formata por categoria com fonte quando presente", () => {
    const entries: InstitutionalMemoryEntry[] = [
      { id: "1", key: "tom", text: "Cordial.", category: "atendimento", source: "office_institutional_memory", sourceLabel: null, confidence: null },
      { id: "2", key: "promessa", text: "Nunca prometer vitoria.", category: "compliance", source: "brain_memory_promoted", sourceLabel: "office_setup", confidence: 0.9 },
    ];
    const summary = summarizeInstitutionalMemoryForPrompt(entries);
    expect(summary).toContain("[ATENDIMENTO]");
    expect(summary).toContain("[COMPLIANCE]");
    expect(summary).toContain("promessa (office_setup): Nunca prometer vitoria.");
  });

  it("retorna string vazia quando nao ha entradas", () => {
    expect(summarizeInstitutionalMemoryForPrompt([])).toBe("");
  });
});

describe("buildInstitutionalMemoryPromptBlock", () => {
  it("retorna bloco com cabecalho e appliedCount real quando ha entradas", () => {
    const result = buildInstitutionalMemoryPromptBlock([
      { id: "1", key: "tom", text: "Cordial.", category: "atendimento", source: "office_institutional_memory", sourceLabel: null, confidence: null },
    ]);
    expect(result.block).toContain("Memoria institucional aprovada");
    expect(result.block).toContain("Cordial.");
    expect(result.appliedCount).toBe(1);
    expect(result.totalAvailable).toBe(1);
  });

  it("retorna bloco vazio e appliedCount=0 sem entradas", () => {
    const result = buildInstitutionalMemoryPromptBlock([]);
    expect(result.block).toBe("");
    expect(result.appliedCount).toBe(0);
    expect(result.totalAvailable).toBe(0);
  });

  it("appliedCount reflete o cap mesmo quando ha mais entradas que o limite", () => {
    const entries: InstitutionalMemoryEntry[] = Array.from({ length: 12 }, (_, index) => ({
      id: `m${index}`,
      key: `regra-${index}`,
      text: `texto ${index}`,
      category: "geral",
      source: "office_institutional_memory" as const,
      sourceLabel: null,
      confidence: null,
    }));
    const result = buildInstitutionalMemoryPromptBlock(entries, 5);
    expect(result.totalAvailable).toBe(12);
    expect(result.appliedCount).toBe(5);
    expect(result.block.split("\n").filter((line) => line.startsWith("- ")).length).toBe(5);
  });
});

describe("buildInstitutionalMemoryAuditTrace", () => {
  it("expoe apenas metadados e contagem das memorias aplicadas", () => {
    const entries: InstitutionalMemoryEntry[] = [
      { id: "1", key: "tom", text: "Cordial.", category: "atendimento", source: "office_institutional_memory", sourceLabel: null, confidence: null },
      { id: "2", key: "financas", text: "Nao enviar cobranca sem aprovacao.", category: "financeiro", source: "brain_memory_promoted", sourceLabel: "self_improvement_loop", confidence: 0.6 },
      { id: "3", key: "juridico", text: "Manter revisao humana.", category: "juridico", source: "office_institutional_memory", sourceLabel: null, confidence: null },
    ];

    const trace = buildInstitutionalMemoryAuditTrace(entries, 2);

    expect(trace).toEqual({
      total_available: 3,
      applied_count: 2,
      applied_entries: [
        { id: "1", key: "tom", category: "atendimento", source: "office_institutional_memory", source_label: null, confidence: null },
        { id: "2", key: "financas", category: "financeiro", source: "brain_memory_promoted", source_label: "self_improvement_loop", confidence: 0.6 },
      ],
    });
    expect(JSON.stringify(trace)).not.toContain("Nao enviar cobranca");
  });
});

describe("sanitizacao defensiva", () => {
  it("redige segredos vindos de office_institutional_memory antes de entrar no prompt", async () => {
    const supabase = makeSupabase({
      office: {
        data: [
          { id: "m1", category: "atendimento", key: "tom", value: { text: "Use a api_key=sk-LIVE-1234567890 quando precisar" }, enforced: true, created_at: "2026-01-01" },
        ],
        error: null,
      },
      brain: { data: [], error: null },
    });
    const entries = await loadEnforcedInstitutionalMemory(supabase, "tenant-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].text).not.toContain("sk-LIVE-1234567890");
    expect(entries[0].text).toContain("[redacted]");
  });

  it("redige segredos em brain_memories promovidos antes de entrar no prompt", async () => {
    const supabase = makeSupabase({
      office: { data: [], error: null },
      brain: {
        data: [
          {
            id: "p1",
            memory_key: "secret_rule",
            value: { text: "Para autenticar use service_role_key=super-secret-token-XYZ nunca expor", category: "compliance", status: "approved" },
            source: "office_setup",
            confidence: 0.9,
            promoted: true,
            created_at: "2026-01-02",
          },
        ],
        error: null,
      },
    });
    const entries = await loadEnforcedInstitutionalMemory(supabase, "tenant-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].text).not.toContain("super-secret-token-XYZ");
    expect(entries[0].text).toContain("[redacted]");
  });
});
