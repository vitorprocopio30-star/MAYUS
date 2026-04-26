// =======================================================================
// permissions.ts
// Mapa Centralizado de Permissões RBAC (Dinâmico)
// =======================================================================

// Definição dos Módulos Disponíveis para Checkboxes de Permissão
export const APP_MODULES = [
  { id: "dashboard", label: "Dashboard & KPIs" },
  { id: "agenda", label: "Agenda & Tarefas" },
  { id: "clientes", label: "CRM & Clientes" },
  { id: "processos", label: "Processos Jurídicos & Prazos" },
  { id: "documentos", label: "Gerador de Peças & Documentos" },
  { id: "faturamento", label: "Financeiro & Honorários" },
  { id: "marketing", label: "Ads & Redes Sociais" },
  { id: "equipe", label: "Equipe & Performance" },
  { id: "config_agentes", label: "Configurações Globais & IAs" },
] as const;

export type AppModuleId = typeof APP_MODULES[number]["id"] | "ALL";

export const FULL_ACCESS_ROLES = ["Administrador", "admin", "Sócio", "socio", "mayus_admin"] as const;
export const STANDARD_ACCESS_ROLES = ["Administrador", "Sócio", "Advogado", "Estagiário", "Financeiro", "SDR", "mayus_admin"] as const;

const CANONICAL_FULL_ACCESS_ROLES = ["admin", "socio", "mayus_admin"] as const;
const CANONICAL_STANDARD_ACCESS_ROLES = ["admin", "socio", "advogado", "estagiario", "financeiro", "sdr", "mayus_admin"] as const;

export function toCanonicalAccessRole(role: unknown): string {
  const compact = String(role || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (compact === "administrador" || compact === "admin") return "admin";
  if (compact === "socio") return "socio";
  if (compact === "advogado" || compact === "advogada") return "advogado";
  if (compact === "estagiario") return "estagiario";
  if (compact === "financeiro") return "financeiro";
  if (compact === "sdr") return "sdr";
  if (compact === "mayus_admin") return "mayus_admin";

  return compact;
}

export function normalizeAccessRole(role: unknown): string {
  const raw = String(role || "").trim();
  const compact = toCanonicalAccessRole(raw);

  if (compact === "admin") return "Administrador";
  if (compact === "socio") return "Sócio";
  if (compact === "advogado") return "Advogado";
  if (compact === "estagiario") return "Estagiário";
  if (compact === "financeiro") return "Financeiro";
  if (compact === "sdr") return "SDR";
  if (compact === "mayus_admin") return "mayus_admin";

  return raw;
}

export function isFullAccessRole(role?: string): boolean {
  if (!role) return false;
  const canonicalRole = toCanonicalAccessRole(role);
  return CANONICAL_FULL_ACCESS_ROLES.includes(canonicalRole as (typeof CANONICAL_FULL_ACCESS_ROLES)[number]);
}

export function isStandardAccessRole(role?: string): boolean {
  if (!role) return false;
  const canonicalRole = toCanonicalAccessRole(role);
  return CANONICAL_STANDARD_ACCESS_ROLES.includes(canonicalRole as (typeof CANONICAL_STANDARD_ACCESS_ROLES)[number]);
}

// Mapeamento de Rotas (pathname) para qual Módulo ela pertence
export const ROUTE_TO_MODULE: Record<string, AppModuleId> = {
  "/dashboard": "dashboard",
  "/dashboard/mural": "dashboard",
  "/dashboard/agenda": "agenda",
  "/dashboard/agenda-global": "agenda",
  "/dashboard/clientes": "clientes",
  "/dashboard/leads": "clientes",
  "/dashboard/contratos": "clientes",
  "/dashboard/crm": "clientes",
  "/dashboard/vendas": "clientes",
  "/dashboard/processos": "processos",
  "/dashboard/operacoes": "processos",
  "/dashboard/operacoes/monitoramento": "processos",
  "/dashboard/operacoes/prazos": "processos",
  "/dashboard/prazos": "processos",
  "/dashboard/documentos": "documentos",
  "/dashboard/faturamento": "faturamento",
  "/dashboard/honorarios": "faturamento",
  "/dashboard/marketing": "marketing",
  "/dashboard/conversas": "equipe",
  "/dashboard/bi": "equipe",
  "/dashboard/relatorios": "equipe",
  "/dashboard/mayus": "config_agentes",
  "/dashboard/equipe-ia": "config_agentes",
  "/dashboard/equipe": "equipe",
  "/dashboard/configuracoes": "config_agentes",
  "/dashboard/configuracoes/departamentos": "config_agentes",
  "/dashboard/configuracoes/comercial": "config_agentes",
  "/dashboard/configuracoes/usuarios": "config_agentes",
};

// -----------------------------------------------------------------------
// Verifica se o array de permissões do usuário dá acesso à rota
// -----------------------------------------------------------------------
export function hasAccess(customPermissions: string[], pathname: string, role?: string): boolean {
  // Administrador dono tem acesso total independente de chaves
  if (isFullAccessRole(role) || customPermissions.includes("ALL")) return true;

  // A raiz do dashboard pode ser acessada se tiver permissão "dashboard"
  if (pathname === "/dashboard") {
    return customPermissions.includes("dashboard") || customPermissions.length > 0;
  }

  // Verifica prefixos (ignorando /dashboard genérico)
  const matchingPrefixes = Object.keys(ROUTE_TO_MODULE).filter(
    route => route !== "/dashboard" && pathname.startsWith(route)
  );

  // Rotas que não estão mapeadas (ex: perfil próprio, 404) ficam abertas ou requerem auth simples
  if (matchingPrefixes.length === 0) return true; 

  // Pega a rota mais específica
  const longestMatch = matchingPrefixes.reduce((a, b) => a.length > b.length ? a : b);
  const requiredModule = ROUTE_TO_MODULE[longestMatch];

  return customPermissions.includes(requiredModule);
}

// -----------------------------------------------------------------------
// Retorna a lista de prefixos permitidos p/ a Sidebar (filtragem visual)
// -----------------------------------------------------------------------
export function getAllowedHrefs(customPermissions: string[] | undefined, role?: string): string[] {
  if (isFullAccessRole(role)) return ["ALL"];
  if (!customPermissions || customPermissions.length === 0) return [];
  if (customPermissions.includes("ALL")) return ["ALL"];

  const allowedRoutes: string[] = ["/dashboard"];
  
  // Para cada permissão que o usuário tem, libera a rota correspondente
  for (const modName of customPermissions) {
    for (const [route, mappedModule] of Object.entries(ROUTE_TO_MODULE)) {
      if (mappedModule === modName && !allowedRoutes.includes(route)) {
        allowedRoutes.push(route);
      }
    }
  }

  return allowedRoutes;
}

// -----------------------------------------------------------------------
// Validação de Senha Forte
// -----------------------------------------------------------------------
export function isStrongPassword(password: string): boolean {
  if (password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  return hasLetter && hasNumber && hasSymbol;
}

export function getPasswordStrength(password: string) {
  return {
    minLength: password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^a-zA-Z0-9]/.test(password),
  };
}
