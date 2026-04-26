import { describe, expect, it } from "vitest";
import { route } from "./router";

const baseContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  channel: "chat" as const,
  availableSkills: ["support_case_status", "legal_case_context", "legal_document_memory_refresh", "legal_first_draft_generate", "legal_draft_workflow", "legal_draft_review_guidance", "legal_draft_revision_loop", "legal_artifact_publish_premium", "query_process_status"],
};

describe("route - juridico MAYUS", () => {
  it("detecta pedido de suporte para atualizar cliente sobre o caso", () => {
    const result = route(
      "O cliente perguntou como esta o caso 1234567-89.2024.8.26.0100. Me de um status curto para responder.",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("extrai nome do cliente em pedido de status do caso", () => {
    const result = route(
      "O cliente Maria da Silva perguntou como anda o caso. Me de uma resposta curta.",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ client_name: "Maria da Silva" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("extrai referencia textual em pedido de status do caso", () => {
    const result = route(
      "Preciso de status do caso: revisional banco exemplo para responder o cliente.",
      baseContext
    );

    expect(result.intent).toBe("support_case_status");
    expect(result.entities).toEqual({ process_reference: "revisional banco exemplo para responder o cliente" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta consulta de contexto juridico e extrai o numero do processo", () => {
    const result = route(
      "Quero o contexto jurídico, a peça sugerida e o status da minuta do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_case_context");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para gerar a primeira minuta juridica", () => {
    const result = route(
      "Pode gerar a primeira minuta do processo 1234567-89.2024.8.26.0100 pela Draft Factory?",
      baseContext
    );

    expect(result.intent).toBe("legal_first_draft_generate");
    expect(result.entities).toEqual({ process_number: "1234567-89.2024.8.26.0100" });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para aprovar a minuta formal do processo", () => {
    const result = route(
      "Pode aprovar a minuta V2 do processo 1234567-89.2024.8.26.0100?",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_workflow");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      workflow_action: "aprovar",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para publicar a minuta formal do processo", () => {
    const result = route(
      "Publique a minuta do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_workflow");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      workflow_action: "Publique",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido de revisao juridica orientada da minuta", () => {
    const result = route(
      "Revise a minuta V2 do processo 1234567-89.2024.8.26.0100 e me diga o que falta antes de aprovar.",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_review_guidance");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para sincronizar a memoria documental do processo", () => {
    const result = route(
      "Sincronize os documentos do processo 1234567-89.2024.8.26.0100 e atualize a memória documental.",
      baseContext
    );

    expect(result.intent).toBe("legal_document_memory_refresh");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para montar o loop supervisionado de revisao da minuta", () => {
    const result = route(
      "Melhore a minuta por seção e monte um plano de revisão da V2 do processo 1234567-89.2024.8.26.0100.",
      baseContext
    );

    expect(result.intent).toBe("legal_draft_revision_loop");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });

  it("detecta pedido para publicar o artifact premium final no drive", () => {
    const result = route(
      "Publique o artifact premium da versão 2 do processo 1234567-89.2024.8.26.0100 no Drive.",
      baseContext
    );

    expect(result.intent).toBe("legal_artifact_publish_premium");
    expect(result.entities).toEqual({
      process_number: "1234567-89.2024.8.26.0100",
      version_number: "2",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.ambiguous).toBe(false);
  });
});
