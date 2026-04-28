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
  it("gera resposta consultiva para WhatsApp sem permitir autoenvio", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Maria Silva",
      messages: [
        { direction: "inbound", content: "Oi, meu beneficio foi negado e queria entender se voces podem ajudar." },
      ],
      salesProfile,
    });

    expect(reply.mode).toBe("suggested_reply");
    expect(reply.suggestedReply).toContain("Maria");
    expect(reply.mayAutoSend).toBe(false);
    expect(reply.externalSideEffectsBlocked).toBe(true);
    expect(reply.requiresHumanReview).toBe(true);
  });

  it("bloqueia resposta ao lead quando falta perfil comercial do escritorio", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Carlos",
      messages: [
        { direction: "inbound", content: "Tenho um problema trabalhista, voces atendem?" },
      ],
      salesProfile: null,
    });

    expect(reply.mode).toBe("internal_setup_required");
    expect(reply.suggestedReply).toBeNull();
    expect(reply.internalNote).toContain("configure o perfil comercial");
    expect(reply.riskFlags).toContain("missing_firm_profile");
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
      "commercial_commitment",
      "legal_result_risk",
      "legal_urgency",
    ]));
  });
});
