export type DemoModeFeatures = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDemoModeEnabled(features: DemoModeFeatures): boolean {
  if (!isRecord(features)) return false;
  if (features.demo_mode === true) return true;
  return isRecord(features.demo) && features.demo.enabled === true;
}

