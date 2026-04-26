// src/lib/agent/kernel/router.ts
//
// Módulo de Roteamento de Intenção (Intent Router)
// Responsabilidade única: Traduzir texto do usuário em { intent, entities, confidence }
//
// REGRAS ABSOLUTAS:
// - Nunca faz chamadas externas (sem fetch, sem banco)
// - É determinístico e puramente local
// - Sanitiza PII antes de expor qualquer string para logs externos
// - Retorna confidence = 0 e intent = 'unknown' se nenhum padrão corresponder

// ─── Tipos Exportados ─────────────────────────────────────────────────────────

export interface RouterIntent {
  intent: string;
  entities: Record<string, string>;
  confidence: number; // 0.0 a 0.99 — nunca 1.0 por design (incerteza sempre presente)
  safeText: string;   // Texto sanitizado (sem PII) — seguro para logs
  ambiguous: boolean; // true se segundo melhor match está a menos de 0.10 de distância
}

export interface RouterContext {
  userId: string;
  tenantId: string;
  channel: 'chat' | 'whatsapp' | 'background_job';
  availableSkills: string[]; // Somente skills autorizadas para este usuário
}

// ─── Mapa de Intenções ────────────────────────────────────────────────────────

interface IntentDefinition {
  intent: string;
  patterns: RegExp[];
  entityExtractors?: Array<{ key: string; pattern: RegExp }>;
  baseConfidence: number;
}

const INTENT_PATTERNS: IntentDefinition[] = [
  {
    intent: 'generate_contract_zapsign',
    patterns: [
      /assinar\s+contrato/i,
      /gerar\s+contrato/i,
      /contrato\s+de\s+(honorários|prestação|serviço|representação)/i,
      /enviar\s+contrato/i,
      /contrato\s+para\s+assinar/i,
      /zapsign/i,
    ],
    entityExtractors: [
      {
        key: 'signer_name',
        pattern: /(?:nome|cliente|para)\s*[:\-]?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)+)/i,
      },
    ],
    baseConfidence: 0.75,
  },
  {
    intent: 'asaas_cobrar',
    patterns: [
      /cobrar\s+cliente/i,
      /gerar\s+cobrança/i,
      /emitir\s+(cobrança|boleto)/i,
      /enviar\s+(cobrança|link\s+de\s+pagamento)/i,
      /gerar\s+boleto/i,
      /gerar\s+pix/i,
      /cobrança\s+de\s+R\$/i,
      /fatura\s+para/i,
    ],
    entityExtractors: [
      {
        key: 'nome_cliente',
        pattern: /(?:cobrar|cobrança\s+(?:para|de))\s+([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)*?)(?:\s+CPF|\s+CNPJ|\s+R\$|\s+email|\s+e-mail|$)/i,
      },
      {
        key: 'valor',
        pattern: /R\$\s*([\d.,]+)/i,
      },
      {
        key: 'vencimento',
        pattern: /venc(?:imento|e)?\s*(?:em|:)?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}-\d{2}-\d{2})/i,
      },
    ],
    baseConfidence: 0.85,
  },
  {
    intent: 'query_office_memory',
    patterns: [
      /regra/i,
      /política/i,
      /procedimento/i,
      /como\s+(funciona|fazemos|trabalhamos)/i,
      /padrão\s+do\s+escritório/i,
      /desconto\s+máximo/i,
      /prazo\s+padrão/i,
    ],
    baseConfidence: 0.80,
  },
  {
    intent: 'open_agenda',
    patterns: [
      /agenda/i,
      /compromisso/i,
      /agendamento/i,
      /reunião/i,
    ],
    baseConfidence: 0.65, // Padrões genéricos — confidence conservadora
  },
  {
    intent: 'query_process_status',
    patterns: [
      /processo/i,
      /andamento/i,
      /movimentação/i,
      /publicação/i,
      /prazo\s+(processual|judicial)/i,
      /audiência/i,
    ],
    baseConfidence: 0.65, // Padrões genéricos — confidence conservadora
  },
  {
    intent: 'support_case_status',
    patterns: [
      /status\s+do\s+(caso|processo)/i,
      /como\s+(est[aá]|anda)\s+(o\s+)?(caso|processo)/i,
      /andamento\s+do\s+(caso|processo)/i,
      /atualiza[cç][aã]o\s+(do|sobre\s+o)\s+(caso|processo)/i,
      /cliente.*(pergunt|quer\s+saber).*(caso|processo)/i,
      /respon(d|da)\s+(o\s+)?cliente.*(caso|processo)/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
      {
        key: 'client_name',
        pattern: /(?:cliente|caso\s+d[aoe]|processo\s+d[aoe]\s+cliente)\s*[:\-]?\s*([A-ZÀ-Ú][A-Za-zÀ-ú]+(?:\s+(?:d[aeo]s?|[A-ZÀ-Ú][A-Za-zÀ-ú]+)){1,5})(?=\s*(?:pergunt|quer|pediu|solicitou|[,.!?]|$))/i,
      },
      {
        key: 'process_reference',
        pattern: /(?:refer[eê]ncia|caso)\s*[:\-]\s*([^\n.;!?]{3,80})/i,
      },
    ],
    baseConfidence: 0.88,
  },
  {
    intent: 'financial_report',
    patterns: [
      /faturamento/i,
      /relatório\s+financeiro/i,
      /honorários/i,
      /comissão/i,
      /asaas/i,
    ],
    baseConfidence: 0.80,
  },
  {
    intent: 'legal_case_context',
    patterns: [
      /contexto\s+juridic/i,
      /case\s+brain/i,
      /peca\s+sugerida/i,
      /penden(cia|cias)\s+documenta/i,
      /status\s+da\s+minuta/i,
      /minuta\s+atual/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
    ],
    baseConfidence: 0.82,
  },
  {
    intent: 'legal_first_draft_generate',
    patterns: [
      /gerar\s+(a\s+)?(primeira\s+)?minuta/i,
      /atualizar\s+(a\s+)?(primeira\s+)?minuta/i,
      /refazer\s+(a\s+)?minuta/i,
      /draft\s+factory/i,
      /criar\s+(a\s+)?primeira\s+peca/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
    ],
    baseConfidence: 0.86,
  },
  {
    intent: 'legal_draft_workflow',
    patterns: [
      /aprovar\s+(a\s+)?(minuta|vers[aã]o)/i,
      /aprove\s+(a\s+)?(minuta|vers[aã]o)/i,
      /publicar\s+(a\s+)?(minuta|vers[aã]o)/i,
      /publique\s+(a\s+)?(minuta|vers[aã]o)/i,
      /(aprova[cç][aã]o|publica[cç][aã]o)\s+formal/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
      {
        key: 'workflow_action',
        pattern: /(aprovar|aprove|aprova|publicar|publique|publica)/i,
      },
      {
        key: 'version_number',
        pattern: /(?:vers[aã]o\s*|v)(\d{1,2})\b/i,
      },
    ],
    baseConfidence: 0.9,
  },
  {
    intent: 'legal_draft_review_guidance',
    patterns: [
      /revis(ar|e)\s+(a\s+)?(minuta|vers[aã]o)/i,
      /review\s+(da\s+)?(minuta|vers[aã]o)/i,
      /checklist\s+(da\s+)?minuta/i,
      /o\s+que\s+falta\s+na\s+minuta/i,
      /criticar\s+(a\s+)?minuta/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
      {
        key: 'version_number',
        pattern: /(?:vers[aã]o\s*|v)(\d{1,2})\b/i,
      },
    ],
    baseConfidence: 0.88,
  },
  {
    intent: 'legal_draft_revision_loop',
    patterns: [
      /melhor(e|ar)\s+(a\s+)?minuta\s+por\s+se[cç][aã]o/i,
      /reforc(e|ar)\s+(a\s+)?argumenta[cç][aã]o/i,
      /plano\s+de\s+revis[aã]o\s+da\s+minuta/i,
      /o\s+que\s+voce\s+mudaria\s+na\s+minuta/i,
      /prepare\s+uma\s+nova\s+vers[aã]o\s+da\s+minuta/i,
      /revis[aã]o\s+por\s+se[cç][aã]o/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
      {
        key: 'version_number',
        pattern: /(?:vers[aã]o\s*|v)(\d{1,2})\b/i,
      },
    ],
    baseConfidence: 0.9,
  },
  {
    intent: 'legal_artifact_publish_premium',
    patterns: [
      /publique\s+(o\s+)?artifact\s+premium/i,
      /publicar\s+(o\s+)?pdf\s+final/i,
      /enviar\s+(o\s+)?artifact\s+final\s+para\s+o\s+drive/i,
      /suba\s+(o\s+)?pdf\s+da\s+minuta/i,
      /publique\s+(a\s+)?peca\s+final\s+no\s+drive/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
      {
        key: 'version_number',
        pattern: /(?:vers[aã]o\s*|v)(\d{1,2})\b/i,
      },
    ],
    baseConfidence: 0.9,
  },
  {
    intent: 'legal_document_memory_refresh',
    patterns: [
      /sincroniz(ar|e)\s+(os\s+)?documentos/i,
      /atualiz(ar|e)\s+(a\s+)?mem[oó]ria\s+documental/i,
      /relei(a|a\s+o)\s+(o\s+)?reposit[oó]rio/i,
      /atualiz(ar|e)\s+(o\s+)?acervo/i,
      /sincroniz(ar|e)\s+(a\s+)?pasta\s+do\s+processo/i,
      /atualiz(ar|e)\s+os\s+documentos\s+desse\s+caso/i,
    ],
    entityExtractors: [
      {
        key: 'process_number',
        pattern: /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      },
    ],
    baseConfidence: 0.86,
  },
];

// ─── Sanitizador de PII ───────────────────────────────────────────────────────

/**
 * Remove dados pessoais identificáveis do texto.
 * Deve ser aplicado ANTES de qualquer persistência ou log.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF_REDACTED]')
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '[CNPJ_REDACTED]')
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/(\(?\d{2}\)?\s?)(\d{4,5}[-\s]?\d{4})/g, '[PHONE_REDACTED]')
    .trim();
}

// ─── Função Principal ─────────────────────────────────────────────────────────

/**
 * Analisa o texto do usuário e retorna a intenção detectada.
 *
 * - Só avalia skills presentes em `context.availableSkills`
 *   (lista pré-filtrada com base nas permissões do usuário)
 * - Confidence é calculado como: baseConfidence + bônus proporcional
 *   à quantidade de padrões correspondentes
 * - Retorna intent = 'unknown' e confidence = 0 se nenhum padrão bater
 * - Flag `ambiguous = true` quando dois intents disputam com diferença < 0.10
 */
export function route(text: string, context: RouterContext): RouterIntent {
  const safeText = sanitizeText(text);

  let bestConfidence = 0;
  let secondBestConfidence = 0;
  let bestMatch: Omit<RouterIntent, 'ambiguous'> = {
    intent: 'unknown',
    entities: {},
    confidence: 0,
    safeText,
  };

  for (const def of INTENT_PATTERNS) {
    // Filtra pela lista de skills autorizadas para este usuário
    if (!context.availableSkills.includes(def.intent)) continue;

    let matchCount = 0;
    for (const pattern of def.patterns) {
      if (pattern.test(text)) matchCount++;
    }

    if (matchCount === 0) continue;

    const matchRatio = matchCount / def.patterns.length;
    const confidence = Math.min(0.99, def.baseConfidence + matchRatio * 0.2);

    if (confidence > bestConfidence) {
      secondBestConfidence = bestConfidence;
      bestConfidence = confidence;

      // Extrai entidades do texto original (pré-sanitização)
      // Entidades são passadas ao executor — NUNCA gravadas diretamente em logs
      const entities: Record<string, string> = {};
      if (def.entityExtractors) {
        for (const extractor of def.entityExtractors) {
          const match = text.match(extractor.pattern);
          if (match?.[1]) entities[extractor.key] = match[1];
        }
      }

      bestMatch = { intent: def.intent, entities, confidence, safeText };
    } else if (confidence > secondBestConfidence) {
      secondBestConfidence = confidence;
    }
  }

  const ambiguous = secondBestConfidence >= bestConfidence - 0.10;

  return { ...bestMatch, ambiguous };
}
