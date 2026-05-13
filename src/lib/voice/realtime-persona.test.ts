import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAYUS_REALTIME_MODEL,
  DEFAULT_MAYUS_REALTIME_VOICE,
  MAYUS_REALTIME_TOOLS,
  MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL,
  REALTIME_MODEL_OPTIONS,
  buildMayusRealtimeInstructions,
  estimateMayusRealtimeUsageCost,
  normalizeMayusRealtimeModel,
  normalizeMayusRealtimeVoice,
} from "./realtime-persona";

describe("mayus realtime persona", () => {
  it("normaliza voz desconhecida para cedar", () => {
    expect(normalizeMayusRealtimeVoice("marin")).toBe("marin");
    expect(normalizeMayusRealtimeVoice("onyx")).toBe(DEFAULT_MAYUS_REALTIME_VOICE);
  });

  it("normaliza modelo realtime para a allowlist do MAYUS", () => {
    expect(REALTIME_MODEL_OPTIONS.map((model) => model.value)).toEqual([
      "gpt-realtime-2",
      "gpt-realtime-mini",
    ]);
    expect(normalizeMayusRealtimeModel("gpt-realtime-mini")).toBe("gpt-realtime-mini");
    expect(normalizeMayusRealtimeModel("gpt-realtime-2-mini")).toBe(DEFAULT_MAYUS_REALTIME_MODEL);
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
    expect(instructions).toContain("criar_tarefa_mayus");
    expect(instructions).toContain("pesquisar_web_mayus");
    expect(instructions).toContain("responder_sobre_mayus");
    expect(instructions).toContain("Nunca invente processo");
    expect(instructions).toContain("frases curtas");
  });

  it("expoe ferramentas do piloto realtime", () => {
    expect(MAYUS_REALTIME_TOOLS.map((tool) => tool.name)).toEqual([
      "consultar_cerebro_mayus",
      "criar_tarefa_mayus",
      "pesquisar_web_mayus",
      "responder_sobre_mayus",
    ]);
    const brainTool = MAYUS_REALTIME_TOOLS.find((tool) => tool.name === "consultar_cerebro_mayus") as any;
    expect(brainTool?.parameters.properties.missionKind.enum).toEqual([
      "case_status",
      "process_mission_plan",
      "process_execute_next",
      "general_brain",
    ]);
    expect(MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL).toBe(0.01);
  });

  it("estima custo de texto e audio em USD e BRL", () => {
    const estimate = estimateMayusRealtimeUsageCost({
      input_token_details: { text_tokens: 1000, audio_tokens: 1000 },
      output_token_details: { text_tokens: 1000, audio_tokens: 1000 },
    }, 5);

    expect(estimate.usd).toBeCloseTo(0.124, 4);
    expect(estimate.brl).toBeCloseTo(0.62, 2);
  });

  it("estima custo menor para gpt-realtime-mini", () => {
    const estimate = estimateMayusRealtimeUsageCost({
      input_token_details: { text_tokens: 1000, audio_tokens: 1000 },
      output_token_details: { text_tokens: 1000, audio_tokens: 1000 },
    }, 5, "gpt-realtime-mini");

    expect(estimate.model).toBe("gpt-realtime-mini");
    expect(estimate.usd).toBeCloseTo(0.033, 4);
    expect(estimate.brl).toBeCloseTo(0.165, 3);
  });
});
