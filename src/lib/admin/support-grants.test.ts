import { describe, expect, it, vi } from "vitest";
import { getActiveSupportGrant, isSupportGrantActive, supportGrantHasScope } from "./support-grants";

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  };
  return chain;
}

describe("support grants", () => {
  it("reconhece grant ativo dentro da validade", () => {
    expect(isSupportGrantActive({ status: "active", expires_at: "2099-01-01T00:00:00.000Z" })).toBe(true);
    expect(isSupportGrantActive({ status: "revoked", expires_at: "2099-01-01T00:00:00.000Z" })).toBe(false);
    expect(isSupportGrantActive({ status: "active", expires_at: "2020-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("valida escopo do grant", () => {
    const grant: any = {
      id: "grant-1",
      tenant_id: "tenant-1",
      status: "active",
      scope: ["tenant_sensitive_readonly"],
      expires_at: "2099-01-01T00:00:00.000Z",
      requested_by: "superadmin-1",
      created_at: "2026-05-02T10:00:00.000Z",
    };

    expect(supportGrantHasScope(grant, "tenant_sensitive_readonly")).toBe(true);
    expect(supportGrantHasScope(grant, "support_case")).toBe(false);
  });

  it("busca primeiro grant ativo com o escopo exigido", async () => {
    const supabase = {
      from: vi.fn(() => query({
        data: [
          {
            id: "grant-wrong-scope",
            tenant_id: "tenant-1",
            requested_by: "superadmin-1",
            scope: ["setup_diagnostics"],
            status: "active",
            expires_at: "2099-01-01T00:00:00.000Z",
            created_at: "2026-05-02T10:00:00.000Z",
          },
          {
            id: "grant-1",
            tenant_id: "tenant-1",
            requested_by: "superadmin-1",
            scope: ["tenant_sensitive_readonly"],
            status: "active",
            expires_at: "2099-01-01T00:00:00.000Z",
            created_at: "2026-05-02T10:00:00.000Z",
          },
        ],
        error: null,
      })),
    };

    const grant = await getActiveSupportGrant({
      supabase,
      tenantId: "tenant-1",
      requiredScope: "tenant_sensitive_readonly",
    });

    expect(grant?.id).toBe("grant-1");
  });
});

