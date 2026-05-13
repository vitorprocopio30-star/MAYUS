export type OfficePlaybookProfile = {
  status?: "draft" | "active" | "needs_owner_input" | string | null;
  office_name?: string | null;
  main_legal_areas?: string[] | null;
  thesis_by_area?: Array<{ area: string; thesis: string }> | null;
  ideal_client?: string | null;
  common_pains?: string[] | null;
  offer_positioning?: string | null;
  qualification_questions?: string[] | null;
  required_documents?: string[] | null;
  forbidden_claims?: string[] | null;
  pricing_policy?: string | null;
  handoff_rules?: string[] | null;
  objection_handling?: Array<{ objection: string; response: string; next_question?: string | null }> | null;
  tone_of_voice?: string | null;
  disqualification_rules?: string[] | null;
  next_best_actions?: string[] | null;
  owner_questions?: string[] | null;
  setup_session?: {
    active?: boolean;
    current_step?: string | null;
    completed_steps?: string[] | null;
    started_at?: string | null;
    updated_at?: string | null;
  } | null;
  source?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export const OFFICE_PLAYBOOK_OWNER_QUESTIONS = [
  "Quais areas juridicas o escritorio quer vender pelo WhatsApp nos proximos 90 dias?",
  "Para cada area principal, qual e a tese/oportunidade que o escritorio acredita e sabe explicar melhor?",
  "Quem e o cliente ideal dessa tese e quais sinais mostram que ele e um bom lead?",
  "Quais dores ou frases o cliente costuma trazer antes de contratar?",
  "Qual e a promessa comercial permitida e qual promessa juridica e proibida?",
  "Quais documentos minimos o MAYUS deve pedir antes de escalar para humano?",
  "Quais perguntas de qualificacao separam lead curioso de lead pronto para avancar?",
  "Quando o MAYUS pode responder sozinho e quando deve chamar alguem do escritorio?",
  "Quais objecoes aparecem mais: preco, confianca, prazo, decisor, medo ou falta de documento?",
  "Qual e o proximo passo ideal para um lead quente: call, envio de documentos, analise, proposta ou atendimento humano?",
];

export const OFFICE_PLAYBOOK_SETUP_STEPS = [
  {
    id: "main_legal_areas",
    question: "Quais areas juridicas o escritorio quer vender primeiro pelo WhatsApp? Pode responder em lista curta.",
  },
  {
    id: "thesis_by_area",
    question: "Qual e a principal tese ou oportunidade juridica dessas areas? Exemplo: RMC/Credcesta, divorc.io consensual, BPC/LOAS negado.",
  },
  {
    id: "ideal_client",
    question: "Quem e o cliente ideal dessa tese? Descreva os sinais que mostram que esse lead vale atendimento.",
  },
  {
    id: "common_pains",
    question: "Quais dores ou frases esse cliente costuma falar no WhatsApp antes de contratar?",
  },
  {
    id: "offer_positioning",
    question: "Como o escritorio posiciona a oferta sem prometer resultado? O que voces entregam de valor na primeira etapa?",
  },
  {
    id: "qualification_questions",
    question: "Quais perguntas o MAYUS deve fazer para separar curioso de lead pronto para avancar?",
  },
  {
    id: "required_documents",
    question: "Quais documentos minimos o MAYUS deve pedir antes de encaminhar para humano?",
  },
  {
    id: "forbidden_claims",
    question: "Quais promessas ou frases o MAYUS nunca pode falar nesse escritorio?",
  },
  {
    id: "handoff_rules",
    question: "Quando o MAYUS deve parar e chamar alguem do escritorio?",
  },
  {
    id: "next_best_actions",
    question: "Quando o lead estiver quente, qual e o proximo passo ideal: call, documentos, analise, proposta ou atendimento humano?",
  },
] as const;

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function cleanList(value?: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(String(item || ""))).filter((item): item is string => Boolean(item)).slice(0, 12)
    : [];
}

export function normalizeOfficePlaybookProfile(value: unknown): OfficePlaybookProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, any>;

  return {
    status: cleanText(raw.status) || "draft",
    office_name: cleanText(raw.office_name) || cleanText(raw.officeName),
    main_legal_areas: cleanList(raw.main_legal_areas || raw.mainLegalAreas),
    thesis_by_area: Array.isArray(raw.thesis_by_area || raw.thesisByArea)
      ? (raw.thesis_by_area || raw.thesisByArea)
        .map((item: any) => ({ area: cleanText(item?.area), thesis: cleanText(item?.thesis) }))
        .filter((item: { area: string | null; thesis: string | null }) => item.area && item.thesis)
        .slice(0, 8) as Array<{ area: string; thesis: string }>
      : [],
    ideal_client: cleanText(raw.ideal_client) || cleanText(raw.idealClient),
    common_pains: cleanList(raw.common_pains || raw.commonPains),
    offer_positioning: cleanText(raw.offer_positioning) || cleanText(raw.offerPositioning),
    qualification_questions: cleanList(raw.qualification_questions || raw.qualificationQuestions),
    required_documents: cleanList(raw.required_documents || raw.requiredDocuments),
    forbidden_claims: cleanList(raw.forbidden_claims || raw.forbiddenClaims),
    pricing_policy: cleanText(raw.pricing_policy) || cleanText(raw.pricingPolicy),
    handoff_rules: cleanList(raw.handoff_rules || raw.handoffRules),
    objection_handling: Array.isArray(raw.objection_handling || raw.objectionHandling)
      ? (raw.objection_handling || raw.objectionHandling)
        .map((item: any) => ({
          objection: cleanText(item?.objection),
          response: cleanText(item?.response),
          next_question: cleanText(item?.next_question) || cleanText(item?.nextQuestion),
        }))
        .filter((item: { objection: string | null; response: string | null }) => item.objection && item.response)
        .slice(0, 8) as Array<{ objection: string; response: string; next_question?: string | null }>
      : [],
    tone_of_voice: cleanText(raw.tone_of_voice) || cleanText(raw.toneOfVoice),
    disqualification_rules: cleanList(raw.disqualification_rules || raw.disqualificationRules),
    next_best_actions: cleanList(raw.next_best_actions || raw.nextBestActions),
    owner_questions: cleanList(raw.owner_questions || raw.ownerQuestions),
    setup_session: raw.setup_session && typeof raw.setup_session === "object" && !Array.isArray(raw.setup_session)
      ? raw.setup_session
      : null,
    source: raw.source && typeof raw.source === "object" && !Array.isArray(raw.source) ? raw.source : null,
    updated_at: cleanText(raw.updated_at) || cleanText(raw.updatedAt),
  };
}

export function getOfficePlaybookMissingSignals(profile: OfficePlaybookProfile | null) {
  return [
    profile?.main_legal_areas?.length ? null : "areas juridicas principais",
    profile?.thesis_by_area?.length ? null : "tese/oportunidade por area",
    profile?.ideal_client ? null : "cliente ideal",
    profile?.common_pains?.length ? null : "dores e frases do cliente",
    profile?.offer_positioning ? null : "posicionamento/oferta",
    profile?.qualification_questions?.length ? null : "perguntas de qualificacao",
    profile?.required_documents?.length ? null : "documentos minimos",
    profile?.forbidden_claims?.length ? null : "promessas proibidas",
    profile?.handoff_rules?.length ? null : "regras de handoff humano",
    profile?.objection_handling?.length ? null : "objecoes e respostas comerciais",
    profile?.next_best_actions?.length ? null : "proximos passos por lead quente",
  ].filter(Boolean) as string[];
}

export function buildDefaultOfficePlaybookProfile(existing?: OfficePlaybookProfile | null): OfficePlaybookProfile {
  return {
    status: "needs_owner_input",
    office_name: existing?.office_name || null,
    main_legal_areas: existing?.main_legal_areas || [],
    thesis_by_area: existing?.thesis_by_area || [],
    ideal_client: existing?.ideal_client || null,
    common_pains: existing?.common_pains || [],
    offer_positioning: existing?.offer_positioning || null,
    qualification_questions: existing?.qualification_questions || [],
    required_documents: existing?.required_documents || [],
    forbidden_claims: existing?.forbidden_claims || [
      "causa ganha",
      "resultado garantido",
      "prazo judicial garantido",
      "valor ou estrategia juridica sem analise humana",
    ],
    pricing_policy: existing?.pricing_policy || null,
    handoff_rules: existing?.handoff_rules || [
      "Chamar humano quando houver pedido de contrato, preco, estrategia juridica, urgencia, status de processo sem base confirmada ou promessa de resultado.",
    ],
    objection_handling: existing?.objection_handling || [],
    tone_of_voice: existing?.tone_of_voice || "WhatsApp humano, consultivo, direto e seguro.",
    disqualification_rules: existing?.disqualification_rules || [],
    next_best_actions: existing?.next_best_actions || [],
    owner_questions: OFFICE_PLAYBOOK_OWNER_QUESTIONS,
    setup_session: existing?.setup_session || null,
    source: existing?.source || { channel: "setup_doctor", kind: "owner_interview_questions" },
    updated_at: new Date().toISOString(),
  };
}

export function summarizeOfficePlaybookForPrompt(profile: OfficePlaybookProfile | null) {
  if (!profile) return null;
  const theses = (profile.thesis_by_area || []).map((item) => `${item.area}: ${item.thesis}`).join("; ");
  const objections = (profile.objection_handling || []).map((item) => `${item.objection}: ${item.response}${item.next_question ? ` Pergunta: ${item.next_question}` : ""}`).join("; ");

  return [
    profile.office_name ? `Escritorio: ${profile.office_name}` : null,
    profile.main_legal_areas?.length ? `Areas prioritarias: ${profile.main_legal_areas.join(", ")}` : null,
    theses ? `Teses/oportunidades por area: ${theses}` : null,
    profile.ideal_client ? `Cliente ideal: ${profile.ideal_client}` : null,
    profile.common_pains?.length ? `Dores/frases comuns: ${profile.common_pains.join("; ")}` : null,
    profile.offer_positioning ? `Oferta/posicionamento: ${profile.offer_positioning}` : null,
    profile.qualification_questions?.length ? `Perguntas de qualificacao: ${profile.qualification_questions.join("; ")}` : null,
    profile.required_documents?.length ? `Documentos minimos: ${profile.required_documents.join("; ")}` : null,
    profile.forbidden_claims?.length ? `Promessas proibidas: ${profile.forbidden_claims.join("; ")}` : null,
    profile.handoff_rules?.length ? `Handoff humano: ${profile.handoff_rules.join("; ")}` : null,
    objections ? `Objecoes comerciais: ${objections}` : null,
    profile.next_best_actions?.length ? `Proximos passos: ${profile.next_best_actions.join("; ")}` : null,
  ].filter(Boolean).join("\n") || null;
}
