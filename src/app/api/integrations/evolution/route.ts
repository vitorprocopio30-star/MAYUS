import { NextRequest, NextResponse } from "next/server";

import { getTenantSession } from "@/lib/auth/get-tenant-session";

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;

function validateUrl(url: string): string {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL base invalida.");
  }
  if (PRIVATE_IP.test(parsed.hostname)) {
    throw new Error("URL aponta para rede interna.");
  }
  return parsed.origin;
}

async function readJson(response: Response) {
  return response.json().catch(() => null);
}

export async function POST(request: NextRequest) {
  try {
    await getTenantSession();

    const body = await request.json().catch(() => null);
    const action = String(body?.action || "connect").trim();
    const url = validateUrl(String(body?.url || ""));
    const name = String(body?.name || "").trim();
    const key = String(body?.key || "").trim();

    if (!name || !key) {
      return NextResponse.json({ ok: false, error: "Nome e chave sao obrigatorios." }, { status: 400 });
    }

    if (action === "status") {
      const statusRes = await fetch(`${url}/instance/connectionState/${encodeURIComponent(name)}`, {
        method: "GET",
        headers: { apikey: key },
      });
      const statusData = await readJson(statusRes);

      if (!statusRes.ok) {
        return NextResponse.json({
          ok: false,
          error: statusData?.message || statusData?.error || "Falha ao consultar status.",
          status: statusRes.status,
        }, { status: 502 });
      }

      return NextResponse.json({ ok: true, status: statusData });
    }

    const createRes = await fetch(`${url}/instance/create`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    });
    const createData = await readJson(createRes);

    const createMessage = [
      createData?.response?.message?.[0],
      createData?.message,
      createData?.error,
      typeof createData?.response?.message === "string" ? createData.response.message : null,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    const alreadyExists = createRes.status === 409
      || createMessage.some((value) => value.includes("instance already exists"))
      || createMessage.some((value) => value.includes("already in use"))
      || createMessage.some((value) => value.includes("name") && value.includes("already"));

    if (!createRes.ok && !alreadyExists) {
      return NextResponse.json({
        ok: false,
        stage: "create",
        error: createData?.response?.message?.[0] || createData?.message || "Falha ao criar instancia.",
        status: createRes.status,
      }, { status: 502 });
    }

    const connectRes = await fetch(`${url}/instance/connect/${encodeURIComponent(name)}`, {
      method: "GET",
      headers: { apikey: key },
    });
    const connectData = await readJson(connectRes);

    if (!connectRes.ok) {
      return NextResponse.json({
        ok: false,
        stage: "connect",
        error: connectData?.response?.message || connectData?.message || "Falha ao conectar instancia.",
        status: connectRes.status,
      }, { status: 502 });
    }

    return NextResponse.json({ ok: true, createData, connectData });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Falha ao falar com Evolution." }, { status: 500 });
  }
}
