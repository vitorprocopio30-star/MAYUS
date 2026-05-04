import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/cadastro",
  "/onboarding",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/auth/callback",
  "/auth/update-password",
  "/auth/aceitar-convite",
  "/r/playbook",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => (
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  ));
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => (
    cookie.name.startsWith("sb-")
    && cookie.name.includes("-auth-token")
    && Boolean(cookie.value)
  ));
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next({ request });

  if (
    pathname.startsWith("/_next")
    || pathname.startsWith("/api")
    || pathname === "/favicon.ico"
    || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json)$/i.test(pathname)
  ) {
    return response;
  }

  if (!hasSupabaseAuthCookie(request) && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return response;
}
