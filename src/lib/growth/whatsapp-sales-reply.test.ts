import { describe, expect, it } from "vitest";
import { buildWhatsAppSalesReply } from "./whatsapp-sales-reply";

const salesProfile = {
  idealClient: "beneficiarios do INSS com negativa recente e urgencia de renda",
  coreSolution: "entender chance real, documentos faltantes e caminho para destravar o beneficio",
  uniqueValueProposition: "Diagnostico previdenciario consultivo antes de qualquer promessa.",
  valuePillars: ["Diagnostico", "Provas", "Plano de acao"],
  positioningSummary: "Atendimento previdenciario consultivo.",
};

describe("buildWhatsAppSalesReply", () => {
  it("gera resposta consultiva para WhatsApp e permite primeiro autoenvio seguro", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Maria Silva",
      messages: [
        { direction: "inbound", content: "Oi, meu beneficio foi negado e queria entender se voces podem ajudar." },
      ],
      salesProfile,
    });

    expect(reply.mode).toBe("suggested_reply");
    expect(reply.suggestedReply).toContain("Maria");
    expect(reply.suggestedReply).toMatch(/o que aconteceu/i);
    expect(reply.mayAutoSend).toBe(true);
    expect(reply.externalSideEffectsBlocked).toBe(false);
    expect(reply.requiresHumanReview).toBe(false);
    expect(reply.firstResponseSlaMinutes).toBe(5);
  });

  it("prepara primeira resposta contextual quando falta perfil comercial do escritorio", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Carlos",
      messages: [
        { direction: "inbound", content: "Tenho um problema trabalhista, voces atendem?" },
      ],
      salesProfile: null,
    });

    expect(reply.mode).toBe("suggested_reply");
    expect(reply.suggestedReply).toContain("MAYUS");
    expect(reply.internalNote).toContain("mensagem do lead");
    expect(reply.riskFlags).toContain("missing_firm_profile");
    expect(reply.mayAutoSend).toBe(true);
  });

  it("exige revisao humana para preco, contrato ou urgencia juridica", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Joao",
      messages: [
        { direction: "inbound", content: "Quanto custa? Tenho prazo urgente e preciso de garantia de ganhar." },
      ],
      salesProfile,
    });

    expect(reply.mode).toBe("human_review_required");
    expect(reply.riskFlags).toEqual(expect.arrayContaining([
      "price_question",
      "legal_result_risk",
      "legal_urgency",
    ]));
    expect(reply.mayAutoSend).toBe(false);
    expect(reply.requiresHumanReview).toBe(true);
  });

  it("recomenda handoff e bloqueia autoenvio quando o lead pede humano", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Ana Paula",
      messages: [
        { direction: "inbound", content: "Quero falar com um advogado responsavel." },
      ],
      salesProfile,
    });

    expect(reply.mode).toBe("human_review_required");
    expect(reply.riskFlags).toContain("human_requested");
    expect(reply.handoffRecommended).toBe(true);
    expect(reply.mayAutoSend).toBe(false);
    expect(reply.requiresHumanReview).toBe(true);
  });
});
