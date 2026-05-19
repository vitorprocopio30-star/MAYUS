import { existsSync, readFileSync } from "node:fs";

const DEFAULT_ROUTINES_URL = "https://mayus-premium-pro.vercel.app/api/agent/routines";
const DEFAULT_LIMIT = 1;

type JsonObject = Record<string, unknown>;

function loadLocalEnv() {
  const path = ".env.local";
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function getArgValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function normalizeLimit(value: string | undefined) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), 25);
}

function sanitizeText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value : String(value ?? fallback);
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(service[_-]?role|secret|token|api[_-]?key|authorization)(["'\s:=]+)[^"',\s}]+/gi, "$1$2[redacted]")
    .trim()
    .slice(0, 360);
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function pickSummary(responseBody: unknown) {
  const body = asObject(responseBody);
  const summary = asObject(body.summary);
  return {
    mode: typeof body.mode === "string" ? body.mode : null,
    ok: typeof body.ok === "boolean" ? body.ok : null,
    dryRun: typeof body.dryRun === "boolean" ? body.dryRun : null,
    force: typeof body.force === "boolean" ? body.force : null,
    limit: typeof body.limit === "number" ? body.limit : null,
    message: typeof body.message === "string" ? sanitizeText(body.message) : null,
    summary: Object.fromEntries(
      Object.entries(summary).filter(([, value]) => (
        typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value === null
      )),
    ),
  };
}

function safeUrlLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return sanitizeText(url);
  }
}

async function main() {
  loadLocalEnv();

  const endpoint =
    getArgValue("--url") ||
    process.env.MAYUS_AGENT_ROUTINES_URL ||
    process.env.AGENT_ROUTINES_URL ||
    DEFAULT_ROUTINES_URL;
  const cronSecret = process.env.AGENT_ROUTINES_CRON_SECRET || process.env.CRON_SECRET;
  const limit = normalizeLimit(getArgValue("--limit"));
  const force = hasArg("--force");
  const dryRun = !hasArg("--live");

  if (!cronSecret) {
    throw new Error("CRON_SECRET ou AGENT_ROUTINES_CRON_SECRET e obrigatorio para verificar o scheduler.");
  }

  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "content-type": "application/json",
      "user-agent": "mayus-agent-routines-verifier",
    },
    body: JSON.stringify({
      limit,
      dryRun,
      ...(force ? { force: true } : {}),
    }),
  });

  const rawBody = await response.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = null;
  }

  const body = asObject(parsedBody);
  const routeOk = typeof body.ok === "boolean" ? body.ok : response.ok;
  const deploymentHint = response.status === 404
    ? "route_not_deployed_or_wrong_endpoint"
    : response.status === 401 || response.status === 403
      ? "cron_secret_rejected"
      : null;
  const result = {
    ok: response.ok && routeOk !== false,
    endpoint: safeUrlLabel(endpoint),
    request: { dryRun, force, limit },
    http_status: response.status,
    authorized: response.status !== 401 && response.status !== 403,
    deployment_hint: deploymentHint,
    scheduler: pickSummary(parsedBody),
    duration_ms: Date.now() - startedAt,
    error: response.ok
      ? null
      : deploymentHint === "route_not_deployed_or_wrong_endpoint"
        ? "Rota nao encontrada no endpoint publico informado. O codigo local provavelmente ainda nao foi deployado nesse alias."
        : sanitizeText(body.error || rawBody || response.statusText),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    fatal: sanitizeText(error?.message || error, "scheduler_verification_failed"),
  }, null, 2));
  process.exitCode = 1;
});
