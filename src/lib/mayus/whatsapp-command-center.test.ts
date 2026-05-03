import { describe, expect, it } from "vitest";

import {
  buildWhatsAppCommandResponse,
  inferWhatsAppCommandIntent,
  isAuthorizedWhatsAppCommandSender,
  normalizeWhatsAppPhone,
} from "./whatsapp-command-center";

const aiFeatures = {
  firm_name: "Dutra Advocacia",
  daily_playbook: {
    enabled: true,
    deliveryTime: "08:00",
    channels: ["whatsapp", "mayus_panel"],
    authorizedPhones: ["21999990000"],
  },
};

describe("whatsapp command center", () => {
  it("normaliza telefones para autorizacao", () => {
    expect(normalizeWhatsAppPhone("(21) 99999-0000")).toBe("5521999990000");
    expect(normalizeWhatsAppPhone("(55) 99999-0000")).toBe("5555999990000");
    expect(normalizeWhatsAppPhone("5521999990000@s.whatsapp.net")).toBe("5521999990000");
  });

  it("identifica intents operacionais", () => {
    expect(inferWhatsAppCommandIntent("Mayus, relatorio do escritorio")).toBe("daily_playbook");
    expect(inferWhatsAppCommandIntent("Mayus, leads sem proximo passo")).toBe("crm_next_steps");
    expect(inferWhatsAppCommandIntent("Mayus, agenda de hoje")).toBe("agenda_today");
    expect(inferWhatsAppCommandIntent("Mayus, status do processo da Maria")).toBe("process_status");
  });

  it("bloqueia remetente nao autorizado", () => {
    expect(isAuthorizedWhatsAppCommandSender({ senderPhone: "21988880000", aiFeatures })).toBe(false);

    const result = buildWhatsAppCommandResponse({
      tenantId: "tenant-1",
      senderPhone: "21988880000",
      text: "Mayus, relatorio do escritorio",
      aiFeatures,
    });

    expect(result).toEqual({ handled: false, reason: "not_authorized", intent: "daily_playbook" });
  });

  it("gera resposta interna de playbook para usuario autorizado sem side effects", () => {
    const result = buildWhatsAppCommandResponse({
      tenantId: "tenant-1",
      senderPhone: "5521999990000",
      text: "Mayus, relatorio do escritorio",
      aiFeatures,
      now: new Date("2026-04-30T09:00:00.000Z"),
      crmTasks: [
        {
          id: "crm-1",
          title: "Maria Previdenciario",
          description: "Lead pediu ajuda com aposentadoria rural.",
          sector: "Previdenciario",
          phone: "21999990000",
          created_at: "2026-04-29T10:00:00.000Z",
        },
      ],
      userTasks: [
        {
          id: "task-1",
          title: "Prazo critico INSS",
          urgency: "URGENTE",
          status: "Pendente",
          scheduled_for: "2026-04-30T13:00:00.000Z",
          assigned_name_snapshot: "Equipe Juridica",
        },
      ],
    });

    expect(result.handled).toBe(true);
    if (!result.handled) throw new Error("expected handled command");
    expect(result.intent).toBe("daily_playbook");
    expect(result.replyText).toContain("Dutra Advocacia: resumo do dia");
    expect(result.replyText).toContain("MAYUS operacional");
    expect(result.playbook.metrics.crmLeadsNeedingNextStep).toBe(1);
    expect(JSON.stringify(result.metadata)).not.toContain("21999990000");
  });

  it("responde comando de processo sem inventar cliente especifico quando falta identificador", () => {
    const result = buildWhatsAppCommandResponse({
      tenantId: "tenant-1",
      senderPhone: "5521999990000",
      text: "Mayus, status do processo do cliente",
      aiFeatures,
      now: new Date("2026-04-30T09:00:00.000Z"),
      userTasks: [
        {
          id: "task-1",
          title: "Prazo de recurso INSS",
          urgency: "URGENTE",
          status: "Pendente",
          scheduled_for: "2026-04-30T13:00:00.000Z",
          assigned_name_snapshot: "Equipe Juridica",
        },
      ],
    });

    expect(result.handled).toBe(true);
    if (!result.handled) throw new Error("expected handled command");
    expect(result.intent).toBe("process_status");
    expect(result.replyText).toContain("*MAYUS: status juridico*");
    expect(result.replyText).toContain("nome do cliente, telefone ou CNJ");
  });
});
