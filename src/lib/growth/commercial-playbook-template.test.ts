import { describe, expect, it } from "vitest";
import {
  buildCommercialPlaybookArtifactMetadata,
  buildCommercialPlaybookModel,
  buildCommercialPlaybookReply,
} from "./commercial-playbook-template";

describe("commercial playbook template", () => {
  it("inclui matriz de skills DEF e plano de treino para escritorios", () => {
    const playbook = buildCommercialPlaybookModel({
      firmName: "Dutra Advocacia",
      legalArea: "RMC e descontos em folha",
      uniqueValueProposition: "Diagnostico consultivo de descontos indevidos antes de proposta.",
    });

    expect(playbook.defSkills.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      "diagnostic_discovery",
      "variable_isolation",
      "non_robotic_script",
      "supervised_sparring",
    ]));
    expect(playbook.officeTrainingPlan.join(" ")).toContain("sparring semanal");

    const metadata = buildCommercialPlaybookArtifactMetadata(playbook);
    expect(metadata.def_skills.length).toBeGreaterThan(0);
    expect(metadata.office_training_plan).toEqual(playbook.officeTrainingPlan);

    const reply = buildCommercialPlaybookReply(playbook);
    expect(reply).toContain("Skills de excelencia");
  });
});

