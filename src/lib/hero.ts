const SOURCE_FRAME_COUNT = 169;
export const FRAME_COUNT = 72;

export const framePath = (n: number) => {
  const sourceFrame =
    1 + Math.floor(((n - 1) / Math.max(1, FRAME_COUNT - 1)) * (SOURCE_FRAME_COUNT - 1));
  return `/frames/frame_${String(sourceFrame).padStart(4, "0")}.jpg`;
};

export type Dialogue = {
  id: string;
  show: number;
  hide: number;
  quote: string;
  speaker: string;
  film: string;
};

export const DIALOGUES: Dialogue[] = [
  {
    id: "d1",
    show: 0.1,
    hide: 0.3,
    quote: "O prazo nasce como dado. O MAYUS transforma em missão, responsável e contexto.",
    speaker: "MAYUS Operações",
    film: "MONITORAMENTO",
  },
  {
    id: "d2",
    show: 0.35,
    hide: 0.55,
    quote: "A máquina executa a rotina. O advogado preserva estratégia, critério e aprovação.",
    speaker: "MAYUS Intelligence",
    film: "HUMAN-IN-THE-LOOP",
  },
  {
    id: "d3",
    show: 0.6,
    hide: 0.8,
    quote: "Soberania digital é operar com memória própria, dados próprios e velocidade própria.",
    speaker: "Devini Labs",
    film: "MAYUS OS",
  },
];

export const HERO_TEXT_FADE_END = 0.08;
