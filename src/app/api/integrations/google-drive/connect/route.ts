import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import {
  buildGoogleDriveAuthUrl,
  GOOGLE_DRIVE_STATE_COOKIE,
  isGoogleDriveConfigured,
} from "@/lib/services/google-drive";
import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";

export async function GET(request: Request) {
  try {
    await getTenantSession({ requireFullAccess: true });

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json(
        { error: "Google Drive não configurado no servidor." },
        { status: 503 }
      );
    }

    const state = randomUUID();
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_DRIVE_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 600,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.redirect(buildGoogleDriveAuthUrl(request, state));
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.redirect(new URL("/login", resolvePublicAppUrl(request)));
    }

    if (error.message === "Forbidden") {
      const url = new URL("/dashboard/configuracoes/integracoes", resolvePublicAppUrl(request));
      url.searchParams.set("googleDrive", "error");
      url.searchParams.set("message", "Apenas administradores podem conectar o Google Drive.");
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ error: "Erro ao iniciar conexão com Google Drive." }, { status: 500 });
  }
}
