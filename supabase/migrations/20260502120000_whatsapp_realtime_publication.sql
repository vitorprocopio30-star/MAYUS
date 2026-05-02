-- Enable Supabase Realtime for WhatsApp conversations.
-- Without this, postgres_changes subscriptions silently receive no events,
-- causing conversations to appear only after a manual page reload.

-- The send route stores audio metadata on whatsapp_messages; keep the schema
-- aligned for environments that were created before that field existed.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- REPLICA IDENTITY FULL makes UPDATE events include enough row data for the UI.
ALTER TABLE public.whatsapp_contacts REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_evolution_message_id
  ON public.whatsapp_messages (tenant_id, message_id_from_evolution)
  WHERE message_id_from_evolution IS NOT NULL AND message_id_from_evolution <> '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'whatsapp_contacts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contacts;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'whatsapp_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
    END IF;
  END IF;
END $$;
