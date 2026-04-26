const EXECUTIVE_ROLES = ["admin", "administrador", "socio", "sócio", "mayus_admin"] as const;

export function isBrainExecutiveRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return EXECUTIVE_ROLES.includes(normalized as (typeof EXECUTIVE_ROLES)[number]);
}
