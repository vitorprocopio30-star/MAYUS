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
    expect(reply.mayAutoSend).toBe(true);
    expect(reply.externalSideEffectsBlocked).toBe(false);
    expect(reply.requiresHumanReview).toBe(false);
    expect(reply.firstResponseSlaMinutes).toBe(5);
  });

  it("usa fallback comercial seguro quando falta perfil comercial do escritorio", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Carlos",
      messages: [
        { direction: "inbound", content: "Tenho um problema trabalhista, voces atendem?" },
      ],
      salesProfile: null,
    });

    expect(reply.mode).toBe("suggested_reply");
    expect(reply.leadTopic).toBe("employment");
    expect(reply.suggestedReply).toContain("demissao");
    expect(reply.internalNote).toContain("fallback comercial");
    expect(reply.riskFlags).toContain("missing_firm_profile");
    expect(reply.mayAutoSend).toBe(true);
  });

  it("responde contracheque de forma especifica sem discurso institucional", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Vitor Procopio",
      messages: [
        { direction: "inbound", content: "Quero saber se tenho direito ao desconto do meu contracheque" },
      ],
      salesProfile: null,
    });

    expect(reply.mode).toBe("suggested_reply");
    expect(reply.leadTopic).toBe("payroll_discount");
    expect(reply.suggestedReply).toContain("Vitor");
    expect(reply.suggestedReply).toContain("qual nome no contracheque");
    expect(reply.suggestedReply).toContain("comecou em que mes");
    expect(reply.suggestedReply).toContain("print so da parte do desconto");
    expect(reply.suggestedReply).not.toContain("O Escritorio conduz");
    expect(reply.suggestedReply).not.toContain("Esse atendimento e de qual area");
    expect(reply.riskFlags).toEqual(expect.arrayContaining(["legal_triage", "missing_firm_profile"]));
    expect(reply.mayAutoSend).toBe(true);
  });

  it("bloqueia abertura repetida quando o MAYUS ja se apresentou", () => {
    const reply = buildWhatsAppSalesReply({
      contactName: "Vitor",
      messages: [
        { direction: "outbound", content: "Oi, Vitor. Aqui e o MAYUS, assistente do Escritorio." },
        { direction: "inbound", content: "Preciso de ajuda" },
      ],
      salesProfile,
    });

    expect(reply.repeatedOpenerBlocked).toBe(true);
    expect(reply.suggestedReply).not.toContain("Aqui e o MAYUS");
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
});
