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
    intent: 'sales_profile_setup',
    patterns: [
      /auto[-\s]?configur(ar|e|acao|a[cç][aã]o)\s+(comercial|vendas|atendimento)/i,
      /configur(ar|e)\s+(a\s+)?(skill\s+de\s+)?vendas/i,
      /configur(ar|e)\s+(o\s+)?perfil\s+comercial/i,
      /mayus\s+faz\s+tudo/i,
      /usuario\s+mex(a|er)\s+(o\s+)?minimo\s+(possivel|poss[ií]vel)\s+em\s+configura[cç][oõ]es/i,
      /mont(ar|e)\s+(a\s+)?puv\s+(do\s+)?escrit[oó]rio/i,
      /descobr(ir|a)\s+(cliente\s+ideal|puv|solu[cç][aã]o\s+central)/i,
      /investig(ar|ue)\s+(o\s+)?cliente\s+ideal\s+(do\s+)?escrit[oó]rio/i,
      /perfil\s+comercial\s+(do\s+)?mayus/i,
    ],
    entityExtractors: [
      {
        key: 'ideal_client',
        pattern: /(?:cliente\s+ideal)\s*[:\-]?\s*([^\n.]{8,240})/i,
      },
      {
        key: 'core_solution',
        pattern: /(?:solu(?:cao|\u00e7\u00e3o)\s+(?:central|principal)|solucao|solu\u00e7\u00e3o)\s*[:\-]?\s*([^\n.]{8,240})/i,
      },
      {
        key: 'unique_value_proposition',
        pattern: /(?:puv|proposta\s+unica\s+de\s+valor|proposta\s+\u00fanica\s+de\s+valor)\s*[:\-]?\s*([^\n.]{8,280})/i,
      },
      {
        key: 'value_pillars',
        pattern: /(?:pilares?)\s*[:\-]?\s*([^\n.]{8,220})/i,
      },
      {
        key: 'anti_client_signals',
        pattern: /(?:anti[-\s]?cliente|n(?:ao|\u00e3o)\s+queremos\s+atender)\s*[:\-]?\s*([^\n.]{8,220})/i,
      },
      {
        key: 'confirmation',
        pattern: /(confirmo|validado|pode\s+salvar|pode\s+gravar|salva|grava|aprovado|t[a\u00e1]\s+certo)/i,
      },
    ],
    baseConfidence: 0.93,
  },
  {
    intent: 'sales_consultation',
    patterns: [
      /atendimento\s+(consultivo|comercial|de\s+vendas)/i,
      /consultoria\s+(comercial|de\s+vendas)/i,
      /skill\s+de\s+vendas/i,
      /investig(ar|ue)\s+(o\s+)?lead/i,
      /investig(ar|ue)\s+(tudo\s+)?(que\s+)?precisa\s+(para\s+)?vend/i,
      /cliente\s+ideal\s+(do\s+)?escrit[oó]rio/i,
      /puv|proposta\s+unica\s+de\s+valor|proposta\s+única\s+de\s+valor/i,
      /posicionamento\s+comercial/i,
      /bate[-\s]?papo\s+(de\s+)?(vendas|comercial|consultivo)/i,
      /roteiro\s+(de\s+)?(vendas|atendimento\s+comercial)/i,
      /metodo\s+def/i,
      /descoberta.*encantamento.*fechamento/i,
      /mayus.*(vender|vendas).*melhor/i,
      /fechamento\s+(consultivo|de\s+vendas)/i,
    ],
    entityExtractors: [
      {
        key: 'lead_name',
        pattern: /(?:lead|cliente|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|canal|fase|etapa|dor|obje(?:cao|\u00e7\u00e3o)|valor|ticket|crm|card|,|\.|$))/i,
      },
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead|oportunidade)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|segmento)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:canal|fase|etapa|dor|obje(?:cao|\u00e7\u00e3o)|valor|ticket|crm|card|,|\.|$))/i,
      },
      {
        key: 'channel',
        pattern: /(?:canal|por)\s*[:\-]?\s*(WhatsApp|liga(?:cao|\u00e7\u00e3o)|telefone|reuni(?:ao|\u00e3o)|call)/i,
      },
      {
        key: 'stage',
        pattern: /(?:fase|etapa)\s*[:\-]?\s*(descoberta|encantamento|fechamento|recupera(?:cao|\u00e7\u00e3o)|reativa(?:cao|\u00e7\u00e3o))/i,
      },
      {
        key: 'pain',
        pattern: /(?:dor|caso|problema)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
      {
        key: 'objection',
        pattern: /(?:obje(?:cao|\u00e7\u00e3o)|obstaculo|impeditivo)\s*[:\-]?\s*([^\n.]{4,180})/i,
      },
      {
        key: 'ticket_value',
        pattern: /(?:valor|ticket|honor(?:arios|\u00e1rios)|pre(?:co|\u00e7o))\s*[:R$\s]*([0-9]+(?:[.,][0-9]+)*)/i,
      },
      {
        key: 'objective',
        pattern: /(?:objetivo|meta)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
      {
        key: 'office_ideal_client',
        pattern: /(?:cliente\s+ideal)\s*[:\-]?\s*([^\n.]{8,220})/i,
      },
      {
        key: 'office_solution',
        pattern: /(?:solu(?:cao|\u00e7\u00e3o)\s+(?:central|principal)|solucao)\s*[:\-]?\s*([^\n.]{8,220})/i,
      },
      {
        key: 'office_unique_value_proposition',
        pattern: /(?:puv|proposta\s+unica\s+de\s+valor|proposta\s+\u00fanica\s+de\s+valor)\s*[:\-]?\s*([^\n.]{8,260})/i,
      },
    ],
    baseConfidence: 0.91,
  },
  {
    intent: 'lead_reactivation',
    patterns: [
      /recuper(ar|e)\s+leads?\s+frios?\s+(de|da|do|por|em)\s+/i,
      /reativ(ar|e)\s+leads?\s+frios?\s+(de|da|do|por|em)\s+/i,
      /campanha\s+de\s+reativa[cÃƒÂ§][aÃƒÂ£]o\s+de\s+leads?/i,
      /plano\s+de\s+reativa[cÃƒÂ§][aÃƒÂ£]o\s+de\s+leads?/i,
      /leads?\s+frios?\s+por\s+segmento/i,
    ],
    entityExtractors: [
      {
        key: 'legal_area',
        pattern: /(?:leads?\s+frios?\s+(?:de|da|do|por|em)|segmento|area|ÃƒÂ¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:ha|h[aÃƒÂ¡]|maximo|max|limite|dias|inativos|objetivo|,|\.|$))/i,
      },
      {
        key: 'segment',
        pattern: /(?:segmento)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:ha|h[aÃƒÂ¡]|maximo|max|limite|dias|inativos|objetivo|,|\.|$))/i,
      },
      {
        key: 'min_days_inactive',
        pattern: /(?:ha|h[aÃƒÂ¡]|inativos?\s+ha|sem\s+intera[cÃƒÂ§][aÃƒÂ£]o\s+ha)\s*([0-9]{1,3})\s*dias/i,
      },
      {
        key: 'max_leads',
        pattern: /(?:maximo|max|limite)\s*[:\-]?\s*([0-9]{1,2})\s*leads?/i,
      },
      {
        key: 'goal',
        pattern: /(?:objetivo|meta)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
    ],
    baseConfidence: 0.9,
  },
  {
    intent: 'client_acceptance_record',
    patterns: [
      /registr(ar|e)\s+(o\s+)?aceite\s+(do|da)\s+cliente/i,
      /cliente\s+(aceitou|aprovou)\s+(a\s+)?(proposta|contrato|cobran[cÃƒÂ§]a)/i,
      /aceite\s+(da\s+)?(proposta|contrato|cobran[cÃƒÂ§]a|entrada|fechamento)/i,
      /registr(ar|e)\s+(fechamento|aceite)\s+comercial/i,
      /trilha\s+de\s+auditoria\s+(do\s+)?aceite/i,
    ],
    entityExtractors: [
      {
        key: 'client_name',
        pattern: /(?:cliente|lead|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|ÃƒÂ¡rea|valor|canal|aceitou|aprovou|crm|card|,|\.|$))/i,
      },
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead|oportunidade)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|ÃƒÂ¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:valor|canal|crm|card|,|\.|$))/i,
      },
      {
        key: 'acceptance_type',
        pattern: /(proposta|contrato|cobran[cÃƒÂ§]a|pagamento|entrada|fechamento)/i,
      },
      {
        key: 'acceptance_channel',
        pattern: /(?:canal|por)\s*[:\-]?\s*(WhatsApp|email|e-mail|telefone|reuniao|reuni[aÃƒÂ£]o|presencial)/i,
      },
      {
        key: 'amount',
        pattern: /(?:valor|total|honor[aÃƒÂ¡]rios)\s*[:R$\s]*([0-9]+(?:[.,][0-9]+)*)/i,
      },
      {
        key: 'evidence_summary',
        pattern: /(?:evidencia|evid[ÃƒÂê]ncia|obs|observa[cÃƒÂ§][aÃƒÂ£]o)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
    ],
    baseConfidence: 0.88,
  },
  {
    intent: 'external_action_preview',
    patterns: [
      /preview\s+(antes\s+de\s+)?(enviar|gerar|disparar)/i,
      /pre[-\s]?flight\s+(de\s+)?(contrato|cobran[cÃƒÂ§]a|zapsign|asaas|whatsapp)/i,
      /aprova[cÃƒÂ§][aÃƒÂ£]o\s+antes\s+de\s+(enviar|gerar|disparar)/i,
      /revis(ar|e)\s+(contrato|cobran[cÃƒÂ§]a|zapsign|asaas)\s+antes/i,
      /checklist\s+(de\s+)?aprova[cÃƒÂ§][aÃƒÂ£]o\s+(externa|comercial)/i,
    ],
    entityExtractors: [
      {
        key: 'action_type',
        pattern: /(zapsign|contrato|asaas|cobran[cÃƒÂ§]a|boleto|pix|whatsapp|mensagem)/i,
      },
      {
        key: 'client_name',
        pattern: /(?:cliente|lead|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|ÃƒÂ¡rea|valor|email|e-mail|crm|card|,|\.|$))/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|ÃƒÂ¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:valor|email|e-mail|crm|card|,|\.|$))/i,
      },
      {
        key: 'amount',
        pattern: /(?:valor|total|honor[aÃƒÂ¡]rios)\s*[:R$\s]*([0-9]+(?:[.,][0-9]+)*)/i,
      },
      {
        key: 'recipient_email',
        pattern: /(?:email|e-mail)\s*[:\-]?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
      },
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead|oportunidade)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
    ],
    baseConfidence: 0.88,
  },
  {
    intent: 'revenue_flow_plan',
    patterns: [
      /proposta.*contrato.*cobranca.*caso/i,
      /proposta\s*[-\u003e>]\s*contrato\s*[-\u003e>]\s*cobran[cÃƒÂ§]a/i,
      /contrato\s*[-\u003e>]\s*cobran[cÃƒÂ§]a\s*[-\u003e>]\s*(abertura\s+de\s+)?caso/i,
      /fluxo\s+(agentico\s+)?(de\s+)?receita\s+(para\s+)?caso/i,
      /revenue[-\s]?to[-\s]?case/i,
      /abr(ir|a)\s+caso\s+ap[oÃƒÂ³]s\s+(pagamento|cobran[cÃƒÂ§]a)/i,
      /plano\s+(de\s+)?convers[aÃƒÂ£]o\s+(do|para)\s+lead/i,
    ],
    entityExtractors: [
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead|oportunidade)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
      {
        key: 'client_name',
        pattern: /(?:cliente|lead|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|ÃƒÂ¡rea|valor|crm|card|,|\.|$))/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|ÃƒÂ¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:valor|crm|card|,|\.|$))/i,
      },
      {
        key: 'amount',
        pattern: /(?:valor|total|honor[aÃƒÂ¡]rios)\s*[:R$\s]*([0-9]+(?:[.,][0-9]+)*)/i,
      },
    ],
    baseConfidence: 0.88,
  },
  {
    intent: 'lead_schedule',
    patterns: [
      /agend(ar|e)\s+(consulta|qualifica[cÃƒÂ§][aÃƒÂ£]o|retorno)\s+(do|para)\s+lead/i,
      /marc(ar|e)\s+(consulta|reuni[aÃƒÂ£]o|retorno)\s+(do|para)\s+lead/i,
      /crie\s+(um\s+)?agendamento\s+(do|para)\s+lead/i,
      /coloque\s+(o\s+)?lead\s+na\s+agenda/i,
      /agenda\s+(de\s+)?retorno\s+(do|para)\s+lead/i,
    ],
    entityExtractors: [
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
      {
        key: 'lead_name',
        pattern: /(?:lead|cliente|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|ÃƒÂ¡rea|dor|data|horario|hor[aÃƒÂ¡]rio|em|para|crm|card|,|\.|$))/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|ÃƒÂ¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:dor|data|horario|hor[aÃƒÂ¡]rio|em|para|crm|card|,|\.|$))/i,
      },
      {
        key: 'pain',
        pattern: /(?:dor|caso|problema)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
      {
        key: 'scheduled_for',
        pattern: /(?:data|horario|hor[aÃƒÂ¡]rio|para|em)\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}(?:[T\s][0-9]{2}:?[0-9]{2}(?::?[0-9]{2})?)?)/i,
      },
      {
        key: 'meeting_type',
        pattern: /(consulta|qualifica[cÃƒÂ§][aÃƒÂ£]o|retorno|reuni[aÃƒÂ£]o)/i,
      },
    ],
    baseConfidence: 0.88,
  },
  {
    intent: 'lead_followup',
    patterns: [
      /follow[-\s]?up\s+(do|para)\s+lead/i,
      /retom(ar|e)\s+(o\s+)?contato\s+com\s+(o\s+)?lead/i,
      /cad[eÃª]ncia\s+(de\s+)?follow[-\s]?up/i,
      /mensagem\s+(de\s+)?follow[-\s]?up/i,
      /recuper(ar|e)\s+(o\s+)?lead/i,
      /reativ(ar|e)\s+(o\s+)?lead/i,
    ],
    entityExtractors: [
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
      {
        key: 'lead_name',
        pattern: /(?:lead|cliente|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|Ã¡rea|dor|objetivo|crm|card|,|\.|$))/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|Ã¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:dor|objetivo|crm|card|,|\.|$))/i,
      },
      {
        key: 'pain',
        pattern: /(?:dor|caso|problema)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
      {
        key: 'goal',
        pattern: /(?:objetivo|meta)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
    ],
    baseConfidence: 0.87,
  },
  {
    intent: 'lead_qualify',
    patterns: [
      /qualific(ar|e)\s+(o\s+)?lead/i,
      /roteiro\s+de\s+qualifica[cÃ§][aÃ£]o/i,
      /documentos\s+m[iÃ­]nimos\s+(do|para)\s+lead/i,
      /pr[oÃ³]ximo\s+melhor\s+movimento\s+(do|para)\s+lead/i,
      /obje[cÃ§][oÃµ]es\s+(prov[aÃ¡]veis|do\s+lead)/i,
    ],
    entityExtractors: [
      {
        key: 'crm_task_id',
        pattern: /(?:crm_task_id|card|lead)\s*[:#\-]?\s*([0-9a-f]{8}-[0-9a-f-]{27,}|crm-task-[\w-]+)/i,
      },
      {
        key: 'lead_name',
        pattern: /(?:lead|cliente|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:area|Ã¡rea|dor|crm|card|,|\.|$))/i,
      },
      {
        key: 'legal_area',
        pattern: /(?:area|Ã¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:dor|crm|card|,|\.|$))/i,
      },
      {
        key: 'pain',
        pattern: /(?:dor|caso|problema)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
    ],
    baseConfidence: 0.86,
  },
  {
    intent: 'lead_intake',
    patterns: [
      /registr(ar|e)\s+(um\s+)?(novo\s+)?lead/i,
      /captur(ar|e)\s+(um\s+)?lead/i,
      /qualific(ar|e)\s+(um\s+)?lead/i,
      /novo\s+lead/i,
      /lead\s+(de|para)\s+/i,
      /indic(a[cÃ§][aÃ£]o|ado|ada)/i,
      /fui\s+indicad[oa]/i,
      /me\s+indicou/i,
      /recomend(a[cÃ§][aÃ£]o|ado|ada)/i,
    ],
    entityExtractors: [
      {
        key: 'name',
        pattern: /(?:lead|cliente|indicado|indicada|nome)\s*[:\-]?\s*([^\d,.;:!?]+?)(?=\s*(?:telefone|whats|email|e-mail|area|Ã¡rea|dor|origem|foi|,|\.|$))/i,
      },
      {
        key: 'phone',
        pattern: /(?:telefone|whats(?:app)?|celular)\s*[:\-]?\s*(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/i,
      },
      {
        key: 'email',
        pattern: /(?:email|e-mail)\s*[:\-]?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
      },
      {
        key: 'legalArea',
        pattern: /(?:area|Ã¡rea)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:dor|origem|canal|cidade|telefone|whats|,|\.|$))/i,
      },
      {
        key: 'origin',
        pattern: /(?:origem|veio\s+de|chegou\s+por)\s*([^,.;:!?]+?)(?=\s*(?:canal|area|Ã¡rea|dor|,|\.|$))/i,
      },
      {
        key: 'channel',
        pattern: /(?:canal)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:origem|area|Ã¡rea|dor|,|\.|$))/i,
      },
      {
        key: 'pain',
        pattern: /(?:dor|caso|problema)\s*[:\-]?\s*([^\n.]{8,180})/i,
      },
      {
        key: 'referredBy',
        pattern: /(?:indicado\s+por|indicada\s+por|me\s+indicou|recomendado\s+por|recomendada\s+por)\s*[:\-]?\s*([^,.;:!?]+?)(?=\s*(?:telefone|whats|email|e-mail|area|Ã¡rea|dor|origem|,|\.|$))/i,
      },
    ],
    baseConfidence: 0.84,
  },
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
          if (match?.[1]) entities[extractor.key] = match[1].trim();
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
