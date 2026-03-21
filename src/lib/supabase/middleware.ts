import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasAccess } from "@/lib/permissions";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: Não remova esta linha.
  // Isso faz o refresh do token de sessão automaticamente.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rotas públicas (não precisam de autenticação)
  const publicRoutes = ["/login", "/signup", "/auth/callback", "/auth/update-password", "/auth/aceitar-convite", "/api"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // Se não está logado e tenta acessar rota protegida → redireciona para /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Se já está logado e tenta acessar /login → redireciona para /dashboard
  if (user && request.nextUrl.pathname === "/login") {
    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1')) {
      return supabaseResponse;
    }
    
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // ==== Controle de Acesso MFA (2FA) ====
  if (user && !isPublicRoute) {
    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    
    if (!error && aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
       const url = request.nextUrl.clone();
       url.pathname = "/login"; 
       return NextResponse.redirect(url);
    }
  }

  // ==== RBAC: Controle Dinâmico de Acesso por Perfil ====
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const role = user.app_metadata?.role as string | undefined;
    const customPermissions = (user.app_metadata?.custom_permissions as string[]) || [];
    const path = request.nextUrl.pathname;

    // Pula a checagem para a própria página de acesso negado (evita loop)
    if (path === "/dashboard/acesso-negado") {
      return supabaseResponse;
    }

    // Verifica permissão usando o mapa centralizado
    if (!hasAccess(customPermissions, path, role)) {
      // Loga a tentativa de acesso não autorizado
      try {
        const auditUrl = new URL("/api/audit/security", request.url);
        fetch(auditUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": request.headers.get("x-forwarded-for") || "",
            "user-agent": request.headers.get("user-agent") || ""
          },
          body: JSON.stringify({
            action: "UNAUTHORIZED_ACCESS",
            reason: `Perfil "${role}" tentou acessar rota restrita`,
            originUrl: request.headers.get("referer") || "",
            targetUrl: path
          }),
        }).catch(() => {});
      } catch (e) {
        // Silencioso
      }

      // Redireciona para a página de acesso negado
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/acesso-negado";
      return NextResponse.redirect(url);
    }
  }

  // ==== Verificação de Conta Ativa (Invalidação de Sessão) ====
  // Checa se o usuário foi desativado pelo Admin. Usa cookie de timestamp
  // para evitar consultar o banco em toda requisição (intervalo de 5 min).
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const ACTIVE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
    const lastCheckCookie = request.cookies.get("mayus_active_check")?.value;
    const now = Date.now();
    const shouldCheck = !lastCheckCookie || (now - Number(lastCheckCookie)) > ACTIVE_CHECK_INTERVAL;

    if (shouldCheck) {
      const { data: profileStatus } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .single();

      // Atualiza o cookie de timestamp
      supabaseResponse.cookies.set("mayus_active_check", String(now), {
        path: "/",
        maxAge: 600, // 10 min
        httpOnly: true,
        sameSite: "lax",
      });

      if (profileStatus && profileStatus.is_active === false) {
        // Conta desativada → força logout e redireciona
        await supabase.auth.signOut();
        
        // Limpa o cookie de checagem
        supabaseResponse.cookies.delete("mayus_active_check");
        
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("reason", "account_disabled");
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
