import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

let cachedEnvFile: Record<string, string> | null = null;

type LoginThroughUiOptions = {
  browserProfileMode?: "real" | "ui-harness";
  credentials?: PlaywrightCredentials;
};

export type PlaywrightCredentials = {
  email: string;
  password: string;
  available: boolean;
};

function loadLocalEnvFile() {
  if (cachedEnvFile) return cachedEnvFile;

  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    cachedEnvFile = {};
    return cachedEnvFile;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  cachedEnvFile = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );

  return cachedEnvFile;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getPlaywrightRuntimeConfig() {
  const localEnv = loadLocalEnvFile();

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || localEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
    siteUrl:
      process.env.PLAYWRIGHT_BASE_URL?.trim()
      || process.env.NEXT_PUBLIC_SITE_URL?.trim()
      || localEnv.NEXT_PUBLIC_SITE_URL?.trim()
      || "http://localhost:3000",
  };
}

function credentialsFromEnv(params: { emailKey: string; passwordKey: string }): PlaywrightCredentials {
  const localEnv = loadLocalEnvFile();
  const email = process.env[params.emailKey]?.trim() || localEnv[params.emailKey]?.trim() || "";
  const password = process.env[params.passwordKey]?.trim() || localEnv[params.passwordKey]?.trim() || "";

  return {
    email,
    password,
    available: Boolean(email && password),
  };
}

export function getPlaywrightCredentials() {
  return credentialsFromEnv({
    emailKey: "PLAYWRIGHT_EMAIL",
    passwordKey: "PLAYWRIGHT_PASSWORD",
  });
}

export function getPlaywrightSuperadminCredentials() {
  return credentialsFromEnv({
    emailKey: "PLAYWRIGHT_SUPERADMIN_EMAIL",
    passwordKey: "PLAYWRIGHT_SUPERADMIN_PASSWORD",
  });
}

function buildProfileFromSessionUser(user: any) {
  const metadata = {
    ...(user?.user_metadata || {}),
    ...(user?.app_metadata || {}),
  };

  return {
    id: user.id,
    tenant_id: metadata.tenant_id || metadata.tenantId || "playwright-tenant",
    full_name: metadata.full_name || metadata.name || metadata.email || "Playwright E2E",
    role: metadata.role || "admin",
    is_active: true,
    avatar_url: metadata.avatar_url || null,
    custom_permissions: Array.isArray(metadata.custom_permissions) ? metadata.custom_permissions : [],
    email_corporativo: metadata.email_corporativo || user.email || null,
    oab_registro: metadata.oab_registro || null,
    is_superadmin: Boolean(metadata.is_superadmin),
  };
}

async function installUiHarnessBrowserProfile(page: Page, runtime: ReturnType<typeof getPlaywrightRuntimeConfig>, session: any) {
  const supabaseOrigin = new URL(runtime.supabaseUrl).origin;
  const profile = buildProfileFromSessionUser(session.user);

  await page.route(`${supabaseOrigin}/auth/v1/user**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session.user),
    });
  });

  await page.route(`${supabaseOrigin}/rest/v1/profiles**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.pgrst.object+json",
      body: JSON.stringify(profile),
    });
  });
}

export async function loginThroughUi(page: Page, options: LoginThroughUiOptions = {}) {
  const credentials = options.credentials || getPlaywrightCredentials();
  const runtime = getPlaywrightRuntimeConfig();

  if (!credentials.available) {
    throw new Error("Credenciais Playwright nao configuradas.");
  }

  if (!runtime.supabaseUrl || !runtime.anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY sao obrigatorios para o bootstrap E2E.");
  }

  const supabase = createClient(runtime.supabaseUrl, runtime.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    throw new Error(`Falha no bootstrap auth E2E: ${error.message}`);
  }

  if (!data.session) {
    throw new Error("O bootstrap auth E2E nao retornou sessao valida.");
  }

  if (options.browserProfileMode === "ui-harness") {
    await installUiHarnessBrowserProfile(page, runtime, data.session);
  }

  const projectRef = new URL(runtime.supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionPayload = {
    ...data.session,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
  };
  const encodedSession = `base64-${toBase64Url(JSON.stringify(sessionPayload))}`;

  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: storageKey,
      value: encodedSession,
      url: runtime.siteUrl,
      sameSite: "Lax",
      httpOnly: false,
      secure: runtime.siteUrl.startsWith("https://"),
      expires: Math.floor(Date.now() / 1000) + data.session.expires_in,
    },
  ]);

  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, session: sessionPayload }
  );

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard(?:\/)?$/);
}
