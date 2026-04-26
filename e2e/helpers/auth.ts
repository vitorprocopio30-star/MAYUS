import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

let cachedEnvFile: Record<string, string> | null = null;

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

export function getPlaywrightCredentials() {
  const localEnv = loadLocalEnvFile();
  const email = process.env.PLAYWRIGHT_EMAIL?.trim() || localEnv.PLAYWRIGHT_EMAIL?.trim() || "";
  const password = process.env.PLAYWRIGHT_PASSWORD?.trim() || localEnv.PLAYWRIGHT_PASSWORD?.trim() || "";

  return {
    email,
    password,
    available: Boolean(email && password),
  };
}

export async function loginThroughUi(page: Page) {
  const credentials = getPlaywrightCredentials();
  const runtime = getPlaywrightRuntimeConfig();

  if (!credentials.available) {
    throw new Error("Credenciais PLAYWRIGHT_EMAIL/PLAYWRIGHT_PASSWORD nao configuradas.");
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
