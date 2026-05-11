import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAYUS_REALTIME_VOICE,
  buildMayusRealtimeInstructions,
  estimateMayusRealtimeUsageCost,
  normalizeMayusRealtimeVoice,
} from "./realtime-persona";

describe("mayus realtime persona", () => {
  it("normaliza voz desconhecida para cedar", () => {
    expect(normalizeMayusRealtimeVoice("marin")).toBe("marin");
    expect(normalizeMayusRealtimeVoice("onyx")).toBe(DEFAULT_MAYUS_REALTIME_VOICE);
  });

  it("inclui personalidade e governanca do MAYUS", () => {
    const instructions = buildMayusRealtimeInstructions({
      userName: "Vitor",
      officeName: "Dutra Advocacia",
      selectedVoice: "cedar",
    });

    expect(instructions).toContain("MAYUS AI");
    expect(instructions).toContain("Dutra Advocacia");
    expect(instructions).toContain("consultar_cerebro_mayus");
    expect(instructions).toContain("Nunca invente processo");
    expect(instructions).toContain("frases curtas");
  });

  it("estima custo de texto e audio em USD e BRL", () => {
    const estimate = estimateMayusRealtimeUsageCost({
      input_token_details: { text_tokens: 1000, audio_tokens: 1000 },
      output_token_details: { text_tokens: 1000, audio_tokens: 1000 },
    }, 5);

    expect(estimate.usd).toBeCloseTo(0.124, 4);
    expect(estimate.brl).toBeCloseTo(0.62, 2);
  });
});
