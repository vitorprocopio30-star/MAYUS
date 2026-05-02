import { describe, expect, it, vi, beforeEach } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { GET } from "./route";

describe("public playbook report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("entrega HTML quando o token bate com o artifact", async () => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "artifact-1",
          title: "Playbook diario",
          metadata: { html_report: "<!DOCTYPE html><html><body>Relatorio</body></html>" },
        },
        error: null,
      })),
    };
    fromMock.mockReturnValue(query);

    const response = await GET(new Request("https://mayus.app/r/playbook/token12345678901"), {
      params: { token: "token12345678901" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Relatorio");
    expect(query.eq).toHaveBeenCalledWith("metadata->>html_report_share_token", "token12345678901");
  });

  it("bloqueia token invalido sem consultar banco", async () => {
    const response = await GET(new Request("https://mayus.app/r/playbook/x"), {
      params: { token: "x" },
    });

    expect(response.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
