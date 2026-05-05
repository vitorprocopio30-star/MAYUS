-- WhatsApp contact labels and media metadata.

ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS label_color text DEFAULT '#CCA761';

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_provider text,
  ADD COLUMN IF NOT EXISTS media_processing_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS media_text text,
  ADD COLUMN IF NOT EXISTS media_summary text;

UPDATE public.whatsapp_messages
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_media_processing_status_check;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_media_processing_status_check
  CHECK (media_processing_status IN ('none', 'pending', 'processed', 'unsupported', 'failed'));

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_label
  ON public.whatsapp_contacts(tenant_id, label)
  WHERE label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_status
  ON public.whatsapp_messages(tenant_id, media_processing_status, created_at DESC);

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  ARRAY[
    'audio/*',
    'image/*',
    'video/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_provider_message_id
  ON public.whatsapp_messages(tenant_id, message_id_from_evolution)
  WHERE message_id_from_evolution IS NOT NULL;

DROP POLICY IF EXISTS "Tenant members read WhatsApp media" ON storage.objects;
CREATE POLICY "Tenant members read WhatsApp media" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "Tenant members upload WhatsApp media" ON storage.objects;
CREATE POLICY "Tenant members upload WhatsApp media" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "Tenant members update WhatsApp media" ON storage.objects;
CREATE POLICY "Tenant members update WhatsApp media" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id::text = split_part(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id::text = split_part(name, '/', 1)
    )
  );
