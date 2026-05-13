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
    });

    expect(processOrFilters.join(" ")).toMatch(/M[áa]rcio|Marcio/);
    expect(processOrFilters.join(" ")).not.toContain("5511999999999");
    expect(context?.verified).toBe(true);
    expect(context?.processTaskId).toBe("process-marcio-explicit");
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
