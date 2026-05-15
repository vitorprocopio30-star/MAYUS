import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

async function main() {
  const env = loadEnvFile(envPath);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }

  const email = "playwright.e2e@mayus.local";
  const password = "MayusE2E!2026";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: processTaskSeed, error: processTaskError } = await supabase
    .from("process_tasks")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();

  if (processTaskError) throw processTaskError;

  let tenantId = processTaskSeed?.tenant_id ?? null;

  if (!tenantId) {
    const { data: tenantSeed, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (tenantError) throw tenantError;
    tenantId = tenantSeed?.id ?? null;
  }

  if (!tenantId) {
    throw new Error("Nenhum tenant encontrado para vincular o usuario E2E.");
  }

  const { data: listedUsers, error: listUsersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listUsersError) throw listUsersError;

  const existingUser = listedUsers.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;

  let userId = existingUser?.id ?? null;

  if (!existingUser) {
    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        tenant_id: tenantId,
        role: "admin",
        custom_permissions: ["ALL"],
      },
      user_metadata: {
        full_name: "Playwright E2E",
      },
    });

    if (createUserError) throw createUserError;
    userId = createdUser.user?.id ?? null;
  } else {
    const { data: updatedUser, error: updateUserError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      app_metadata: {
        ...(existingUser.app_metadata || {}),
        tenant_id: tenantId,
        role: "admin",
        custom_permissions: ["ALL"],
      },
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: "Playwright E2E",
      },
    });

    if (updateUserError) throw updateUserError;
    userId = updatedUser.user?.id ?? existingUser.id;
  }

  if (!userId) {
    throw new Error("Nao foi possivel obter o id do usuario E2E.");
  }

  const { error: upsertProfileError } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      tenant_id: tenantId,
      full_name: "Playwright E2E",
      role: "admin",
      is_active: true,
    });

  if (upsertProfileError) throw upsertProfileError;

  console.log(JSON.stringify({ ok: true, email, tenantId, userId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
