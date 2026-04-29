import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import {
  buildGoogleCalendarAuthUrl,
  GOOGLE_CALENDAR_STATE_COOKIE,
  getGoogleCalendarSetupInfo,
  isGoogleCalendarConfigured,
} from "@/lib/services/google-calendar";
import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";

export async function GET(request: Request) {
  try {
    await getTenantSession();

    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json(
        { error: "Google Agenda não configurado no servidor.", setup: getGoogleCalendarSetupInfo(request) },
        { status: 503 }
      );
    }

    const state = randomUUID();
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_CALENDAR_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 600,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.redirect(buildGoogleCalendarAuthUrl(request, state));
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.redirect(new URL("/login", resolvePublicAppUrl(request)));
    }

    return NextResponse.json({ error: "Erro ao iniciar conexão com Google Agenda." }, { status: 500 });
  }
}
