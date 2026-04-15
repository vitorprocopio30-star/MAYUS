import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasAccess } from "@/lib/permissions";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Proteção contra interceptação de arquivos internos do Next.js e estáticos
  // Isso evita que o middleware tente processar sessões para arquivos de sistema,
  // prevenindo erros de MIME type mismatch (HTML sendo retornado como JS/CSS).
  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname.startsWith("/favicon.ico") ||
    request.nextUrl.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp)$/)
  ) {
    return supabaseResponse;
  }

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
  const publicRoutes = ["/", "/login", "/signup", "/cadastro", "/onboarding", "/auth/callback", "/auth/update-password", "/auth/aceitar-convite", "/api", "/_next"];
  const isPublicRoute = publicRoutes.some((route) =>
    route === "/" ? request.nextUrl.pathname === "/" : request.nextUrl.pathname.startsWith(route)
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
    let role = user.app_metadata?.role as string | undefined;
    let customPermissions = (user.app_metadata?.custom_permissions as string[]) || [];
    const appTenantId = user.app_metadata?.tenant_id as string | undefined;
    const path = request.nextUrl.pathname;

    // Pula a checagem para a própria página de acesso negado (evita loop)
    if (path === "/dashboard/acesso-negado") {
      return supabaseResponse;
    }

    // Fallback para perfis antigos/inconsistentes: usa dados de profiles
    // quando o token nao possui dados suficientes para RBAC.
    if (!role || customPermissions.length === 0 || !appTenantId) {
      const { data: profileAccess } = await supabase
        .from("profiles")
        .select("role, custom_permissions")
        .eq("id", user.id)
        .maybeSingle();

      if (profileAccess) {
        role = role || (profileAccess.role as string | undefined);
        if (customPermissions.length === 0) {
          customPermissions = Array.isArray(profileAccess.custom_permissions)
            ? (profileAccess.custom_permissions as string[])
            : [];
        }
      }
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

  // ==== Proteção da rota /admin — apenas superadmin ====
  if (user && request.nextUrl.pathname.startsWith("/admin")) {
    console.log('[ADMIN] Iniciando verificação para:', user.id)
    
    const supabaseAdmin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_superadmin")
      .eq("id", user.id)
      .single()

    console.log('[ADMIN] profileData:', profileData)
    console.log('[ADMIN] profileError:', profileError)
    console.log('[ADMIN] is_superadmin:', profileData?.is_superadmin)

    if (!profileData?.is_superadmin) {
      console.log('[ADMIN] BLOQUEADO — redirecionando para /dashboard')
      const url = request.nextUrl.clone()
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    }
    
    console.log('[ADMIN] PERMITIDO — deixando passar')
  }

  return supabaseResponse;
}
