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
  "/dashboard/configuracoes/usuarios": "config_agentes",
};

// -----------------------------------------------------------------------
// Verifica se o array de permissões do usuário dá acesso à rota
// -----------------------------------------------------------------------
export function hasAccess(customPermissions: string[], pathname: string, role?: string): boolean {
  // Administrador dono tem acesso total independente de chaves
  if (role === "Administrador" || role === "admin" || customPermissions.includes("ALL")) return true;

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
  if (role === "Administrador" || role === "admin") return ["ALL"];
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
