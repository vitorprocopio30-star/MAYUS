import { describe, expect, it, vi } from "vitest";
import { detectProcessPhase, fetchWhatsAppProcessStatusContext, isProcessStatusRequest, translateProcessStatusForClient } from "./process-status-context";

function makeQuery(result: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    ilike: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any) => resolve(result),
  };
  return query;
}

function filtersIncludeMarcio(value?: string | null) {
  return /M[áa]rcio|Marcio/i.test(String(value || ""));
}

describe("process-status-context", () => {
  it("detecta fase de replica por contestacao juntada", () => {
    const phase = detectProcessPhase({
      stageName: "Prazos",
      lastMovementText: "Contestação juntada. Prazo de manifestação aberto.",
    });

    expect(phase.phase).toBe("replica");
    expect(phase.label).toBe("réplica");
    expect(phase.confidence).toBeGreaterThan(0.8);
  });

  it("traduz status processual em linguagem simples", () => {
    const reply = translateProcessStatusForClient({
      verified: true,
      confidence: "high",
      accessScope: "linked_contact",
      senderPhoneAuthorized: false,
      processTaskId: "process-1",
      clientName: "Maria Silva",
      processNumber: "1234567-89.2024.8.26.0100",
      title: "Maria x Banco",
      currentStage: "Réplica",
      detectedPhase: "replica",
      detectedPhaseLabel: "réplica",
      lastMovementAt: "2026-05-02T00:00:00.000Z",
      lastMovementText: "contestação juntada",
      deadlineAt: null,
      pendingItems: [],
      nextStep: "a equipe revisar a defesa da outra parte e preparar a manifestação",
      riskFlags: [],
      clientReply: null,
      grounding: { factualSources: ["último andamento registrado"], inferenceNotes: [], missingSignals: [] },
    });

    expect(reply).toContain("Oi, Maria");
    expect(reply).toContain("fase de réplica");
    expect(reply).toContain("Última movimentação");
    expect(reply).toContain("No momento, não vi pendência sua");
    expect(reply).not.toMatch(/feito encontra-se|concluso para despacho/i);
  });

  it("busca processo verificado por CNJ e monta contexto auditavel", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({
        data: [{
          id: "process-1",
          title: "Maria x Banco",
          description: "Processo com contestação recebida.",
          phone: "5511999999999",
          client_name: "Maria Silva",
          process_number: "1234567-89.2024.8.26.0100",
          processo_1grau: null,
          processo_2grau: null,
          andamento_1grau: "Contestação juntada",
          andamento_2grau: null,
          orgao_julgador: null,
          tutela_urgencia: null,
          sentenca: null,
          prazo_fatal: null,
          liminar_deferida: false,
          data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
          tags: [],
          urgency: "ROTINA",
          process_stages: { name: "Réplica" },
        }],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeQuery({
        data: { latest_data: "2026-05-02", latest_conteudo: "Contestação juntada. Prazo de manifestação aberto.", latest_created_at: null, quantidade_eventos: 1 },
        error: null,
      });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5511999999999@s.whatsapp.net", name: "Maria" },
      messages: [{ direction: "inbound", content: "Como está meu processo 1234567-89.2024.8.26.0100?" }],
    });

    expect(context?.verified).toBe(true);
    expect(context?.confidence).toBe("high");
    expect(context?.detectedPhase).toBe("replica");
    expect(context?.grounding.factualSources).toEqual(expect.arrayContaining(["último andamento registrado", "inbox de movimentações processuais"]));
    expect(context?.clientReply).toBeNull();
    expect(context?.candidateProcesses?.[0]).toEqual(expect.objectContaining({
      processNumber: "1234567-89.2024.8.26.0100",
      lastMovementText: "Contestação juntada",
    }));
  });

  it("numero autorizado consulta processo do tenant por nome sem depender do telefone do card", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({
        data: [{
          id: "process-owner-1",
          title: "Camila Autorizada x Banco",
          description: "Contestação recebida.",
          phone: "5511888877777",
          client_name: "Camila Autorizada",
          process_number: "2222222-22.2024.8.26.0100",
          processo_1grau: null,
          processo_2grau: null,
          andamento_1grau: "Contestação juntada",
          andamento_2grau: null,
          orgao_julgador: null,
          tutela_urgencia: null,
          sentenca: null,
          prazo_fatal: null,
          liminar_deferida: false,
          data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
          tags: [],
          urgency: "ROTINA",
          process_stages: { name: "Réplica" },
        }],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como está o processo da Camila Autorizada?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.accessScope).toBe("tenant_authorized");
    expect(context?.senderPhoneAuthorized).toBe(true);
    expect(context?.processTaskId).toBe("process-owner-1");
  });

  it("numero autorizado entende plural e erro comum em pedido de status por nome", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({
        data: [{
          id: "process-marcio-1",
          title: "Marcio da Silva Machado x INSS",
          description: "Contestação recebida.",
          phone: "5511888877777",
          client_name: "Marcio da Silva Machado",
          process_number: "3333333-33.2024.8.26.0100",
          processo_1grau: null,
          processo_2grau: null,
          andamento_1grau: "Contestação juntada",
          andamento_2grau: null,
          orgao_julgador: null,
          tutela_urgencia: null,
          sentenca: null,
          prazo_fatal: null,
          liminar_deferida: false,
          data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
          tags: [],
          urgency: "ROTINA",
          process_stages: { name: "Réplica" },
        }],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const messages = [{ direction: "inbound" as const, content: "COMO ESTÁ O PROCESSOS DO MARCIO DA SILVA MACHADO" }];

    expect(isProcessStatusRequest(messages)).toBe(true);
    expect(isProcessStatusRequest([{ direction: "inbound", content: "Como estão os processos do Marcio da Silva Machado?" }])).toBe(true);
    expect(isProcessStatusRequest([{ direction: "inbound", content: "Boa tarde, gostaria de saber sobre o processo" }])).toBe(true);
    expect(isProcessStatusRequest([{ direction: "inbound", content: "Gostaria de saber sobre um processo" }])).toBe(true);
    expect(isProcessStatusRequest([{ direction: "inbound", content: "Gostaria de saber de um processo" }])).toBe(true);
    expect(isProcessStatusRequest([{ direction: "inbound", content: "Pode me passar a situacao do processo?" }])).toBe(true);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.accessScope).toBe("tenant_authorized");
    expect(context?.senderPhoneAuthorized).toBe(true);
    expect(context?.processTaskId).toBe("process-marcio-1");
    expect(context?.clientName).toBe("Marcio da Silva Machado");
  });

  it("usa nome completo enviado depois do pedido para localizar processo", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({
        data: [{
          id: "process-marcio-followup",
          title: "Marcio da Silva Machado x INSS",
          description: "Contestação recebida.",
          phone: "5511888877777",
          client_name: "Marcio da Silva Machado",
          process_number: "3333333-33.2024.8.26.0100",
          processo_1grau: null,
          processo_2grau: null,
          andamento_1grau: "Contestação juntada",
          andamento_2grau: null,
          orgao_julgador: null,
          tutela_urgencia: null,
          sentenca: null,
          prazo_fatal: null,
          liminar_deferida: false,
          data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
          tags: [],
          urgency: "ROTINA",
          process_stages: { name: "Réplica" },
        }],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });
    const messages = [
      { direction: "inbound" as const, content: "Boa noite" },
      { direction: "outbound" as const, content: "Me confirme o nome completo ou CNJ para localizar com segurança." },
      { direction: "inbound" as const, content: "O nome completo é Márcio da Silva Machado" },
    ];

    expect(isProcessStatusRequest([{ direction: "inbound", content: "Boa noite" }])).toBe(false);
    expect(isProcessStatusRequest(messages)).toBe(true);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("process-marcio-followup");
    expect(context?.clientName).toBe("Marcio da Silva Machado");
  });

  it("prioriza nome explicito enviado no ultimo turno em vez do contato ou telefone", async () => {
    const processOrFilters: string[] = [];
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: { name: "Vitor Procópio", phone: "5511999999999", document: null }, error: null });
      if (table === "process_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          or: vi.fn((filters: string) => {
            processOrFilters.push(filters);
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({
            data: filtersIncludeMarcio(processOrFilters[processOrFilters.length - 1])
              ? [{
                id: "process-marcio-explicit",
                title: "Márcio da Silva Machado x INSS",
                description: "Contestação recebida.",
                phone: "5511888877777",
                client_name: "Márcio da Silva Machado",
                process_number: "3333333-33.2024.8.26.0100",
                processo_1grau: null,
                processo_2grau: null,
                andamento_1grau: "Contestação juntada",
                andamento_2grau: null,
                orgao_julgador: null,
                tutela_urgencia: null,
                sentenca: null,
                prazo_fatal: null,
                liminar_deferida: false,
                data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
                tags: [],
                urgency: "ROTINA",
                process_stages: { name: "Réplica" },
              }]
              : [],
            error: null,
          })),
        };
        return query;
      }
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5511999999999@s.whatsapp.net", name: "Vitor Procópio" },
      messages: [
        { direction: "inbound", content: "Gostaria de saber de um processo" },
        { direction: "outbound", content: "Me mande o nome completo do cliente ou número do processo." },
        { direction: "inbound", content: "Márcio da Silva Machado" },
      ],
      senderPhoneAuthorized: true,
    });

    expect(processOrFilters.join(" ")).toMatch(/M[áa]rcio|Marcio/);
    expect(processOrFilters.join(" ")).not.toContain("5511999999999");
    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("process-marcio-explicit");
  });

  it("mantem nome recente quando operador pede status generico depois de citar o cliente", async () => {
    const processOrFilters: string[] = [];
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          or: vi.fn((filter: string) => {
            processOrFilters.push(filter);
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({
            data: filtersIncludeMarcio(processOrFilters[processOrFilters.length - 1])
              ? [{
                id: "process-marcio-retained",
                title: "Marcio da Silva Machado x Banco Bradesco",
                description: "Processo contra Banco Bradesco.",
                phone: null,
                client_name: "Marcio da Silva Machado",
                process_number: "3000141-95.2026.8.19.0213",
                processo_1grau: null,
                processo_2grau: null,
                andamento_1grau: "Aguardando andamento do juizo",
                andamento_2grau: null,
                orgao_julgador: null,
                tutela_urgencia: null,
                sentenca: null,
                prazo_fatal: null,
                liminar_deferida: false,
                data_ultima_movimentacao: "2026-06-21T00:00:00.000Z",
                tags: [],
                urgency: "ROTINA",
                reu: "Banco Bradesco",
                process_stages: { name: "Conhecimento" },
              }]
              : [],
            error: null,
          })),
        };
        return query;
      }
      if (table === "monitored_processes") return makeQuery({ data: [], error: null });
      if (table === "processos_cache") return makeQuery({ data: [], error: null });
      if (table === "brain_artifacts") return makeQuery({ data: [], error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Vitor" },
      messages: [
        { direction: "inbound", content: "Marcio da Silva Machado" },
        { direction: "outbound", content: "Encontrei processos para Marcio." },
        { direction: "inbound", content: "Quero saber sobre o processo" },
      ],
      senderPhoneAuthorized: true,
    });

    expect(processOrFilters.join(" ")).toMatch(/M[áa]rcio|Marcio/);
    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("process-marcio-retained");
    expect(context?.clientName).toBe("Marcio da Silva Machado");
    expect(context?.grounding.missingSignals).not.toContain("authorized_process_access_needs_reference");
  });

  it("nao libera status por nome sozinho para cliente externo sem vinculo forte", async () => {
    const processOrFilters: string[] = [];
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          or: vi.fn((filters: string) => {
            processOrFilters.push(filters);
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: [], error: null })),
        };
        return query;
      }
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5511999999999@s.whatsapp.net", name: "Contato externo" },
      messages: [
        { direction: "inbound", content: "Gostaria de saber de um processo" },
        { direction: "outbound", content: "Me mande o número do processo/CNJ ou CPF." },
        { direction: "inbound", content: "Márcio da Silva Machado" },
      ],
    });

    expect(processOrFilters).toEqual([]);
    expect(context?.verified).toBe(false);
    expect(context?.grounding.missingSignals).toContain("process_access_needs_strong_identifier");
  });

  it("ranqueia nome completo em client_name titulo e descricao antes de declarar ambiguidade", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({
        data: [
          {
            id: "process-marcio-parcial",
            title: "Marcio Oliveira x Banco",
            description: "Outro cliente chamado Marcio.",
            phone: "5511777766666",
            client_name: "Marcio Oliveira",
            process_number: "4444444-44.2024.8.26.0100",
            processo_1grau: null,
            processo_2grau: null,
            andamento_1grau: "Aguardando citação",
            andamento_2grau: null,
            orgao_julgador: null,
            tutela_urgencia: null,
            sentenca: null,
            prazo_fatal: null,
            liminar_deferida: false,
            data_ultima_movimentacao: "2026-05-01T00:00:00.000Z",
            tags: [],
            urgency: "ROTINA",
            process_stages: { name: "Citação" },
          },
          {
            id: "process-marcio-melhor",
            title: "Benefício de Márcio da Silva Machado",
            description: "Processo do cliente Marcio da Silva Machado contra INSS.",
            phone: "5511888877777",
            client_name: "Márcio da Silva Machado",
            process_number: "3333333-33.2024.8.26.0100",
            processo_1grau: null,
            processo_2grau: null,
            andamento_1grau: "Contestação juntada",
            andamento_2grau: null,
            orgao_julgador: null,
            tutela_urgencia: null,
            sentenca: null,
            prazo_fatal: null,
            liminar_deferida: false,
            data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
            tags: [],
            urgency: "ROTINA",
            process_stages: { name: "Réplica" },
          },
        ],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como está o processo do Márcio da Silva Machado?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("process-marcio-melhor");
    expect(context?.clientName).toBe("Márcio da Silva Machado");
  });

  it("busca processos monitorados do Escavador por nome e responde o dossie quando ha mais de um", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      if (table === "monitored_processes") return makeQuery({
        data: [
          {
            id: "monitored-1",
            numero_processo: "3333333-33.2024.8.26.0100",
            tribunal: "TJSP",
            assunto: "Benefício previdenciário",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Réplica",
            status_predito: null,
            cliente_nome: "Márcio da Silva Machado",
            resumo_curto: "Processo contra INSS.",
            ultima_movimentacao_texto: "Contestação juntada",
            data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
            partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "INSS" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "monitored-2",
            numero_processo: "4444444-44.2024.8.26.0100",
            tribunal: "TJSP",
            assunto: "Cartão benefício",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Márcio da Silva Machado",
            resumo_curto: "Processo contra banco.",
            ultima_movimentacao_texto: "Processo distribuído",
            data_ultima_movimentacao: "2026-04-20T00:00:00.000Z",
            partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "Banco" },
            envolvidos: [],
            raw_escavador: null,
          },
        ],
        error: null,
      });
      if (table === "processos_cache") return makeQuery({ data: [], error: null });
      if (table === "brain_artifacts") return makeQuery({ data: [], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como estão os processos do Márcio da Silva Machado?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.clientReply).toBeNull();
    expect(context?.candidateProcesses).toHaveLength(2);
    expect(context?.candidateProcesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ opposingParty: "INSS", summary: expect.stringContaining("Processo contra INSS") }),
      expect.objectContaining({ opposingParty: "Banco", summary: expect.stringContaining("Processo contra banco") }),
    ]));
    expect(context?.candidateProcesses?.map((item) => item.processNumber)).toEqual(expect.arrayContaining([
      "3333333-33.2024.8.26.0100",
      "4444444-44.2024.8.26.0100",
    ]));
  });

  it("responde tres processos principais e separa agravos terminados em 0000", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      if (table === "monitored_processes") return makeQuery({
        data: [
          {
            id: "agravo-1",
            numero_processo: "3003925-40.2026.8.19.0000",
            tribunal: "TJRJ",
            assunto: "Agravo de Instrumento",
            classe_processual: "Agravo de Instrumento",
            status: "ATIVO",
            fase_atual: "Agravo",
            status_predito: null,
            cliente_nome: "Márcio da Silva Machado",
            resumo_curto: "Agravo relacionado ao caso principal.",
            ultima_movimentacao_texto: "Agravo distribuído",
            data_ultima_movimentacao: "2026-05-01T00:00:00.000Z",
            partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "Banco Master S.A" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "master",
            numero_processo: "3000144-50.2026.8.19.0213",
            tribunal: "TJRJ",
            assunto: "Indenização por danos materiais",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Márcio da Silva Machado",
            resumo_curto: "O caso envolve uma ação de indenização por danos materiais contra o Banco Master S.A.",
            ultima_movimentacao_texto: "Sem decisão nova registrada",
            data_ultima_movimentacao: "2026-04-30T00:00:00.000Z",
            partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "Banco Master S.A" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "bradesco",
            numero_processo: "3000141-95.2026.8.19.0213",
            tribunal: "TJRJ",
            assunto: "Indenização por danos materiais",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Márcio da Silva Machado",
            resumo_curto: "O processo consiste em uma ação de indenização contra o Banco Bradesco S.A.",
            ultima_movimentacao_texto: "Aguardando andamento do juízo",
            data_ultima_movimentacao: "2026-06-21T00:00:00.000Z",
            partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "Banco Bradesco S.A" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "caixa",
            numero_processo: "5006349-29.2023.4.02.5110",
            tribunal: "TRF2",
            assunto: "Contratos bancários",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Márcio da Silva Machado",
            resumo_curto: "Processo contra a Caixa Econômica Federal.",
            ultima_movimentacao_texto: null,
            data_ultima_movimentacao: "2023-06-10T00:00:00.000Z",
            partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "Caixa Economica Federal Cef" },
            envolvidos: [],
            raw_escavador: null,
          },
        ],
        error: null,
      });
      if (table === "processos_cache") return makeQuery({ data: [], error: null });
      if (table === "brain_artifacts") return makeQuery({ data: [{ title: "Resumo Márcio", artifact_type: "process_brief", metadata: { note: "cliente tem tres processos bancarios" }, created_at: "2026-05-08" }], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como estão os processos do Márcio da Silva Machado?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.clientReply).toBeNull();
    expect(context?.candidateProcesses).toHaveLength(3);
    expect(context?.candidateProcesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ opposingParty: "Banco Master S.A", summary: expect.stringContaining("Banco Master") }),
      expect.objectContaining({ opposingParty: "Banco Bradesco S.A", summary: expect.stringContaining("Banco Bradesco") }),
      expect.objectContaining({ opposingParty: "Caixa Economica Federal Cef", summary: expect.stringContaining("Caixa") }),
    ]));
    expect(context?.candidateProcesses?.map((item) => item.processNumber)).not.toContain("3003925-40.2026.8.19.0000");
    expect(context?.grounding.inferenceNotes).toContain("agravos/incidentes foram separados dos processos principais");
    expect(context?.grounding.factualSources).toContain("cérebro MAYUS");
  });

  it("regressao diaria: Oi Mayus, Marcio, candidatos bancarios, escolha Bradesco e pedido de situacao", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      if (table === "monitored_processes") return makeQuery({
        data: [
          {
            id: "master",
            numero_processo: "3000144-50.2026.8.19.0213",
            tribunal: "TJRJ",
            assunto: "Indenizacao por danos materiais",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Marcio da Silva Machado",
            resumo_curto: "Acao de indenizacao contra o Banco Master S.A.",
            ultima_movimentacao_texto: "Sem decisao nova registrada",
            data_ultima_movimentacao: "2026-04-30T00:00:00.000Z",
            partes: { polo_ativo: "Marcio da Silva Machado", polo_passivo: "Banco Master S.A" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "bradesco",
            numero_processo: "3000141-95.2026.8.19.0213",
            tribunal: "TJRJ",
            assunto: "Indenizacao por danos materiais",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Marcio da Silva Machado",
            resumo_curto: "Processo contra o Banco Bradesco S.A.",
            ultima_movimentacao_texto: "Aguardando andamento do juizo",
            data_ultima_movimentacao: "2026-06-21T00:00:00.000Z",
            partes: { polo_ativo: "Marcio da Silva Machado", polo_passivo: "Banco Bradesco S.A" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "caixa",
            numero_processo: "5006349-29.2023.4.02.5110",
            tribunal: "TRF2",
            assunto: "Contratos bancarios",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Marcio da Silva Machado",
            resumo_curto: "Processo contra a Caixa Economica Federal.",
            ultima_movimentacao_texto: null,
            data_ultima_movimentacao: "2023-06-10T00:00:00.000Z",
            partes: { polo_ativo: "Marcio da Silva Machado", polo_passivo: "Caixa Economica Federal Cef" },
            envolvidos: [],
            raw_escavador: null,
          },
        ],
        error: null,
      });
      if (table === "processos_cache") return makeQuery({ data: [], error: null });
      if (table === "brain_artifacts") return makeQuery({ data: [], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const messages = [
      { direction: "inbound" as const, content: "Oi Mayus" },
      { direction: "outbound" as const, content: "Boa tarde, Vitor. Me confirma o nome completo ou CNJ para localizar com seguranca." },
      { direction: "inbound" as const, content: "Marcio da Silva Machado" },
      { direction: "outbound" as const, content: "Localizei Banco Master, Banco Bradesco e Caixa para Marcio. Qual deles voce quer?" },
      { direction: "inbound" as const, content: "E o do Bradesco" },
      { direction: "outbound" as const, content: "Perfeito, e o processo do Banco Bradesco." },
      { direction: "inbound" as const, content: "Pode me passar a situacao do processo" },
    ];

    expect(isProcessStatusRequest([{ direction: "inbound", content: "Oi Mayus" }])).toBe(false);
    expect(isProcessStatusRequest(messages.slice(0, 5))).toBe(true);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.clientName).toBe("Marcio da Silva Machado");
    expect(context?.processNumber).toBe("3000141-95.2026.8.19.0213");
    expect(context?.candidateProcesses).toHaveLength(1);
    expect(context?.candidateProcesses?.[0]).toEqual(expect.objectContaining({
      opposingParty: "Banco Bradesco S.A",
      summary: expect.stringContaining("Banco Bradesco"),
    }));
  });

  it("prioriza banco citado dentro de frase longa ao filtrar candidatos processuais", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      if (table === "monitored_processes") return makeQuery({
        data: [
          {
            id: "bradesco",
            numero_processo: "3000141-95.2026.8.19.0213",
            tribunal: "TJRJ",
            assunto: "Indenizacao por danos materiais",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Marcio da Silva Machado",
            resumo_curto: "Processo contra o Banco Bradesco S.A.",
            ultima_movimentacao_texto: "Aguardando regularizacao de custas",
            data_ultima_movimentacao: "2026-03-13T00:00:00.000Z",
            partes: { polo_ativo: "Marcio da Silva Machado", polo_passivo: "Banco Bradesco S.A" },
            envolvidos: [],
            raw_escavador: null,
          },
          {
            id: "caixa",
            numero_processo: "5006349-29.2023.4.02.5110",
            tribunal: "TRF2",
            assunto: "Contratos bancarios",
            classe_processual: "Procedimento comum",
            status: "ATIVO",
            fase_atual: "Conhecimento",
            status_predito: null,
            cliente_nome: "Marcio da Silva Machado",
            resumo_curto: "Processo contra a Caixa Economica Federal.",
            ultima_movimentacao_texto: null,
            data_ultima_movimentacao: "2023-06-10T00:00:00.000Z",
            partes: { polo_ativo: "Marcio da Silva Machado", polo_passivo: "Caixa Economica Federal Cef" },
            envolvidos: [],
            raw_escavador: null,
          },
        ],
        error: null,
      });
      if (table === "processos_cache") return makeQuery({ data: [], error: null });
      if (table === "brain_artifacts") return makeQuery({ data: [], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const messages = [
      { direction: "inbound" as const, content: "Gostaria de saber sobre um processo" },
      { direction: "outbound" as const, content: "Claro. Para eu localizar com seguranca, me mande o nome completo do cliente ou o numero do processo." },
      { direction: "inbound" as const, content: "Marcio da Silva Machado" },
      { direction: "outbound" as const, content: "Encontrei 2 processos do Marcio da Silva Machado." },
      { direction: "outbound" as const, content: "Banco Bradesco S.A (TJRJ, n 3000141-95.2026.8.19.0213): fase inicial de regularizacao do pagamento de custas." },
      { direction: "outbound" as const, content: "Caixa Economica Federal CEF (TRF2, n 5006349-29.2023.4.02.5110): aplicacao INPC/IPCA/atualizacao FGTS." },
      { direction: "inbound" as const, content: "Me fale como esta o do banco bradesco" },
    ];

    expect(isProcessStatusRequest(messages)).toBe(true);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.processNumber).toBe("3000141-95.2026.8.19.0213");
    expect(context?.candidateProcesses).toHaveLength(1);
    expect(context?.candidateProcesses?.[0]).toEqual(expect.objectContaining({
      opposingParty: "Banco Bradesco S.A",
      processNumber: "3000141-95.2026.8.19.0213",
    }));
  });

  it("localiza processo monitorado por nome em partes mesmo com cliente_nome vazio", async () => {
    const monitoredRows = [
      {
        id: "master-json-only",
        numero_processo: "3000144-50.2026.8.19.0213",
        tribunal: "TJRJ",
        assunto: "Indenização por danos materiais",
        classe_processual: "Procedimento comum",
        status: "ATIVO",
        fase_atual: "Conhecimento",
        status_predito: null,
        cliente_nome: null,
        resumo_curto: "Ação contra Banco Master S.A.",
        ultima_movimentacao_texto: "Sem decisão nova registrada",
        data_ultima_movimentacao: "2026-04-30T00:00:00.000Z",
        partes: { polo_ativo: "Márcio da Silva Machado", polo_passivo: "Banco Master S.A" },
        envolvidos: [],
        raw_escavador: null,
      },
    ];
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      if (table === "monitored_processes") {
        let usedOr = false;
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          or: vi.fn(() => {
            usedOr = true;
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: usedOr ? [] : monitoredRows, error: null })),
          then: (resolve: any) => resolve({ data: usedOr ? [] : monitoredRows, error: null }),
        };
        return query;
      }
      if (table === "processos_cache") return makeQuery({ data: [], error: null });
      if (table === "brain_artifacts") return makeQuery({ data: [], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como está o processo do Márcio da Silva Machado?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("master-json-only");
    expect(context?.processNumber).toBe("3000144-50.2026.8.19.0213");
    expect(context?.clientName).toBe("Márcio da Silva Machado");
    expect(context?.title).toContain("Banco Master");
  });

  it("busca no cache local do Escavador por envolvidos/raw sem chamar busca paga", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      if (table === "monitored_processes") return makeQuery({ data: [], error: null });
      if (table === "processos_cache") return makeQuery({
        data: [{
          processos: [{
            id: "cache-1",
            numero_processo: "5555555-55.2024.8.26.0100",
            tribunal: "TRF3",
            assunto: "Aposentadoria",
            fase_atual: "Conhecimento",
            cliente_nome: null,
            envolvidos: [{ nome: "Márcio da Silva Machado" }],
            raw_escavador: { fontes: [{ envolvidos: [{ nome: "Márcio da Silva Machado" }] }] },
            ultima_movimentacao_texto: "Decisão publicada",
            data_ultima_movimentacao: "2026-05-03T00:00:00.000Z",
          }],
        }],
        error: null,
      });
      if (table === "brain_artifacts") return makeQuery({ data: [], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como está o processo do Márcio da Silva Machado?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("cache-1");
    expect(context?.processNumber).toBe("5555555-55.2024.8.26.0100");
    expect(context?.grounding.factualSources).toContain("cache local do Escavador");
  });

  it("operador autorizado localiza processo quando cita nome em processo da cliente", async () => {
    const processRow = {
      id: "process-michele",
      title: "Michele Cristina Pinto Foppolos Santos x Banco",
      description: "Processo monitorado da Michele Cristina Pinto Foppolos Santos.",
      phone: null,
      client_name: "Michele Cristina Pinto Foppolos Santos",
      process_number: "3002575-03.2026.8.19.0000",
      processo_1grau: null,
      processo_2grau: null,
      andamento_1grau: "Publicado despacho em 25/05/2026",
      andamento_2grau: null,
      orgao_julgador: "TJRJ",
      tutela_urgencia: null,
      sentenca: null,
      prazo_fatal: null,
      liminar_deferida: false,
      data_ultima_movimentacao: "2026-05-25T00:00:00.000Z",
      tags: [],
      urgency: "ROTINA",
      reu: "Banco",
      process_stages: { name: "Acompanhamento" },
    };
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [processRow], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: [], error: null });
    });

    const messages = [{ direction: "inbound" as const, content: "Quero saber do processo Michele Cristina Pinto Foppolos Santos" }];

    expect(isProcessStatusRequest(messages)).toBe(true);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Vitor" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.clientName).toBe("Michele Cristina Pinto Foppolos Santos");
    expect(context?.processNumber).toBe("3002575-03.2026.8.19.0000");
    expect(context?.grounding.missingSignals).not.toContain("authorized_process_access_needs_reference");
  });

  it("operador autorizado reutiliza ultimo nome quando responde pelo nome vc consegue", async () => {
    const processRow = {
      id: "process-michele",
      title: "Michele Cristina Pinto Foppolos Santos x Banco",
      description: "Processo monitorado da Michele Cristina Pinto Foppolos Santos.",
      phone: null,
      client_name: "Michele Cristina Pinto Foppolos Santos",
      process_number: "3002575-03.2026.8.19.0000",
      processo_1grau: null,
      processo_2grau: null,
      andamento_1grau: "Publicado despacho em 25/05/2026",
      andamento_2grau: null,
      orgao_julgador: "TJRJ",
      tutela_urgencia: null,
      sentenca: null,
      prazo_fatal: null,
      liminar_deferida: false,
      data_ultima_movimentacao: "2026-05-25T00:00:00.000Z",
      tags: [],
      urgency: "ROTINA",
      reu: "Banco",
      process_stages: { name: "Acompanhamento" },
    };
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [processRow], error: null });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: [], error: null });
    });

    const messages = [
      { direction: "inbound" as const, content: "E outro processo" },
      { direction: "outbound" as const, content: "Me diga qual processo quer localizar." },
      { direction: "inbound" as const, content: "Quero saber do processo Michele Cristina Pinto Foppolos Santos" },
      { direction: "outbound" as const, content: "Me mande o numero para eu localizar." },
      { direction: "inbound" as const, content: "Pelo nome vc consegue" },
    ];

    expect(isProcessStatusRequest(messages)).toBe(true);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Vitor" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(true);
    expect(context?.clientName).toBe("Michele Cristina Pinto Foppolos Santos");
    expect(context?.grounding.missingSignals).not.toContain("authorized_process_access_needs_reference");
  });

  it("numero autorizado sem referencia pede identificador em vez de escolher processo", async () => {
    const from = vi.fn(() => makeQuery({ data: null, error: null }));

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Dono" },
      messages: [{ direction: "inbound", content: "Como está meu processo?" }],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(false);
    expect(context?.accessScope).toBe("tenant_authorized");
    expect(context?.grounding.missingSignals).toContain("authorized_process_access_needs_reference");
  });

  it("pedido generico novo nao reutiliza CNJ antigo do historico", async () => {
    const from = vi.fn(() => makeQuery({ data: [{ id: "old-process" }], error: null }));

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Vitor" },
      messages: [
        { direction: "inbound", content: "Como está 3000144-50.2026.8.19.0213?" },
        { direction: "outbound", content: "Encontrei o processo contra Banco Master." },
        { direction: "inbound", content: "Gostaria de saber de um processo" },
      ],
      senderPhoneAuthorized: true,
    });

    expect(context?.verified).toBe(false);
    expect(context?.processNumber).toBeNull();
    expect(context?.grounding.missingSignals).toContain("authorized_process_access_needs_reference");
    expect(from).not.toHaveBeenCalled();
  });

  it("cobranca curta do operador nao vira nome nem busca candidatos antigos", async () => {
    const from = vi.fn(() => makeQuery({ data: [{ id: "old-process" }], error: null }));
    const messages = [
      { direction: "outbound" as const, content: "Encontrei processos para Margarete." },
      { direction: "inbound" as const, content: "Quero saber sobre o processo e se teve venda hoje" },
      { direction: "inbound" as const, content: "Pode me responder" },
    ];

    expect(isProcessStatusRequest(messages)).toBe(false);

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5521999990000@s.whatsapp.net", name: "Vitor" },
      messages,
      senderPhoneAuthorized: true,
    });

    expect(context).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("retorna contexto nao verificado quando nao localiza processo", async () => {
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({ data: [], error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5511999999999@s.whatsapp.net", name: "Maria" },
      messages: [{ direction: "inbound", content: "Teve alguma novidade no meu processo?" }],
    });

    expect(context?.verified).toBe(false);
    expect(context?.riskFlags).toContain("case_status_unverified");
    expect(context?.grounding.missingSignals).toContain("processo nao localizado");
  });

  it("localiza processo por telefone normalizado e bloqueia prazo critico", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const from = vi.fn((table: string) => {
      if (table === "clients") return makeQuery({ data: null, error: null });
      if (table === "process_tasks") return makeQuery({
        data: [{
          id: "process-2",
          title: "Maria x Empresa",
          description: "Prazo de manifestação aberto.",
          phone: "11999999999",
          client_name: "Maria Silva",
          process_number: "7654321-10.2024.8.26.0100",
          processo_1grau: null,
          processo_2grau: null,
          andamento_1grau: "Prazo de manifestação aberto",
          andamento_2grau: null,
          orgao_julgador: null,
          tutela_urgencia: null,
          sentenca: null,
          prazo_fatal: tomorrow,
          liminar_deferida: false,
          data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
          tags: [],
          urgency: "URGENTE",
          process_stages: { name: "Réplica" },
        }],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeQuery({ data: null, error: null });
      return makeQuery({ data: null, error: null });
    });

    const context = await fetchWhatsAppProcessStatusContext({
      supabase: { from } as any,
      tenantId: "tenant-1",
      contact: { phone_number: "5511999999999@s.whatsapp.net", name: "Maria" },
      messages: [{ direction: "inbound", content: "Teve alguma novidade no meu processo?" }],
    });

    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("process-2");
    expect(context?.riskFlags).toContain("legal_urgency");
    expect(context?.grounding.factualSources).toContain("prazo fatal registrado");
  });
});
