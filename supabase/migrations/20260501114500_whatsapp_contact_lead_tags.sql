-- Editable lead tags for WhatsApp contacts.
ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS lead_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_lead_tags
  ON public.whatsapp_contacts USING gin (lead_tags);
