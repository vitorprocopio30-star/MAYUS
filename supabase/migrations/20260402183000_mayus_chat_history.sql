-- ─── 1. TABELA DE CONVERSAS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mayus_conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'Nova Conversa',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.mayus_conversations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (Somente o dono da conversa acessa)
CREATE POLICY "Users can manage their own conversations" 
    ON public.mayus_conversations
    FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mayus_conv_user_tenant ON public.mayus_conversations(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_mayus_conv_updated_at ON public.mayus_conversations(updated_at DESC);

-- ─── 2. TABELA DE MENSAGENS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mayus_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.mayus_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'model', 'system', 'approval')),
    content         TEXT NOT NULL,
    kernel          JSONB DEFAULT '{}'::jsonb, -- Armazena auditLogId, awaitingPayload, etc.
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.mayus_messages ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (Acesso via conversa pai)
CREATE POLICY "Users can manage messages of their own conversations"
    ON public.mayus_messages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.mayus_conversations 
            WHERE id = mayus_messages.conversation_id 
            AND user_id = auth.uid()
        )
    );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mayus_msg_conversation_id ON public.mayus_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_mayus_msg_created_at ON public.mayus_messages(created_at ASC);

-- ─── 3. TRIGGERS ─────────────────────────────────────────────────────────────

-- A) Atualiza updated_at da conversa pai ao receber nova mensagem
CREATE OR REPLACE FUNCTION update_mayus_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.mayus_conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_conv_timestamp ON public.mayus_messages;
CREATE TRIGGER tr_update_conv_timestamp
    AFTER INSERT ON public.mayus_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_mayus_conversation_timestamp();

-- B) Atualiza updated_at da própria tabela de conversas em qualquer update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_mayus_conversations_updated_at ON public.mayus_conversations;
CREATE TRIGGER tr_mayus_conversations_updated_at
    BEFORE UPDATE ON public.mayus_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
