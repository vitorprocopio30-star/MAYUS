import { describe, expect, it } from "vitest";
import {
  buildWhatsAppAgentTurnV2,
  buildWhatsAppMediaContexts,
  resolveWhatsAppDeliveryPolicy,
} from "./agent-v2";

describe("WhatsAppAgentV2", () => {
  it("entrega resposta imediata para operador autorizado", () => {
    const policy = resolveWhatsAppDeliveryPolicy({
      actorContext: {
        role: "office_operator",
        sender_phone_authorized: true,
        reason: "daily_playbook_authorized_phone",
      },
      outputModality: "text",
      trigger: "evolution_webhook",
      replyText: "Vitor, localizei o processo e ja vou te passar o resumo.",
    });

    expect(policy).toEqual(expect.objectContaining({
      profile: "office_operator_instant",
      humanizeDelivery: false,
      humanizeDeliveryMode: "none",
      typingDelayMs: 0,
      maxBlockingDelayMs: 0,
    }));
  });

  it("mantem digitando humanizado e limitado para lead/cliente no webhook", () => {
    const policy = resolveWhatsAppDeliveryPolicy({
      actorContext: {
        role: "lead",
        sender_phone_authorized: false,
        reason: "crm_lead",
      },
      outputModality: "text",
      trigger: "evolution_webhook",
      replyText: "Recebi seu caso e vou organizar o ponto principal antes de encaminhar.",
    });

    expect(policy).toEqual(expect.objectContaining({
      profile: "external_humanized",
      humanizeDelivery: true,
      humanizeDeliveryMode: "bounded",
      maxBlockingDelayMs: 1400,
    }));
    expect(policy.typingDelayMs).toBeGreaterThan(0);
  });

  it("transforma audio transcrito em turno multimodal com resposta em audio", () => {
    const turn = buildWhatsAppAgentTurnV2({
      actorContext: {
        role: "office_operator",
        sender_phone_authorized: true,
        reason: "daily_playbook_authorized_phone",
      },
      trigger: "evolution_webhook",
      messages: [{
        direction: "inbound",
        message_type: "audio",
        content: "[Audio recebido]",
        media_text: "Quem e o reu do processo 0811126-78.2025.8.19.0213?",
        media_summary: "Audio transcrito: pergunta sobre reu do processo",
        media_processing_status: "processed",
      }],
    });

    expect(turn.agentVersion).toBe("whatsapp_v2");
    expect(turn.inputModalities).toEqual(["audio"]);
    expect(turn.outputModality).toBe("audio");
    expect(turn.outputModalityPolicy).toBe("mirror_audio");
    expect(turn.latestMediaContext).toEqual(expect.objectContaining({
      kind: "audio",
      status: "processed",
      intent: "audio_transcript",
      transcriptionSource: "whatsapp_media_pipeline",
      confidence: "high",
    }));
    expect(turn.deliveryPolicy.profile).toBe("office_operator_instant");
  });

  it("classifica imagem de processo ou contracheque sem inventar leitura", () => {
    const contexts = buildWhatsAppMediaContexts([
      {
        direction: "inbound",
        message_type: "image",
        content: "[Imagem recebida]",
        media_summary: "Print de processo com CNJ 0811126-78.2025.8.19.0213 e prazo.",
        media_processing_status: "processed",
        media_filename: "processo.png",
        media_mime_type: "image/png",
      },
      {
        direction: "inbound",
        message_type: "image",
        content: "[Imagem recebida]",
        media_summary: "Contracheque com desconto consignado e beneficio INSS.",
        media_processing_status: "processed",
        media_filename: "contracheque.jpg",
        media_mime_type: "image/jpeg",
      },
    ]);

    expect(contexts[0]).toEqual(expect.objectContaining({
      kind: "image",
      intent: "process_or_court_document",
      visionSource: "whatsapp_media_pipeline",
      confidence: "high",
    }));
    expect(contexts[1]).toEqual(expect.objectContaining({
      kind: "image",
      intent: "payroll_or_benefit",
      visionSource: "whatsapp_media_pipeline",
      confidence: "high",
    }));
  });

  it("marca midia sem leitura como ilegivel para pedir reenvio curto", () => {
    const contexts = buildWhatsAppMediaContexts([{
      direction: "inbound",
      message_type: "document",
      content: "[Documento: arquivo.pdf]",
      media_processing_status: "failed",
      media_filename: "arquivo.pdf",
      media_mime_type: "application/pdf",
    }]);

    expect(contexts[0]).toEqual(expect.objectContaining({
      kind: "document",
      intent: "unreadable_media",
      confidence: "low",
    }));
  });
});
