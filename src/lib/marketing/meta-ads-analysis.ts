export type MetaAdsMetricRow = {
  campaignName: string;
  adSetName: string;
  adName: string;
  creativeName: string;
  audienceName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpl: number | null;
};

export type MetaAdsTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpl: number | null;
};

export type MetaAdsFinding = {
  severity: "good" | "warning" | "critical";
  title: string;
  detail: string;
};

export type MetaAdsRecommendation = {
  action: "scale" | "pause" | "test" | "monitor";
  title: string;
  detail: string;
};

export type MetaAdsAnalysis = {
  rows: MetaAdsMetricRow[];
  totals: MetaAdsTotals;
  benchmarks: {
    avgCpl: number | null;
    avgCtr: number;
    avgCpc: number;
    avgCpm: number;
  };
  winners: MetaAdsMetricRow[];
  wastedSpend: MetaAdsMetricRow[];
  creativeThemes: Array<{ theme: string; spend: number; leads: number; cpl: number | null; rows: number }>;
  audienceThemes: Array<{ theme: string; spend: number; leads: number; cpl: number | null; rows: number }>;
  findings: MetaAdsFinding[];
  budgetRecommendations: MetaAdsRecommendation[];
  warnings: string[];
};

type CsvRecord = Record<string, string>;

const CAMPAIGN_KEYS = ["campaign name", "campaign", "campanha", "nome da campanha"];
const AD_SET_KEYS = ["ad set name", "adset name", "ad set", "conjunto de anuncios", "conjunto de anuncios nome", "conjunto"];
const AD_KEYS = ["ad name", "ad", "anuncio", "nome do anuncio"];
const CREATIVE_KEYS = ["creative name", "creative", "criativo", "nome do criativo"];
const AUDIENCE_KEYS = ["audience", "publico", "publico alvo", "audiencia", "targeting"];
const SPEND_KEYS = ["amount spent", "amount spent brl", "spend", "valor usado", "valor gasto", "gasto"];
const IMPRESSION_KEYS = ["impressions", "impressoes", "impressoes totais"];
const CLICK_KEYS = ["link clicks", "clicks", "cliques", "cliques no link"];
const LEAD_KEYS = ["leads", "results", "resultados", "cadastros", "conversoes", "conversions"];
const CPM_KEYS = ["cpm", "cost per 1,000 impressions", "custo por 1.000 impressoes"];
const CPC_KEYS = ["cpc", "cost per click", "cost per link click", "custo por clique"];
const CTR_KEYS = ["ctr", "link ctr", "ctr link", "taxa de cliques"];
const CPL_KEYS = ["cost per lead", "cpl", "custo por lead", "custo por resultado"];

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getField(record: CsvRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[normalizeHeader(key)];
    if (cleanText(value)) return cleanText(value);
  }
  return "";
}

function parseNumber(value?: string | null) {
  const raw = cleanText(value).replace(/[%R$€$£\s]/g, "");
  if (!raw || raw === "-" || raw.toLowerCase() === "nan") return 0;

  const decimalComma = /,\d{1,4}$/.test(raw);
  const dotThousands = /^\d{1,3}(\.\d{3})+$/.test(raw);
  const normalized = decimalComma
    ? raw.replace(/\./g, "").replace(",", ".")
    : dotThousands
      ? raw.replace(/\./g, "")
    : raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => cleanText(line));
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<CsvRecord>((record, header, index) => {
      if (header) record[header] = cells[index] || "";
      return record;
    }, {});
  });
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function metricTotals(rows: MetaAdsMetricRow[]): MetaAdsTotals {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const leads = rows.reduce((sum, row) => sum + row.leads, 0);

  return {
    spend: round(spend),
    impressions,
    clicks,
    leads,
    cpm: round(safeDivide(spend, impressions) * 1000),
    cpc: round(safeDivide(spend, clicks)),
    ctr: round(safeDivide(clicks, impressions) * 100),
    cpl: leads > 0 ? round(spend / leads) : null,
  };
}

function rowScore(row: MetaAdsMetricRow, avgCpl: number | null) {
  const cplScore = row.cpl && avgCpl ? avgCpl / row.cpl : row.leads > 0 ? 1 : 0;
  return row.leads * 4 + row.ctr + cplScore * 3 - row.cpc * 0.1;
}

function inferTheme(text: string, fallback: string) {
  const key = normalizeHeader(text);
  if (!key) return fallback;
  if (/video|reels|short|ugc|depoimento/.test(key)) return "video/depoimento";
  if (/ebook|guia|material|checklist|pdf/.test(key)) return "material rico";
  if (/consulta|diagnostico|avaliacao|call/.test(key)) return "consulta/diagnostico";
  if (/preco|oferta|promocao|desconto/.test(key)) return "oferta/preco";
  if (/dor|problema|erro|risco|alerta|medo/.test(key)) return "dor/risco";
  if (/beneficio|resultado|crescimento|escala/.test(key)) return "beneficio/resultado";
  return cleanText(text).split(/[|\-_/]/)[0]?.trim().slice(0, 42) || fallback;
}

function groupThemes(rows: MetaAdsMetricRow[], pickText: (row: MetaAdsMetricRow) => string) {
  const groups = new Map<string, MetaAdsMetricRow[]>();
  for (const row of rows) {
    const theme = inferTheme(pickText(row), "sem tema");
    groups.set(theme, [...(groups.get(theme) || []), row]);
  }

  return Array.from(groups.entries())
    .map(([theme, groupRows]) => {
      const totals = metricTotals(groupRows);
      return { theme, spend: totals.spend, leads: totals.leads, cpl: totals.cpl, rows: groupRows.length };
    })
    .sort((a, b) => b.leads - a.leads || a.spend - b.spend || a.theme.localeCompare(b.theme));
}

function normalizeRow(record: CsvRecord): MetaAdsMetricRow {
  const spend = parseNumber(getField(record, SPEND_KEYS));
  const impressions = Math.round(parseNumber(getField(record, IMPRESSION_KEYS)));
  const clicks = Math.round(parseNumber(getField(record, CLICK_KEYS)));
  const leads = Math.round(parseNumber(getField(record, LEAD_KEYS)));
  const importedCpm = parseNumber(getField(record, CPM_KEYS));
  const importedCpc = parseNumber(getField(record, CPC_KEYS));
  const importedCtr = parseNumber(getField(record, CTR_KEYS));
  const importedCpl = parseNumber(getField(record, CPL_KEYS));

  return {
    campaignName: getField(record, CAMPAIGN_KEYS) || "Campanha sem nome",
    adSetName: getField(record, AD_SET_KEYS),
    adName: getField(record, AD_KEYS),
    creativeName: getField(record, CREATIVE_KEYS),
    audienceName: getField(record, AUDIENCE_KEYS),
    spend: round(spend),
    impressions,
    clicks,
    leads,
    cpm: importedCpm || round(safeDivide(spend, impressions) * 1000),
    cpc: importedCpc || round(safeDivide(spend, clicks)),
    ctr: importedCtr || round(safeDivide(clicks, impressions) * 100),
    cpl: leads > 0 ? round(importedCpl || spend / leads) : null,
  };
}

export function parseMetaAdsCsv(text: string): MetaAdsMetricRow[] {
  return parseCsv(text)
    .map(normalizeRow)
    .filter((row) => row.spend > 0 || row.impressions > 0 || row.clicks > 0 || row.leads > 0);
}

export function analyzeMetaAdsCsv(text: string): MetaAdsAnalysis {
  const rows = parseMetaAdsCsv(text);
  const totals = metricTotals(rows);
  const warnings: string[] = [];

  if (!cleanText(text)) warnings.push("Cole o CSV exportado do Meta Ads para iniciar a analise.");
  if (cleanText(text) && rows.length === 0) warnings.push("Nao encontrei linhas validas com gasto, impressoes, cliques ou leads.");
  if (rows.some((row) => row.leads === 0 && row.spend > 0)) warnings.push("Existem anuncios com gasto e zero leads.");

  const avgCpl = totals.cpl;
  const winners = rows
    .filter((row) => row.leads > 0 && (avgCpl === null || (row.cpl || 0) <= avgCpl) && row.ctr >= Math.max(0.8, totals.ctr * 0.8))
    .sort((a, b) => rowScore(b, avgCpl) - rowScore(a, avgCpl) || a.campaignName.localeCompare(b.campaignName))
    .slice(0, 5);
  const wastedSpend = rows
    .filter((row) => row.spend > 0 && row.leads === 0)
    .sort((a, b) => b.spend - a.spend || a.campaignName.localeCompare(b.campaignName))
    .slice(0, 5);

  const findings: MetaAdsFinding[] = [];
  if (totals.leads > 0) {
    findings.push({ severity: "good", title: "CPL consolidado", detail: `CPL medio de R$ ${totals.cpl} com ${totals.leads} leads.` });
  } else if (totals.spend > 0) {
    findings.push({ severity: "critical", title: "Sem leads", detail: `R$ ${totals.spend} gastos sem leads registrados.` });
  }
  if (totals.ctr < 1 && totals.impressions > 0) {
    findings.push({ severity: "warning", title: "CTR baixo", detail: `CTR de ${totals.ctr}% sugere criativo, promessa ou publico pouco aderente.` });
  }
  if (totals.cpc > 5) {
    findings.push({ severity: "warning", title: "CPC pressionado", detail: `CPC medio de R$ ${totals.cpc}; revise criativos e segmentacao antes de escalar.` });
  }
  if (totals.cpm > 60) {
    findings.push({ severity: "warning", title: "CPM alto", detail: `CPM medio de R$ ${totals.cpm}; pode indicar publico competitivo ou saturacao.` });
  }
  if (wastedSpend.length) {
    const wastedTotal = metricTotals(wastedSpend).spend;
    findings.push({ severity: "critical", title: "Gasto desperdicado", detail: `R$ ${wastedTotal} concentrados em anuncios sem leads.` });
  }
  if (winners.length) {
    findings.push({ severity: "good", title: "Vencedores detectados", detail: `${winners.length} linha(s) com CPL competitivo e CTR saudavel.` });
  }

  const budgetRecommendations: MetaAdsRecommendation[] = [];
  for (const winner of winners.slice(0, 3)) {
    budgetRecommendations.push({
      action: "scale",
      title: `Escalar ${winner.adName || winner.campaignName}`,
      detail: `Aumentar verba gradualmente enquanto CPL (${winner.cpl ? `R$ ${winner.cpl}` : "sem CPL"}) e CTR (${winner.ctr}%) se mantiverem estaveis.`,
    });
  }
  for (const row of wastedSpend.slice(0, 3)) {
    budgetRecommendations.push({
      action: "pause",
      title: `Pausar ou refazer ${row.adName || row.campaignName}`,
      detail: `Consumiu R$ ${row.spend} sem leads; revisar oferta, publico e criativo antes de retomar.`,
    });
  }
  if (rows.length > 0 && winners.length === 0) {
    budgetRecommendations.push({
      action: "test",
      title: "Criar novo teste controlado",
      detail: "Separar 10-20% da verba para testar uma nova promessa, publico e formato de criativo.",
    });
  }
  if (rows.length > 0) {
    budgetRecommendations.push({
      action: "monitor",
      title: "Monitorar por janela minima",
      detail: "Evitar decisoes por poucas impressoes; comparar anuncios por CPL, CTR e gasto suficiente.",
    });
  }

  return {
    rows,
    totals,
    benchmarks: {
      avgCpl,
      avgCtr: totals.ctr,
      avgCpc: totals.cpc,
      avgCpm: totals.cpm,
    },
    winners,
    wastedSpend,
    creativeThemes: groupThemes(rows, (row) => row.creativeName || row.adName || row.campaignName),
    audienceThemes: groupThemes(rows, (row) => row.audienceName || row.adSetName || row.campaignName),
    findings,
    budgetRecommendations,
    warnings,
  };
}
