-- ==============================================================================
-- 🚀 MAYUS WHATSAPP CHAT SCHEMA (Evolution API Integration)
-- ==============================================================================

-- 1. WHATSAPP CONTACTS (Leads/Clientes)
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL, -- Format: 551199999999@s.whatsapp.net ou 551199999999
    name TEXT,
    profile_pic_url TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(tenant_id, phone_number)
);

-- 2. WHATSAPP MESSAGES (Histórico Completo)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')), -- 'inbound' = recebida do cliente, 'outbound' = enviada pelo MAYUS
    message_type TEXT DEFAULT 'text', -- 'text', 'image', 'audio', 'document', 'video'
    content TEXT, -- The actual text message or caption
    media_url TEXT, -- If it's a media message
    message_id_from_evolution TEXT, -- Optional ID from the API to avoid duplicates
    status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed' (for outbound)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- POLICIES (Users só podem ver conversas do seu próprio tenant)
CREATE POLICY "Users can view contacts of their tenant"
    ON public.whatsapp_contacts FOR SELECT
    USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert contacts for their tenant"
    ON public.whatsapp_contacts FOR INSERT
    WITH CHECK (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update contacts of their tenant"
    ON public.whatsapp_contacts FOR UPDATE
    USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can view messages of their tenant"
    ON public.whatsapp_messages FOR SELECT
    USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert messages for their tenant"
    ON public.whatsapp_messages FOR INSERT
    WITH CHECK (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update messages of their tenant"
    ON public.whatsapp_messages FOR UPDATE
    USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- INDEXES para velocidade astronômica nas queries do chat
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_tenant ON public.whatsapp_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact ON public.whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);
