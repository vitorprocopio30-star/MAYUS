-- Create tenant_goals table
CREATE TABLE IF NOT EXISTS public.tenant_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('VALOR', 'CONTRATOS')),
    target_value NUMERIC NOT NULL,
    period TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.tenant_goals ENABLE ROW LEVEL SECURITY;

-- Policies for tenant_goals
CREATE POLICY "Users can view goals from their tenant" ON public.tenant_goals FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can insert goals for their tenant" ON public.tenant_goals FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can update goals from their tenant" ON public.tenant_goals FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can delete goals from their tenant" ON public.tenant_goals FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- Add department_id to tasks
ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.process_tasks ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
