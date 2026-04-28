const CINE_SOURCE_FRAME_COUNT = 169;
export const CINE_FRAME_COUNT = 72;

export const cineFramePath = (n: number) => {
  const sourceFrame =
    1 + Math.floor(((n - 1) / Math.max(1, CINE_FRAME_COUNT - 1)) * (CINE_SOURCE_FRAME_COUNT - 1));
  return `/frames_hero2/frame_${String(sourceFrame).padStart(4, "0")}.jpg`;
};

export type Beat = {
  id: string;
  show: number;
  hide: number;
  label: string;
  quote: string;
  speaker: string;
  film: string;
};

export const BEATS: Beat[] = [
  {
    id: "b1",
    show: 0.1,
    hide: 0.3,
    label: "01 — MONITORAMENTO VIVO",
    quote: "Movimentações deixam de ser ruído e entram na operação como prioridade clara.",
    speaker: "NÚCLEO PROCESSUAL",
    film: "MAYUS OS",
  },
  {
    id: "b2",
    show: 0.35,
    hide: 0.55,
    label: "02 — MINUTAS COM CONTEXTO",
    quote: "O robô prepara rascunhos e artefatos. O escritório revisa, aprova e assina.",
    speaker: "DRAFT FACTORY",
    film: "HUMAN REVIEW",
  },
  {
    id: "b3",
    show: 0.6,
    hide: 0.8,
    label: "03 — MEMÓRIA INSTITUCIONAL",
    quote: "Cada decisão alimenta o sistema e torna a próxima execução mais precisa.",
    speaker: "BRAIN RUNTIME",
    film: "SOBERANIA DIGITAL",
  },
];

export const CINE_INTRO_FADE_END = 0.08;
