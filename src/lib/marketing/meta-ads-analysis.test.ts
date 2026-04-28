import { describe, expect, it } from "vitest";
import { analyzeMetaAdsCsv, parseMetaAdsCsv } from "./meta-ads-analysis";

const csv = `Campaign name,Ad set name,Ad name,Creative name,Audience,Amount spent,Impressions,Link clicks,Leads
Growth - Leads,Empresarios SP,Video Diagnostico,Video depoimento - empresario,Empresarios locais,200,10000,250,10
Growth - Leads,Empresarios SP,Imagem Oferta,Imagem oferta consulta,Empresarios locais,150,8000,80,0
Growth - Leads,Advogados BR,Checklist PDF,Checklist material rico,Advogados autonomos,100,6000,120,5`;

describe("meta ads analysis", () => {
  it("parses and normalizes exported CSV metrics deterministically", () => {
    const rows = parseMetaAdsCsv(csv);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(expect.objectContaining({
      campaignName: "Growth - Leads",
      adName: "Video Diagnostico",
      spend: 200,
      impressions: 10000,
      clicks: 250,
      leads: 10,
      ctr: 2.5,
      cpc: 0.8,
      cpm: 20,
      cpl: 20,
    }));
  });

  it("diagnoses winners, wasted spend, themes, and budget recommendations", () => {
    const analysis = analyzeMetaAdsCsv(csv);

    expect(analysis.totals).toEqual(expect.objectContaining({
      spend: 450,
      impressions: 24000,
      clicks: 450,
      leads: 15,
      ctr: 1.88,
      cpc: 1,
      cpm: 18.75,
      cpl: 30,
    }));
    expect(analysis.winners.map((row) => row.adName)).toEqual(["Video Diagnostico", "Checklist PDF"]);
    expect(analysis.wastedSpend.map((row) => row.adName)).toEqual(["Imagem Oferta"]);
    expect(analysis.creativeThemes[0]).toEqual(expect.objectContaining({ theme: "video/depoimento", leads: 10, cpl: 20 }));
    expect(analysis.audienceThemes[0]).toEqual(expect.objectContaining({ theme: "Empresarios locais", leads: 10 }));
    expect(analysis.findings.some((finding) => finding.title === "Gasto desperdicado")).toBe(true);
    expect(analysis.budgetRecommendations.map((item) => item.action)).toEqual(expect.arrayContaining(["scale", "pause", "monitor"]));
  });

  it("supports Portuguese decimal comma exports", () => {
    const analysis = analyzeMetaAdsCsv(`Campanha,Anuncio,Valor gasto,Impressoes,Cliques,Resultados
Campanha A,Anuncio A,"1.234,50","10.000",100,2`);

    expect(analysis.rows[0]).toEqual(expect.objectContaining({
      spend: 1234.5,
      impressions: 10000,
      clicks: 100,
      leads: 2,
      cpl: 617.25,
    }));
  });
});
