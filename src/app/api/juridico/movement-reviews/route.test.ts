import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminFromMock,
  createServerClientMock,
  cookiesMock,
  getUserMock,
  inserts,
  pipelineContextMock,
  upserts,
  updates,
} = vi.hoisted(() => ({
  adminFromMock: vi.fn(),
  createServerClientMock: vi.fn(),
  cookiesMock: vi.fn(),
  getUserMock: vi.fn(),
  inserts: [] as Array<{ table: string; payload: any }>,
  pipelineContextMock: {
    value: {
      pipelineId: "pipeline-1",
      linkedTaskContext: null,
      stages: [{ id: "stage-1", name: "Prazos", order_index: 1 }],
      visibleStages: [{ id: "stage-1", name: "Prazos", order_index: 1 }],
      fallbackStageId: "stage-1",
    } as any,
  },
  upserts: [] as Array<{ table: string; payload: any }>,
  updates: [] as Array<{ table: string; payload: any }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: adminFromMock },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/brain/roles", () => ({
  isBrainExecutiveRole: vi.fn(() => true),
}));

vi.mock("@/lib/juridico/process-pipeline-resolver", () => ({
  chooseSemanticLegalStage: vi.fn(() => "stage-1"),
  resolveProcessPipelineContext: vi.fn(async () => pipelineContextMock.value),
}));

import { GET, POST } from "./route";

const reviewRow = {
  id: "review-1",
  tenant_id: "tenant-1",
  event_name: "legal_movement_review_required",
  status: "review_required",
  created_at: "2026-05-16T10:00:00.000Z",
  payload: {
    numero_cnj: "0000001-11.2026.8.26.0100",
    processo_id: "process-1",
    process_movimentacao_id: "movement-1",
    tipo_evento: "PRAZO",
    acao_sugerida: "Manifestar-se sobre peticao",
    data_vencimento_extraida: "2026-05-20T00:00:00.000Z",
    confianca_analise: "media",
    origem: "llm",
    motivo: "Exige revisao humana em beta.",
  },
};

const stuckReviewRow = {
  ...reviewRow,
  id: "review-stuck-1",
  status: "approved_processing",
  payload: {
    ...reviewRow.payload,
    review_note: "Tentativa anterior",
    review_error: "Falha ao finalizar revisao juridica.",
  },
};

function chain(table: string, data: any, options: { insertError?: Error; upsertError?: Error; updateError?: Error; queryError?: Error } = {}) {
  let insertedPayload: any = null;
  let lastOperation: "insert" | "upsert" | "update" | null = null;
  const eqFilters: Record<string, any> = {};
  const inFilters: Record<string, any[]> = {};
  const applyFilters = (value: any) => {
    const rows = Array.isArray(value) ? value : value ? [value] : [];
    if (lastOperation) return rows;
    return rows.filter((row) => {
      for (const [column, expected] of Object.entries(eqFilters)) {
        if (column === "tenant_id" && row?.[column] === undefined) continue;
        if (row?.[column] !== expected) return false;
      }
      for (const [column, expected] of Object.entries(inFilters)) {
        if (!expected.includes(row?.[column])) return false;
      }
      return true;
    });
  };
  const errorForOperation = () => {
    if (lastOperation === "insert") return options.insertError ?? options.queryError ?? null;
    if (lastOperation === "upsert") return options.upsertError ?? options.queryError ?? null;
    if (lastOperation === "update") return options.updateError ?? options.queryError ?? null;
    return options.queryError ?? null;
  };
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: any) => {
      eqFilters[column] = value;
      return query;
    }),
    in: vi.fn((column: string, value: any[]) => {
      inFilters[column] = value;
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: applyFilters(data), error: options.queryError ?? null })),
    maybeSingle: vi.fn(async () => ({ data: applyFilters(data)[0] ?? null, error: errorForOperation() })),
    update: vi.fn((payload: any) => {
      lastOperation = "update";
      updates.push({ table, payload });
      return query;
    }),
    insert: vi.fn((payload: any) => {
      lastOperation = "insert";
      insertedPayload = payload;
      inserts.push({ table, payload });
      return query;
    }),
    upsert: vi.fn((payload: any) => {
      lastOperation = "upsert";
      upserts.push({ table, payload });
      return query;
    }),
    single: vi.fn(async () => {
      const error = errorForOperation();
      if (error) return { data: null, error };
      if (insertedPayload && table === "process_tasks") return { data: { id: "task-created-1" }, error: null };
      return { data: applyFilters(data)[0] ?? data, error: null };
    }),
    then(resolve: (value: any) => void) {
      resolve({ data: applyFilters(data), error: errorForOperation() });
    },
  };
  return query;
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/juridico/movement-reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/juridico/movement-reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    upserts.length = 0;
    updates.length = 0;
    pipelineContextMock.value = {
      pipelineId: "pipeline-1",
      linkedTaskContext: null,
      stages: [{ id: "stage-1", name: "Prazos", order_index: 1 }],
      visibleStages: [{ id: "stage-1", name: "Prazos", order_index: 1 }],
      fallbackStageId: "stage-1",
    };
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") return chain(table, [reviewRow]);
      if (table === "process_movimentacoes") return chain(table, {
        id: "movement-1",
        numero_cnj: "0000001-11.2026.8.26.0100",
        data: "2026-05-16",
        conteudo: "Intimacao para manifestacao sobre peticao.",
        tipo_evento: "PRAZO",
        acao_sugerida: "Manifestar-se sobre peticao",
        data_vencimento_extraida: "2026-05-20T00:00:00.000Z",
        confianca_analise: "media",
        analise_json: { motivo: "Exige revisao humana em beta." },
      });
      if (table === "monitored_processes") return chain(table, {
        id: "process-1",
        numero_processo: "0000001-11.2026.8.26.0100",
        cliente_nome: "Cliente Teste",
        tribunal: "TJSP",
      });
      return chain(table, null);
    });
  });

  it("lista revisoes juridicas pendentes do tenant", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reviews).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "review-1",
        tipo_evento: "PRAZO",
        cliente_nome: "Cliente Teste",
        movimentacao_conteudo: "Intimacao para manifestacao sobre peticao.",
      }),
    ]));
    expect(payload.stuck_reviews).toEqual([]);
  });

  it("lista revisoes travadas separadas das pendentes", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") return chain(table, [reviewRow, stuckReviewRow]);
      if (table === "process_movimentacoes") return chain(table, {
        id: "movement-1",
        numero_cnj: "0000001-11.2026.8.26.0100",
        data: "2026-05-16",
        conteudo: "Intimacao para manifestacao sobre peticao.",
        tipo_evento: "PRAZO",
        acao_sugerida: "Manifestar-se sobre peticao",
        data_vencimento_extraida: "2026-05-20T00:00:00.000Z",
        confianca_analise: "media",
        analise_json: {},
      });
      if (table === "monitored_processes") return chain(table, {
        id: "process-1",
        numero_processo: "0000001-11.2026.8.26.0100",
        cliente_nome: "Cliente Teste",
        tribunal: "TJSP",
      });
      return chain(table, null);
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reviews).toEqual([expect.objectContaining({ id: "review-1", status: "review_required" })]);
    expect(payload.stuck_reviews).toEqual([expect.objectContaining({
      id: "review-stuck-1",
      status: "approved_processing",
      review_error: "Falha ao finalizar revisao juridica.",
    })]);
  });

  it("recupera revisao travada com nota e auditoria", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") return chain(table, [stuckReviewRow]);
      if (table === "process_movimentacoes") return chain(table, null);
      if (table === "monitored_processes") return chain(table, null);
      return chain(table, null);
    });

    const response = await POST(request({
      review_id: "review-stuck-1",
      decision: "recover",
      note: "Processamento ficou preso apos falha de rede.",
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "review_required",
          payload: expect.objectContaining({
            recovery_note: "Processamento ficou preso apos falha de rede.",
            previous_status: "approved_processing",
            review_error: expect.stringContaining("recuperada"),
          }),
        }),
      }),
    ]));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_review_recovered" }),
      }),
    ]));
  });

  it("exige nota para recuperar revisao travada", async () => {
    const response = await POST(request({ review_id: "review-stuck-1", decision: "recover", note: " " }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("note");
  });

  it("permite ignorar revisao com auditoria", async () => {
    const response = await POST(request({ review_id: "review-1", decision: "ignored", note: "Nao exige providencia." }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "ignored",
          payload: expect.objectContaining({ review_note: "Nao exige providencia." }),
        }),
      }),
    ]));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_review_ignored" }),
      }),
    ]));
  });

  it("aprova revisao criando card, prazo e auditoria", async () => {
    const response = await POST(request({ review_id: "review-1", decision: "approved" }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_tasks",
        payload: expect.objectContaining({
          tenant_id: "tenant-1",
          pipeline_id: "pipeline-1",
          stage_id: "stage-1",
          prazo_fatal: "2026-05-20T00:00:00.000Z",
          tags: expect.arrayContaining(["PRAZO", "revisado_humano"]),
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_review_approved" }),
      }),
    ]));
    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          monitored_process_id: "process-1",
          process_task_id: "task-created-1",
          descricao: "Manifestar-se sobre peticao",
        }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          analise_json: expect.objectContaining({ review_status: "approved" }),
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ status: "approved" }),
      }),
    ]));
  });

  it("aprova revisao usando acao, vencimento e nota revisados", async () => {
    const response = await POST(request({
      review_id: "review-1",
      decision: "approved",
      acao_sugerida: "Protocolar manifestacao revisada",
      data_vencimento_extraida: "2026-05-25",
      note: "Confirmado no DJE.",
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_tasks",
        payload: expect.objectContaining({
          andamento_1grau: "Protocolar manifestacao revisada",
          prazo_fatal: "2026-05-25T00:00:00.000Z",
        }),
      }),
    ]));
    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          descricao: "Protocolar manifestacao revisada",
          data_vencimento: "2026-05-25T00:00:00.000Z",
        }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          analise_json: expect.objectContaining({
            review_note: "Confirmado no DJE.",
            reviewed_action: "Protocolar manifestacao revisada",
            reviewed_due_date: "2026-05-25T00:00:00.000Z",
          }),
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "approved",
          payload: expect.objectContaining({
            acao_sugerida: "Protocolar manifestacao revisada",
            data_vencimento_extraida: "2026-05-25T00:00:00.000Z",
            review_note: "Confirmado no DJE.",
            review_overrides: expect.objectContaining({
              acao_sugerida: "Protocolar manifestacao revisada",
              data_vencimento_extraida: "2026-05-25",
            }),
          }),
        }),
      }),
    ]));
  });

  it("bloqueia aprovacao com vencimento revisado invalido", async () => {
    const response = await POST(request({
      review_id: "review-1",
      decision: "approved",
      data_vencimento_extraida: "data-invalida",
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toContain("Data de vencimento revisada invalida");
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ status: "approved_processing" }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "review_required",
          payload: expect.objectContaining({ review_error: expect.stringContaining("Data de vencimento revisada invalida") }),
        }),
      }),
    ]));
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
  });

  it("bloqueia aprovacao com acao revisada vazia", async () => {
    const response = await POST(request({
      review_id: "review-1",
      decision: "approved",
      acao_sugerida: "   ",
      data_vencimento_extraida: "2026-05-25",
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toContain("Acao revisada");
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ status: "approved_processing" }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "review_required",
          payload: expect.objectContaining({ review_error: expect.stringContaining("Acao revisada") }),
        }),
      }),
    ]));
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
  });

  it("restaura pendencia quando criacao de card falha", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") return chain(table, [reviewRow]);
      if (table === "process_movimentacoes") return chain(table, {
        id: "movement-1",
        numero_cnj: "0000001-11.2026.8.26.0100",
        data: "2026-05-16",
        conteudo: "Intimacao para manifestacao sobre peticao.",
        tipo_evento: "PRAZO",
        acao_sugerida: "Manifestar-se sobre peticao",
        data_vencimento_extraida: "2026-05-20T00:00:00.000Z",
        analise_json: {},
      });
      if (table === "monitored_processes") return chain(table, {
        id: "process-1",
        numero_processo: "0000001-11.2026.8.26.0100",
        cliente_nome: "Cliente Teste",
        tribunal: "TJSP",
      });
      if (table === "process_tasks") return chain(table, null, { insertError: new Error("insert denied") });
      return chain(table, null);
    });

    const response = await POST(request({ review_id: "review-1", decision: "approved" }) as any);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toContain("Falha ao criar card processual");
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ status: "approved_processing" }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "review_required",
          payload: expect.objectContaining({ review_error: expect.stringContaining("Falha ao criar card processual") }),
        }),
      }),
    ]));
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
  });

  it("bloqueia aprovacao quando pipeline juridica nao foi encontrada", async () => {
    pipelineContextMock.value = {
      pipelineId: null,
      linkedTaskContext: null,
      stages: [],
      visibleStages: [],
      fallbackStageId: null,
    };

    const response = await POST(request({ review_id: "review-1", decision: "approved" }) as any);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toContain("Pipeline juridica");
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ status: "approved_processing" }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "review_required",
          payload: expect.objectContaining({ review_error: expect.stringContaining("Pipeline juridica") }),
        }),
      }),
    ]));
  });

  it("retorna conflito quando outra pessoa reservou a revisao", async () => {
    let systemEventCalls = 0;
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") {
        systemEventCalls += 1;
        return chain(table, systemEventCalls === 1 ? [reviewRow] : null);
      }
      if (table === "process_movimentacoes") return chain(table, null);
      if (table === "monitored_processes") return chain(table, null);
      return chain(table, null);
    });

    const response = await POST(request({ review_id: "review-1", decision: "approved" }) as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("outro usuario");
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
  });

  it("bloqueia aprovacao sem vencimento confiavel e restaura pendencia", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") return chain(table, [{
        ...reviewRow,
        payload: { ...reviewRow.payload, data_vencimento_extraida: null },
      }]);
      if (table === "process_movimentacoes") return chain(table, {
        id: "movement-1",
        numero_cnj: "0000001-11.2026.8.26.0100",
        conteudo: "Intimacao sem prazo confiavel.",
        tipo_evento: "PRAZO",
        acao_sugerida: "Manifestar-se",
        data_vencimento_extraida: null,
        analise_json: {},
      });
      if (table === "monitored_processes") return chain(table, { id: "process-1", numero_processo: "0000001-11.2026.8.26.0100" });
      return chain(table, null);
    });

    const response = await POST(request({ review_id: "review-1", decision: "approved" }) as any);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toContain("vencimento confiavel");
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ status: "approved_processing" }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          status: "review_required",
          payload: expect.objectContaining({ review_error: expect.stringContaining("vencimento confiavel") }),
        }),
      }),
    ]));
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
  });

  it("bloqueia arquivamento/extincao no beta", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return chain(table, { tenant_id: "tenant-1", role: "administrador" });
      if (table === "system_event_logs") return chain(table, [{
        ...reviewRow,
        payload: { ...reviewRow.payload, tipo_evento: "ARQUIVAMENTO" },
      }]);
      if (table === "process_movimentacoes") return chain(table, {
        id: "movement-1",
        numero_cnj: "0000001-11.2026.8.26.0100",
        conteudo: "Arquivamento definitivo.",
        tipo_evento: "ARQUIVAMENTO",
        data_vencimento_extraida: "2026-05-20T00:00:00.000Z",
        analise_json: {},
      });
      if (table === "monitored_processes") return chain(table, { id: "process-1", numero_processo: "0000001-11.2026.8.26.0100" });
      return chain(table, null);
    });

    const response = await POST(request({ review_id: "review-1", decision: "approved" }) as any);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toContain("acao manual");
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
  });
});
