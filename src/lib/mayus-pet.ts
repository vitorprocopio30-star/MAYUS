export type MayusPetVariant = "black" | "white";

export type MayusPetState =
  | "idle"
  | "running"
  | "waiting"
  | "review"
  | "failed"
  | "waving"
  | "jumping"
  | "running-left"
  | "running-right";

export type MayusPetStateMeta = {
  row: number;
  frameCount: number;
  durationMs: number;
};

export type MayusPetVariantMeta = {
  id: MayusPetVariant;
  name: string;
  description: string;
  publicPath: string;
  manifestPath: string;
};

export const MAYUS_PET_DEFAULT_VARIANT: MayusPetVariant = "black";

export const MAYUS_PET_ATLAS = {
  width: 1536,
  height: 1872,
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rows: 9,
} as const;

export const MAYUS_PET_VARIANTS: Record<MayusPetVariant, MayusPetVariantMeta> = {
  black: {
    id: "black",
    name: "Preto",
    description: "Mascote preto premium do MAYUS.",
    publicPath: "/mayus-pets/black/spritesheet.webp",
    manifestPath: "/mayus-pets/black/pet.json",
  },
  white: {
    id: "white",
    name: "Branco",
    description: "Mascote branco do MAYUS.",
    publicPath: "/mayus-pets/white/spritesheet.webp",
    manifestPath: "/mayus-pets/white/pet.json",
  },
};

export const MAYUS_PET_STATES: Record<MayusPetState, MayusPetStateMeta> = {
  idle: { row: 0, frameCount: 6, durationMs: 2600 },
  "running-right": { row: 1, frameCount: 8, durationMs: 1500 },
  "running-left": { row: 2, frameCount: 8, durationMs: 1500 },
  waving: { row: 3, frameCount: 4, durationMs: 2200 },
  jumping: { row: 4, frameCount: 5, durationMs: 1700 },
  failed: { row: 5, frameCount: 8, durationMs: 2400 },
  waiting: { row: 6, frameCount: 6, durationMs: 2600 },
  running: { row: 7, frameCount: 6, durationMs: 1500 },
  review: { row: 8, frameCount: 6, durationMs: 2400 },
};

export function normalizeMayusPetVariant(value: unknown): MayusPetVariant | null {
  return value === "black" || value === "white" ? value : null;
}

export function getMayusPetVariant(value: unknown): MayusPetVariant {
  return normalizeMayusPetVariant(value) || MAYUS_PET_DEFAULT_VARIANT;
}

export function normalizeMayusPetState(value: unknown): MayusPetState {
  return typeof value === "string" && value in MAYUS_PET_STATES
    ? (value as MayusPetState)
    : "idle";
}

export function resolveMayusOrbPetState(params: {
  stage: string;
  status?: string | null;
}): MayusPetState {
  if (params.status === "failed") return "failed";
  if (params.status === "awaiting_approval") return "waiting";
  if (params.stage === "working" || params.status === "executing") return "running";
  if (params.stage === "presenting") return "review";
  return "idle";
}
