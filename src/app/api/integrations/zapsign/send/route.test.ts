import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createClientMock,
  createFromTemplateMock,
  requireTenantApiKeyMock,
  supabaseFromMock,
} = vi.hoisted(() => {
  const localFromMock = vi.fn();

  return {
    createClientMock: vi.fn(() => ({ from: localFromMock })),
    createFromTemplateMock: vi.fn(),
    requireTenantApiKeyMock: vi.fn(),
    supabaseFromMock: localFromMock,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/services/zapsign", () => ({
  ZapSignService: {
    createFromTemplate: createFromTemplateMock,
  },
}));

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: requireTenantApiKeyMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/integrations/zapsign/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContactQuery(contact: Record<string, unknown> | null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => ({ data: contact, error: null })),
  };
  return query;
}

function makeMessagesQuery() {
  return {
    insert: vi.fn(async () => ({ error: null })),
  };
}

describe("POST /api/integrations/zapsign/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "zapsign-key" });
    createFromTemplateMock.mockResolvedValue({
      token: "doc-token",
      signers: [{ sign_url: "https://zapsign.test/sign" }],
    });
  });

  it("rejeita parametros obrigatorios ausentes", async () => {
    const response = await POST(buildRequest({ tenant_id: "tenant-1" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Parâmetros insuficientes" });
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
  });

  it("envia contrato sem contato usando chave Vault do tenant", async () => {
    const response = await POST(buildRequest({
      tenant_id: "tenant-1",
      template_id: "template-1",
      doc_name: "Contrato Custom",
      variables: [{ variable: "nome", value: "Maria" }],
    }));

    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "zapsign");
    expect(createFromTemplateMock).toHaveBeenCalledWith({
      apiToken: "zapsign-key",
      templateId: "template-1",
      docName: "Contrato Custom",
      externalId: undefined,
      signers: [{ name: "Cliente", email: undefined, phone_number: undefined }],
      variables: [{ variable: "nome", value: "Maria" }],
    });
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      sign_url: "https://zapsign.test/sign",
      doc_token: "doc-token",
    });
  });

  it("busca contato e registra mensagem quando contact_id e informado", async () => {
    const contactQuery = makeContactQuery({ name: "Maria Cliente", phone_number: "+5511999999999" });
    const messagesQuery = makeMessagesQuery();
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === "whatsapp_contacts") return contactQuery;
      if (table === "whatsapp_messages") return messagesQuery;
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      template_id: "template-1",
    }));

    expect(contactQuery.eq).toHaveBeenCalledWith("id", "contact-1");
    expect(createFromTemplateMock).toHaveBeenCalledWith(expect.objectContaining({
      docName: "Contrato - Maria Cliente",
      externalId: "contact-1",
      signers: [{ name: "Maria Cliente", email: undefined, phone_number: "+5511999999999" }],
    }));
    expect(messagesQuery.insert).toHaveBeenCalledWith([expect.objectContaining({
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "outbound",
      status: "sent",
    })]);
    expect(response.status).toBe(200);
  });

  it("propaga erro de servico como 500", async () => {
    createFromTemplateMock.mockRejectedValueOnce(new Error("ZapSign down"));

    const response = await POST(buildRequest({ tenant_id: "tenant-1", template_id: "template-1" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "ZapSign down" });
  });
});
