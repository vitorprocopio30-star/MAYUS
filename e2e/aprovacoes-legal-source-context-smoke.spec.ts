import { expect, test } from "@playwright/test";
import { getPlaywrightCredentials, loginThroughUi } from "./helpers/auth";

test.describe("Aprovacoes legal source context smoke", () => {
  const credentials = getPlaywrightCredentials();

  test.skip(!credentials.available, "Configure PLAYWRIGHT_EMAIL e PLAYWRIGHT_PASSWORD para rodar os testes autenticados.");

  test("mostra fontes, lacunas e bloqueio de acao externa antes do approval juridico", async ({ page }) => {
    test.setTimeout(120_000);

    let approvalPosted = false;
    let inboxRequests = 0;

    await page.route("**/api/brain/inbox**", async (route) => {
      inboxRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pending_count: 1,
          pending_approvals: [
            {
              id: "approval-source-context-e2e",
              status: "pending",
              risk_level: "high",
              created_at: "2026-06-08T12:00:00.000Z",
              approved_at: null,
              decision_notes: null,
              audit_log_id: "audit-source-context-e2e",
              task: {
                id: "task-source-context-e2e",
                title: "Gerar minuta com fontes pendentes supervisionadas",
                goal: "Validar fontes e pedir aprovacao humana antes da Draft Factory.",
                module: "mayus",
                channel: "chat",
                status: "awaiting_approval",
              },
              step: {
                id: "step-source-context-e2e",
                title: "Gerar primeira minuta",
                capability_name: "legal_first_draft_generate",
                handler_type: "lex_draft_factory",
                step_type: "capability",
              },
              awaiting_payload: {
                skillName: "legal_first_draft_generate",
                riskLevel: "high",
                processLabel: "0000001-11.2026.8.26.0100",
                proposedActionLabel: "Gerar primeira minuta juridica",
                missionGoal: "Preparar contestacao interna sem protocolo externo.",
                reason: "Fontes externas pendentes exigem approval humano.",
                entities: {
                  process_number: "0000001-11.2026.8.26.0100",
                  recommended_piece_label: "Contestacao Previdenciaria",
                },
                methodology: {
                  expectedDocuments: ["Procuracao", "CNIS atualizado"],
                },
                sources: {
                  factual: ["contestacao-previdenciaria.pdf"],
                },
                gaps: {
                  all: ["Validar Tema STJ antes de citar", "Conferir CNIS atualizado"],
                },
                pieceContext: {
                  phase: "Contestacao",
                  documentsUsed: ["contestacao-previdenciaria.pdf"],
                  draftVerificationChecklist: [
                    "Nao citar precedente sem validacao humana.",
                    "Manter minuta como artifact interno.",
                  ],
                  case_brain: {
                    high_risk_count: 1,
                    high_contradiction_count: 0,
                    grounding_gap_count: 2,
                  },
                },
                openclawPolicy: {
                  outcome: "requires_approval",
                  requires_approval: true,
                  reason: "Acao juridica sensivel exige aprovacao humana.",
                },
                sideEffectGuardrail: {
                  protectedSideEffects: ["protocol_filing", "external_publication"],
                  approvalGate: "human_review_required",
                },
              },
            },
          ],
          recent_approvals: [],
          recent_tasks: [],
          recent_artifacts: [],
          recent_events: [],
          activity: [],
        }),
      });
    });

    await page.route("**/api/juridico/movement-reviews**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          reviews: [
            {
              id: "movement-review-source-context-e2e",
              created_at: "2026-06-08T12:01:00.000Z",
              status: "review_required",
              numero_cnj: "0000001-11.2026.8.26.0100",
              processo_id: "process-source-context-e2e",
              process_movimentacao_id: "movement-source-context-e2e",
              tipo_evento: "PRAZO",
              acao_sugerida: "Manifestar-se sobre peticao",
              data_vencimento_extraida: "2026-06-20T00:00:00.000Z",
              confianca_analise: "media",
              confidence: "media",
              origem: "heuristica",
              motivo: "Polo e obrigacao exigem revisao humana antes de criar prazo/card.",
              polo_representado: "autor",
              obrigacao_de_quem: "escritorio",
              confidence_reason: "Movimentacao direcionada ao polo representado, mas sem evidencia deterministica suficiente.",
              evidencia: "Intime-se a parte autora para manifestar-se em 15 dias.",
              review_required: true,
              contract: {
                review_status: "review_required",
                audit_source: "movement_review_recovery",
                human_decision: {
                  status: "review_required",
                  reviewed_by: "ui-harness",
                  justification: "Recuperacao manteve acao externa bloqueada ate decisao humana.",
                },
              },
              human_decision: {
                status: "review_required",
                actor_id: "ui-harness",
                reason: "Responsavel deve confirmar prazo e providencia antes de side effects.",
              },
              side_effects: {
                blocked_side_effects: ["deadline_creation", "card_creation", "draft_factory"],
                reason: "Side effects juridicos bloqueados ate aprovacao humana.",
              },
              agentic_governance: {
                openclaw: {
                  surface: "legal_decision",
                  outcome: "requires_approval",
                  requires_approval: true,
                  can_execute_now: false,
                  reason: "Politica OpenClaw exige aprovacao humana antes de side effects juridicos.",
                },
                hermes: {
                  status: "waiting_approval",
                  events_count: 2,
                  last_event_type: "approval_requested",
                  last_event_summary: "Movimentacao juridica enviada para supervisao humana.",
                },
              },
              supervision_context: {
                sources_used: ["process_movimentacoes", "monitored_processes"],
                gaps: ["confirmar prazo fatal"],
                blockers: ["human_approval_required"],
                operational_thesis: "Movimentacao exige supervisao antes da Draft Factory.",
                next_action_before_draft_factory: "Aprovador deve confirmar prazo e providencia.",
                openclaw_reason: "OpenClaw exige aprovacao humana.",
                case_brain: {
                  summary: "Case Brain aponta risco de prazo fatal e lacuna documental antes da minuta.",
                  high_risk_count: 1,
                  high_contradiction_count: 1,
                  grounding_gap_count: 2,
                  risks: ["Risco de prazo fatal sem confirmacao do cartorio"],
                  contradictions: ["Data da publicacao diverge da data de ciencia"],
                  gaps: ["confirmar prazo fatal"],
                  missing_documents: ["certidao de publicacao"],
                  relevant_unused_documents: ["peticao-inicial.pdf"],
                },
              },
              movimentacao_data: "2026-06-08",
              movimentacao_conteudo: "Intime-se a parte autora para manifestar-se em 15 dias.",
              cliente_nome: "Cliente Source Gate",
              tribunal: "TJSP",
            },
          ],
          stuck_reviews: [],
        }),
      });
    });

    await page.route("**/api/whatsapp/agent-audit**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          generated_at: "2026-06-08T12:05:00.000Z",
          metrics: {
            total: 0,
            blocked: 0,
            repaired: 0,
            safe_fallback: 0,
            llm_repaired: 0,
            warnings: 0,
            errors: 0,
            quality_blocks: 0,
          },
          entries: [],
        }),
      });
    });

    await page.route("**/api/ai/approve", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body).toEqual(expect.objectContaining({
        auditLogId: "audit-source-context-e2e",
        decision: "approved",
      }));
      approvalPosted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await loginThroughUi(page, { browserProfileMode: "ui-harness" });

    await page.goto("/dashboard/aprovacoes", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /Inbox de Aprova/i })).toBeVisible();
    await expect.poll(() => inboxRequests, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/Missao juridica supervisionada/i)).toBeVisible();
    await expect(page.getByText("Fontes usadas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/contestacao-previdenciaria\.pdf/i)).toBeVisible();
    await expect(page.getByText("Lacunas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Validar Tema STJ antes de citar/i)).toBeVisible();
    await expect(page.getByText(/protocol_filing/i)).toBeVisible();
    await expect(page.getByText(/external_publication/i)).toBeVisible();
    await expect(page.getByText("Polo", { exact: true })).toBeVisible();
    await expect(page.getByText("autor", { exact: true })).toBeVisible();
    await expect(page.getByText("Obrigacao", { exact: true })).toBeVisible();
    await expect(page.getByText("escritorio", { exact: true })).toBeVisible();
    await expect(page.getByText("Intime-se a parte autora para manifestar-se em 15 dias.", { exact: true })).toBeVisible();
    await expect(page.getByText(/OpenClaw exige aprovacao humana/i)).toBeVisible();
    await expect(page.getByText(/Contrato da movimentacao/i)).toBeVisible();
    await expect(page.getByText("movement_review_recovery", { exact: true })).toBeVisible();
    await expect(page.getByText(/Case Brain operacional/i)).toBeVisible();
    await expect(page.getByText(/Case Brain aponta risco de prazo fatal/i)).toBeVisible();
    await expect(page.getByText(/Risco de prazo fatal sem confirmacao/i)).toBeVisible();
    await expect(page.getByText(/certidao de publicacao/i)).toBeVisible();
    await expect(page.getByText(/Side effects protegidos/i)).toBeVisible();
    await expect(page.getByText(/deadline_creation/i)).toBeVisible();

    await page.getByRole("button", { name: /^Aprovar$/i }).click();
    await expect.poll(() => approvalPosted, { timeout: 30_000 }).toBe(true);
  });
});
