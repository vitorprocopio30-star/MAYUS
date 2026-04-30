import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

const getTenantSessionMock = vi.mocked(getTenantSession);
const supabaseFromMock = vi.mocked(supabaseAdmin.from);

describe("/api/documentos/drive-scan/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
  });

  it("lists pending review actions with file and process context", async () => {
    supabaseFromMock.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({
          data: table === "drive_scan_actions"
            ? [{
                id: "action-1",
                scan_run_id: "scan-1",
              scan_item_id: "item-1",
              target_process_task_id: "process-1",
              action_type: "move_to_process_folder",
              confidence: "medium",
              status: "review_required",
            }]
            : [],
          error: null,
        })),
      };

      if (table === "drive_scan_items") {
        chain.in = vi.fn(async () => ({
          data: [{ id: "item-1", name: "documento.pdf", drive_file_id: "file-1" }],
          error: null,
        }));
      }

      if (table === "drive_scan_runs") {
        chain.in = vi.fn(async () => ({
          data: [{ id: "scan-1", root_folder_name: "Acervo antigo" }],
          error: null,
        }));
      }

      if (table === "process_tasks") {
        chain.in = vi.fn(async () => ({
          data: [{ id: "process-1", title: "Caso Cliente", process_number: "0000001" }],
          error: null,
        }));
      }

      return chain;
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/drive-scan/review"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      summary: {
        total: 1,
        movable: 1,
        byConfidence: { medium: 1 },
      },
      items: [{
        id: "action-1",
        file: { name: "documento.pdf" },
        scanRun: { root_folder_name: "Acervo antigo" },
        targetProcess: { title: "Caso Cliente" },
      }],
    });
  });

  it("approves a pending action for later supervised apply", async () => {
    supabaseFromMock.mockImplementation(() => {
      const chain: any = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        select: vi.fn(async () => ({
          data: [{ id: "action-1", scan_run_id: "scan-1", action_type: "move_to_process_folder", status: "approved" }],
          error: null,
        })),
      };
      return chain;
    });

    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/review", {
      method: "POST",
      body: JSON.stringify({ actionId: "action-1", decision: "approve" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      action: { id: "action-1", scan_run_id: "scan-1", status: "approved" },
      updatedCount: 1,
    });
  });

  it("rejects multiple pending actions in one decision", async () => {
    supabaseFromMock.mockImplementation(() => {
      const chain: any = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        select: vi.fn(async () => ({
          data: [
            { id: "action-1", scan_run_id: "scan-1", action_type: "request_review", status: "rejected" },
            { id: "action-2", scan_run_id: "scan-1", action_type: "mark_duplicate", status: "rejected" },
          ],
          error: null,
        })),
      };
      return chain;
    });

    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/review", {
      method: "POST",
      body: JSON.stringify({ actionIds: ["action-1", "action-2"], decision: "reject" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      updatedCount: 2,
      actions: [
        { id: "action-1", status: "rejected" },
        { id: "action-2", status: "rejected" },
      ],
    });
  });
});
