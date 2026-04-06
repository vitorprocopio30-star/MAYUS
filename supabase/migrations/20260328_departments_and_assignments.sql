-- ==============================================================================
-- 🏢 MAYUS DEPARTMENTS & CHAT ASSIGNMENTS
-- Tabela de departamentos + campos de atribuição nos contatos WhatsApp
-- ==============================================================================

-- 1. TABELA DE DEPARTAMENTOS
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#CCA761',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- 2. ADICIONAR CAMPOS em whatsapp_contacts
ALTER TABLE public.whatsapp_contacts 
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3. RLS (Row Level Security)
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do tenant veem departamentos"
  ON public.departments FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'tenant_id')::uuid = tenant_id);

CREATE POLICY "Service role gerencia departamentos"
  ON public.departments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role atualiza departamentos"
  ON public.departments FOR UPDATE
  USING (true);

CREATE POLICY "Service role deleta departamentos"
  ON public.departments FOR DELETE
  USING (true);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON public.departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_assigned ON public.whatsapp_contacts(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_department ON public.whatsapp_contacts(department_id);
