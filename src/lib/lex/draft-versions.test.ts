import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: rpcMock,
    from: fromMock,
  },
}));

import {
  buildDraftPromotionCandidate,
  buildDraftTextMetrics,
  buildDraftLearningLoopDelta,
  createHumanReviewedProcessDraftVersion,
  createProcessDraftVersion,
  getProcessDraftVersionForTask,
  loadDraftLearningLoopDelta,
  listProcessDraftVersions,
  updateProcessDraftVersionWorkflow,
} from "./draft-versions";

describe("draft-versions", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("usa a RPC atomica para criar uma nova versao", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "version-1", version_number: 1 },
      error: null,
    });
    rpcMock.mockReturnValue({ single: singleMock });

    const result = await createProcessDraftVersion({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      sourceArtifactId: "artifact-1",
      sourceTaskId: "task-brain-1",
      sourceCaseBrainTaskId: "case-brain-1",
      pieceType: "contestacao",
      pieceLabel: "Contestacao",
      practiceArea: "civel",
      summary: "Resumo",
      draftMarkdown: "# minuta",
      metadata: { foo: "bar" },
      createdBy: "user-1",
    });

    expect(rpcMock).toHaveBeenCalledWith("create_process_draft_version_atomic", {
      p_tenant_id: "tenant-1",
      p_process_task_id: "task-1",
      p_source_artifact_id: "artifact-1",
      p_source_task_id: "task-brain-1",
      p_source_case_brain_task_id: "case-brain-1",
      p_piece_type: "contestacao",
      p_piece_label: "Contestacao",
      p_practice_area: "civel",
      p_summary: "Resumo",
      p_draft_markdown: "# minuta",
      p_metadata: { foo: "bar" },
      p_created_by: "user-1",
      p_parent_version_id: null,
    });
    expect(result).toEqual({ id: "version-1", version_number: 1 });
  });

  it("normaliza metadata invalida ao criar nova versao", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "version-1" },
      error: null,
    });
    rpcMock.mockReturnValue({ single: singleMock });

    await createProcessDraftVersion({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      draftMarkdown: "# minuta",
      metadata: null,
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "create_process_draft_version_atomic",
      expect.objectContaining({ p_metadata: {}, p_parent_version_id: null })
    );
  });

  it("propaga a mensagem semantica da RPC ao criar nova versao", async () => {
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Nao foi possivel registrar a versao da minuta sem conteudo." },
      }),
    });

    await expect(
      createProcessDraftVersion({
        tenantId: "tenant-1",
        processTaskId: "task-1",
        draftMarkdown: "",
      })
    ).rejects.toThrow("Nao foi possivel registrar a versao da minuta sem conteudo.");
  });

  it("lista as versoes em ordem descrescente", async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: "v2", version_number: 2 }, { id: "v1", version_number: 1 }],
      error: null,
    });
    const eqProcessMock = vi.fn(() => ({ order: orderMock }));
    const eqTenantMock = vi.fn(() => ({ eq: eqProcessMock }));
    const selectMock = vi.fn(() => ({ eq: eqTenantMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const result = await listProcessDraftVersions({ tenantId: "tenant-1", processTaskId: "task-1" });

    expect(fromMock).toHaveBeenCalledWith("process_draft_versions");
    expect(result).toEqual([{ id: "v2", version_number: 2 }, { id: "v1", version_number: 1 }]);
  });

  it("usa a RPC atomica para aprovar ou publicar versao", async () => {
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: "version-1", workflow_status: "published" },
        error: null,
      }),
    });

    const result = await updateProcessDraftVersionWorkflow({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      versionId: "version-1",
      action: "publish",
      actorId: "user-1",
    });

    expect(rpcMock).toHaveBeenCalledWith("transition_process_draft_version_atomic", {
      p_tenant_id: "tenant-1",
      p_process_task_id: "task-1",
      p_version_id: "version-1",
      p_action: "publish",
      p_actor_id: "user-1",
    });
    expect(result).toEqual({ id: "version-1", workflow_status: "published" });
  });

  it("preserva erro semantico de stale draft ao transicionar workflow", async () => {
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "A versao da minuta esta desatualizada em relacao ao Case Brain atual." },
      }),
    });

    await expect(
      updateProcessDraftVersionWorkflow({
        tenantId: "tenant-1",
        processTaskId: "task-1",
        versionId: "version-1",
        action: "approve",
        actorId: "user-1",
      })
    ).rejects.toThrow("A versao da minuta esta desatualizada em relacao ao Case Brain atual.");
  });

  it("classifica delta material de aprendizagem ao comparar baseline e versao final", () => {
    const result = buildDraftLearningLoopDelta({
      baselineMarkdown: "# Contestacao\n\nTexto base.",
      finalMarkdown: "# Contestacao\n\n## Sintese\n\nTexto base expandido com fundamentos.\n\n## Merito\n\nArt. 300 do CPC e Tema 123.",
      sourceKind: "source_artifact",
      sourceLabel: "a primeira minuta gerada",
    });

    expect(result.changed).toBe(true);
    expect(result.categories).toContain("substantive_expansion");
    expect(result.categories).toContain("structure_refined");
    expect(result.categories).toContain("citations_enriched");
    expect(result.sourceKind).toBe("source_artifact");
  });

  it("carrega o baseline do artifact de origem para montar o learning loop capture", async () => {
    const artifactMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "artifact-1",
        metadata: {
          reply: "# Contestacao\n\nTexto inicial.",
        },
      },
      error: null,
    });
    const artifactEqIdMock = vi.fn(() => ({ maybeSingle: artifactMaybeSingleMock }));
    const artifactEqTenantMock = vi.fn(() => ({ eq: artifactEqIdMock }));
    const artifactSelectMock = vi.fn(() => ({ eq: artifactEqTenantMock }));

    fromMock.mockImplementation((table: string) => {
      if (table === "brain_artifacts") {
        return { select: artifactSelectMock };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    });

    const result = await loadDraftLearningLoopDelta({
      tenantId: "tenant-1",
      version: {
        id: "version-2",
        tenant_id: "tenant-1",
        process_task_id: "task-1",
        source_artifact_id: "artifact-1",
        source_task_id: null,
        source_case_brain_task_id: null,
        parent_version_id: null,
        version_number: 2,
        workflow_status: "published",
        is_current: true,
        piece_type: "contestacao",
        piece_label: "Contestacao",
        practice_area: null,
        summary: null,
        draft_markdown: "# Contestacao\n\nTexto inicial com reforco.\n\nArt. 300 do CPC.",
        metadata: {},
        approved_by: null,
        approved_at: null,
        published_by: null,
        published_at: null,
        created_by: null,
        created_at: "2026-04-21T00:00:00.000Z",
        updated_at: "2026-04-21T00:00:00.000Z",
      },
    });

    expect(result.sourceKind).toBe("source_artifact");
    expect(result.sourceLabel).toBe("a primeira minuta gerada");
    expect(result.changed).toBe(true);
    expect(result.summary).toContain("Delta capturado");
  });

  it("prioriza a versao pai como baseline quando existe revisao humana versionada", async () => {
    const parentVersionMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "version-1",
        version_number: 1,
        draft_markdown: "# Contestacao\n\nTexto base da versao anterior.",
      },
      error: null,
    });
    const parentVersionEqIdMock = vi.fn(() => ({ maybeSingle: parentVersionMaybeSingleMock }));
    const parentVersionEqTenantMock = vi.fn(() => ({ eq: parentVersionEqIdMock }));
    const parentVersionSelectMock = vi.fn(() => ({ eq: parentVersionEqTenantMock }));

    fromMock.mockImplementation((table: string) => {
      if (table === "process_draft_versions") {
        return { select: parentVersionSelectMock };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    });

    const result = await loadDraftLearningLoopDelta({
      tenantId: "tenant-1",
      version: {
        id: "version-2",
        tenant_id: "tenant-1",
        process_task_id: "task-1",
        source_artifact_id: "artifact-1",
        source_task_id: null,
        source_case_brain_task_id: null,
        parent_version_id: "version-1",
        version_number: 2,
        workflow_status: "published",
        is_current: true,
        piece_type: "contestacao",
        piece_label: "Contestacao",
        practice_area: null,
        summary: null,
        draft_markdown: "# Contestacao\n\nTexto revisado com fundamento adicional.",
        metadata: { edit_source: "human_editor" },
        approved_by: null,
        approved_at: null,
        published_by: null,
        published_at: null,
        created_by: null,
        created_at: "2026-04-21T00:00:00.000Z",
        updated_at: "2026-04-21T00:00:00.000Z",
      },
    });

    expect(result.sourceKind).toBe("parent_version");
    expect(result.sourceLabel).toBe("a versao V1");
  });

  it("carrega a versao do processo com escopo por task", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { id: "version-1", process_task_id: "task-1" },
      error: null,
    });
    const eqVersionMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    const eqTaskMock = vi.fn(() => ({ eq: eqVersionMock }));
    const eqTenantMock = vi.fn(() => ({ eq: eqTaskMock }));
    const selectMock = vi.fn(() => ({ eq: eqTenantMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const result = await getProcessDraftVersionForTask({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      versionId: "version-1",
    });

    expect(fromMock).toHaveBeenCalledWith("process_draft_versions");
    expect(result).toEqual({ id: "version-1", process_task_id: "task-1" });
  });

  it("cria nova versao formal de revisao humana a partir da versao atual", async () => {
    const baseVersion = {
      id: "version-1",
      tenant_id: "tenant-1",
      process_task_id: "task-1",
      source_artifact_id: "artifact-1",
      source_task_id: "brain-task-1",
      source_case_brain_task_id: "case-brain-1",
      parent_version_id: null,
      version_number: 1,
      workflow_status: "published",
      is_current: true,
      piece_type: "contestacao",
      piece_label: "Contestacao",
      practice_area: "previdenciario",
      summary: "Versao publicada.",
      draft_markdown: "# Contestacao\n\nTexto base.",
      metadata: {
        premium_publish: { fileName: "old.pdf" },
        learning_loop_capture: { changed: true },
        warnings: ["warning legado"],
        requires_human_review: true,
      },
      approved_by: null,
      approved_at: null,
      published_by: null,
      published_at: null,
      created_by: null,
      created_at: "2026-04-21T00:00:00.000Z",
      updated_at: "2026-04-21T00:00:00.000Z",
    } as any;

    const memoryMaybeSingleMock = vi.fn().mockResolvedValue({
      data: { case_brain_task_id: "case-brain-1" },
      error: null,
    });
    const memoryEqTaskMock = vi.fn(() => ({ maybeSingle: memoryMaybeSingleMock }));
    const memoryEqTenantMock = vi.fn(() => ({ eq: memoryEqTaskMock }));
    const memorySelectMock = vi.fn(() => ({ eq: memoryEqTenantMock }));

    const versionMaybeSingleMock = vi.fn().mockResolvedValue({
      data: baseVersion,
      error: null,
    });
    const versionEqIdMock = vi.fn(() => ({ maybeSingle: versionMaybeSingleMock }));
    const versionEqTaskMock = vi.fn(() => ({ eq: versionEqIdMock }));
    const versionEqTenantMock = vi.fn(() => ({ eq: versionEqTaskMock }));
    const versionSelectMock = vi.fn(() => ({ eq: versionEqTenantMock }));

    fromMock.mockImplementation((table: string) => {
      if (table === "process_draft_versions") {
        return { select: versionSelectMock };
      }

      if (table === "process_document_memory") {
        return { select: memorySelectMock };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    });

    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "version-2", version_number: 2 },
      error: null,
    });
    rpcMock.mockReturnValue({ single: singleMock });

    const result = await createHumanReviewedProcessDraftVersion({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      baseVersionId: "version-1",
      draftMarkdown: "# Contestacao\n\nTexto revisado manualmente com art. 300 do CPC.",
      actorId: "user-1",
      surface: "documentos",
    });

    expect(rpcMock).toHaveBeenCalledWith("create_process_draft_version_atomic", expect.objectContaining({
      p_tenant_id: "tenant-1",
      p_process_task_id: "task-1",
      p_source_artifact_id: "artifact-1",
      p_source_task_id: "brain-task-1",
      p_source_case_brain_task_id: "case-brain-1",
      p_piece_type: "contestacao",
      p_piece_label: "Contestacao",
      p_practice_area: "previdenciario",
      p_created_by: "user-1",
      p_parent_version_id: "version-1",
      p_metadata: expect.objectContaining({
        edit_source: "human_editor",
        edited_from_version_id: "version-1",
        edited_from_version_number: 1,
        learning_loop_capture: expect.objectContaining({
          sourceKind: "parent_version",
          sourceLabel: "a versao V1",
        }),
        promotion_candidate: expect.objectContaining({
          status: "pending_supervision",
          basedOnVersionId: "version-1",
          basedOnVersionNumber: 1,
          candidateTypes: expect.arrayContaining(["citation_policy"]),
        }),
        warnings: [],
        requires_human_review: false,
        quality_metrics: expect.objectContaining({
          charCount: expect.any(Number),
          wordCount: expect.any(Number),
          paragraphCount: expect.any(Number),
          sectionCount: expect.any(Number),
        }),
      }),
    }));
    expect(result).toEqual({ id: "version-2", version_number: 2 });
  });

  it("bloqueia nova versao formal quando a base esta stale em relacao ao Case Brain", async () => {
    const versionMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "version-1",
        tenant_id: "tenant-1",
        process_task_id: "task-1",
        source_artifact_id: null,
        source_task_id: null,
        source_case_brain_task_id: "case-brain-antigo",
        parent_version_id: null,
        version_number: 1,
        workflow_status: "draft",
        is_current: true,
        piece_type: null,
        piece_label: null,
        practice_area: null,
        summary: null,
        draft_markdown: "# minuta",
        metadata: {},
        approved_by: null,
        approved_at: null,
        published_by: null,
        published_at: null,
        created_by: null,
        created_at: "2026-04-21T00:00:00.000Z",
        updated_at: "2026-04-21T00:00:00.000Z",
      },
      error: null,
    });
    const versionEqIdMock = vi.fn(() => ({ maybeSingle: versionMaybeSingleMock }));
    const versionEqTaskMock = vi.fn(() => ({ eq: versionEqIdMock }));
    const versionEqTenantMock = vi.fn(() => ({ eq: versionEqTaskMock }));
    const versionSelectMock = vi.fn(() => ({ eq: versionEqTenantMock }));

    const memoryMaybeSingleMock = vi.fn().mockResolvedValue({
      data: { case_brain_task_id: "case-brain-atual" },
      error: null,
    });
    const memoryEqTaskMock = vi.fn(() => ({ maybeSingle: memoryMaybeSingleMock }));
    const memoryEqTenantMock = vi.fn(() => ({ eq: memoryEqTaskMock }));
    const memorySelectMock = vi.fn(() => ({ eq: memoryEqTenantMock }));

    fromMock.mockImplementation((table: string) => {
      if (table === "process_draft_versions") {
        return { select: versionSelectMock };
      }

      if (table === "process_document_memory") {
        return { select: memorySelectMock };
      }

      throw new Error(`Tabela inesperada no teste: ${table}`);
    });

    await expect(
      createHumanReviewedProcessDraftVersion({
        tenantId: "tenant-1",
        processTaskId: "task-1",
        baseVersionId: "version-1",
        draftMarkdown: "# minuta\n\nrevisada",
        actorId: "user-1",
      })
    ).rejects.toThrow("A versao selecionada esta desatualizada em relacao ao Case Brain atual e nao pode originar nova versao formal.");
  });

  it("calcula metricas de texto para persistir revisao humana", () => {
    const metrics = buildDraftTextMetrics("# Contestacao\n\nPrimeiro paragrafo.\n\nSegundo paragrafo com art. 300 do CPC.");

    expect(metrics.charCount).toBeGreaterThan(10);
    expect(metrics.wordCount).toBeGreaterThan(5);
    expect(metrics.paragraphCount).toBe(3);
    expect(metrics.sectionCount).toBe(1);
    expect(metrics.citationCount).toBe(2);
  });

  it("gera candidato supervisionavel de padrao quando a revisao humana traz sinais materiais", () => {
    const delta = buildDraftLearningLoopDelta({
      baselineMarkdown: "# Contestacao\n\nTexto base.",
      finalMarkdown: "# Contestacao\n\n## Fundamentacao\n\nTexto revisado com art. 300 do CPC.",
      sourceKind: "parent_version",
      sourceLabel: "a versao V1",
    });

    const candidate = buildDraftPromotionCandidate({
      delta,
      baseVersionId: "version-1",
      baseVersionNumber: 1,
    });

    expect(candidate).toEqual(expect.objectContaining({
      status: "pending_supervision",
      basedOnVersionId: "version-1",
      basedOnVersionNumber: 1,
      candidateTypes: expect.arrayContaining(["template_structure", "citation_policy"]),
    }));
  });
});
