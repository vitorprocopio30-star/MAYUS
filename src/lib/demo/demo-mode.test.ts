import { describe, expect, it } from "vitest";
import { isDemoModeEnabled } from "./demo-mode";

describe("isDemoModeEnabled", () => {
  it("aceita flag demo_mode no topo", () => {
    expect(isDemoModeEnabled({ demo_mode: true })).toBe(true);
  });

  it("aceita contrato demo.enabled", () => {
    expect(isDemoModeEnabled({ demo: { enabled: true } })).toBe(true);
  });

  it("bloqueia valores falsy ou malformados", () => {
    expect(isDemoModeEnabled(null)).toBe(false);
    expect(isDemoModeEnabled([] as unknown as Record<string, unknown>)).toBe(false);
    expect(isDemoModeEnabled({ demo_mode: false, demo: { enabled: false } })).toBe(false);
  });
});

