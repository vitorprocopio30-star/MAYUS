export type BillingEntities = Record<string, string>;

export type BillingNormalizationResult = {
  entities: BillingEntities;
  errors: string[];
  defaultedFields: string[];
};

const BILLING_CAPABILITY_NAMES = new Set(["billing_create", "asaas_cobrar"]);
const VALID_BILLING_TYPES = new Set(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function todaySaoPaulo(date = new Date()) {
  const parts = localDateParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseYmd(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

function formatYmd(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  const br = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return trimmed;
}

export function addBusinessDaysFromSaoPaulo(days: number, now = new Date()) {
  const parts = localDateParts(now);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return formatYmd(date);
}

function normalizeAmount(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const numeric = Number(raw.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(numeric);
}

function normalizeBillingType(value: string | undefined) {
  const raw = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (!raw) return null;
  const normalized =
    raw.includes("PIX") ? "PIX" :
    raw.includes("BOLETO") ? "BOLETO" :
    raw.includes("CARTAO") || raw.includes("CREDIT") ? "CREDIT_CARD" :
    raw;
  return VALID_BILLING_TYPES.has(normalized) ? normalized : null;
}

export function isBillingCapability(name?: string | null, handlerType?: string | null) {
  return BILLING_CAPABILITY_NAMES.has(String(name || "")) || handlerType === "asaas_cobrar";
}

export function normalizeBillingEntities(
  input: Record<string, unknown>,
  options: { now?: Date; defaultDueDate?: boolean } = {}
): BillingNormalizationResult {
  const errors: string[] = [];
  const defaultedFields: string[] = [];
  const entities: BillingEntities = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value).trim()])
      .filter(([, value]) => value.length > 0)
  );

  if (!entities.nome_cliente) {
    entities.nome_cliente = entities.client_name || entities.lead_name || entities.contact_name || entities.name || "";
    if (!entities.nome_cliente) delete entities.nome_cliente;
  }

  if (!entities.valor) {
    const amountAlias = entities.amount || entities.value || entities.total_value || entities.entry_value;
    if (amountAlias) entities.valor = amountAlias;
  }

  if (entities.valor) {
    const normalizedAmount = normalizeAmount(entities.valor);
    if (!normalizedAmount) {
      errors.push("Valor da cobranca precisa ser positivo.");
    } else {
      entities.valor = normalizedAmount;
    }
  }

  if (entities.billing_type) {
    const normalizedType = normalizeBillingType(entities.billing_type);
    if (!normalizedType) {
      errors.push("Tipo de cobranca invalido.");
    } else {
      entities.billing_type = normalizedType;
    }
  } else {
    entities.billing_type = "UNDEFINED";
    defaultedFields.push("billing_type");
  }

  if (entities.vencimento) {
    entities.vencimento = normalizeDateValue(entities.vencimento);
  } else if (options.defaultDueDate !== false) {
    entities.vencimento = addBusinessDaysFromSaoPaulo(3, options.now);
    defaultedFields.push("vencimento");
  }

  if (entities.vencimento) {
    const dueDate = parseYmd(entities.vencimento);
    const today = todaySaoPaulo(options.now);
    if (!dueDate) {
      errors.push("Data de vencimento invalida. Use YYYY-MM-DD.");
    } else if (entities.vencimento <= today) {
      errors.push("Data de vencimento precisa ser futura e nao pode ser hoje.");
    }
  }

  return { entities, errors, defaultedFields };
}

export function buildBillingIdempotencyKey(input: {
  tenantId: string;
  clientKey: string | null | undefined;
  amount: number;
  dueDate: string;
  originKey?: string | null;
}) {
  const client = String(input.clientKey || "unknown-client").trim().toLowerCase();
  const origin = String(input.originKey || "chat").trim().toLowerCase();
  return [
    "asaas_billing",
    input.tenantId,
    client,
    input.amount.toFixed(2),
    input.dueDate,
    origin,
  ].join(":");
}
