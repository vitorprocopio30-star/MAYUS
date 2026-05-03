import { describe, expect, it } from "vitest";

import {
  buildCommercialFirstReply,
  buildCommercialPlaybookArtifactMetadata,
  buildCommercialPlaybookModel,
  buildCommercialPlaybookSetup,
} from "./commercial-playbook-template";

describe("commercial playbook template", () => {
  it("ativa playbook Dutra somente quando o contexto e Dutra/RMC/GRAM", () => {
    const playbook = buildCommercialPlaybookModel({
      firmName: "Dutra Advocacia",
      legalArea: "RMC e GRAM",
    });

    expect(playbook.playbookKey).toBe("dutra_blindagem");
    expect(playbook.officeName).toBe("Dutra Advocacia");
    expect(playbook.tenantIsolation.scope).toBe("dutra_only");
    expect(playbook.methodName).toContain("Blindagem");
    expect(playbook.dailyReportSections.map((section) => section.id)).toEqual(expect.arrayContaining(["rmc", "gram"]));
    expect(playbook.intakeQuestions.join(" ")).toContain("contracheque");
  });

  it("usa template generico sem termos proprietarios Dutra para outros escritorios", () => {
    const playbook = buildCommercialPlaybookModel({
      firmName: "Almeida Legal",
      legalArea: "previdenciario",
      idealClient: "beneficiarios do INSS com negativa recente",
    });
    const serialized = JSON.stringify(playbook);

    expect(playbook.playbookKey).toBe("generic_legal_sales");
    expect(playbook.tenantIsolation.scope).toBe("generic_fallback");
    expect(playbook.intakeQuestions.length).toBeGreaterThanOrEqual(10);
    expect(serialized).not.toMatch(/Dutra|RMC|GRAM|Blindagem|Roberto|Camila/);
  });

  it("mantem template generico quando o usuario pede explicitamente uma base sem escritorio especifico", () => {
    const playbook = buildCommercialPlaybookSetup({
      templateFlavor: "generic",
      firmName: "Escritorio Modelo",
      legalArea: "direito do consumidor",
    });
    const metadata = buildCommercialPlaybookArtifactMetadata(playbook);

    expect(playbook.playbookKey).toBe("generic_legal_sales");
    expect(metadata.playbook_key).toBe("generic_legal_sales");
    expect(metadata.intake_questions).toEqual(expect.arrayContaining([
      expect.stringContaining("Qual area juridica"),
    ]));
  });

  it("responde WhatsApp Dutra com descoberta RMC sem afetar o fallback generico", () => {
    const dutraReply = buildCommercialFirstReply({
      leadName: "Roberto Silva",
      lastInboundText: "Tenho desconto de RMC no contracheque e queria saber o que fazer.",
      profile: { firmName: "Dutra Advocacia" },
    });
    const genericReply = buildCommercialFirstReply({
      leadName: "Maria",
      lastInboundText: "Tenho desconto de RMC no contracheque e queria saber o que fazer.",
      profile: { firmName: "Almeida Legal", legalArea: "previdenciario" },
    });

    expect(dutraReply).toContain("RMC/cartao consignado");
    expect(dutraReply).toContain("qual banco");
    expect(genericReply).not.toMatch(/Dutra|GRAM|Blindagem|Roberto|Camila/);
    expect(genericReply).toContain("o que aconteceu");
  });
});
