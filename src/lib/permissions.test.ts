import { describe, expect, it } from "vitest";
import { hasAccess } from "./permissions";

describe("permissions", () => {
  it("keeps regular agenda access for agenda module users", () => {
    expect(hasAccess(["agenda"], "/dashboard/agenda", "advogado")).toBe(true);
  });

  it("blocks agenda admin for non full-access agenda users", () => {
    expect(hasAccess(["agenda"], "/dashboard/agenda-admin", "advogado")).toBe(false);
  });

  it("allows agenda admin for full-access roles", () => {
    expect(hasAccess([], "/dashboard/agenda-admin", "admin")).toBe(true);
    expect(hasAccess([], "/dashboard/agenda-admin", "socio")).toBe(true);
    expect(hasAccess([], "/dashboard/agenda-admin", "mayus_admin")).toBe(true);
  });
});
