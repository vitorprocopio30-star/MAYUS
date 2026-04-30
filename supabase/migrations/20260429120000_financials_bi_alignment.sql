ALTER TABLE public.financials
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reference_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_tenant_source_external
  ON public.financials (tenant_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financials_tenant_type_reference
  ON public.financials (tenant_id, type, reference_date DESC);
