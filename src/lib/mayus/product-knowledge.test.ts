import { describe, expect, it } from "vitest";
import { answerMayusProductQuestion } from "./product-knowledge";

describe("answerMayusProductQuestion", () => {
  it("responde sobre o MAYUS com base interna e fontes", () => {
    const result = answerMayusProductQuestion("O que e o MAYUS e o que ele executa?");

    expect(result.answer).toContain("socio operacional de IA");
    expect(result.answer).toContain("Brain");
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

