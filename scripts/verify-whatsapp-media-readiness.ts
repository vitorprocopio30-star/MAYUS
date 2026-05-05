import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const path = ".env.local";
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const messageColumns = [
    "metadata",
    "media_mime_type",
    "media_filename",
    "media_size_bytes",
    "media_storage_path",
    "media_provider",
    "media_processing_status",
    "media_text",
    "media_summary",
  ];

  const { error: messageSchemaError } = await supabase
    .from("whatsapp_messages")
    .select(messageColumns.join(","))
    .limit(1);

  const { error: contactSchemaError } = await supabase
    .from("whatsapp_contacts")
    .select("label,label_color")
    .limit(1);

  const { data: bucket, error: bucketError } = await supabase.storage.getBucket("whatsapp-media");

  const { count: pendingCount, error: pendingError } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("media_processing_status", "pending");

  const result = {
    ok: !messageSchemaError && !contactSchemaError && !bucketError && Boolean(bucket) && bucket?.public === false && !pendingError,
    checks: {
      whatsapp_messages_media_columns: !messageSchemaError,
      whatsapp_contacts_label_columns: !contactSchemaError,
      whatsapp_media_bucket_exists: Boolean(bucket) && !bucketError,
      whatsapp_media_bucket_private: bucket?.public === false,
      pending_media_query: !pendingError,
    },
    pending_count: pendingCount ?? null,
    errors: [
      messageSchemaError?.message,
      contactSchemaError?.message,
      bucketError?.message,
      pendingError?.message,
    ].filter(Boolean),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, fatal: error?.message || String(error) }, null, 2));
  process.exit(1);
});
