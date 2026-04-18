CREATE TABLE IF NOT EXISTS public.tenant_legal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  office_display_name text,
  default_font_family text NOT NULL DEFAULT 'Arial Narrow',
  body_font_size numeric(4,1) NOT NULL DEFAULT 11.5,
  title_font_size numeric(4,1) NOT NULL DEFAULT 12.0,
  paragraph_spacing integer NOT NULL DEFAULT 120,
  line_spacing numeric(3,1) NOT NULL DEFAULT 1.0,
  text_alignment text NOT NULL DEFAULT 'justified',
  margin_top integer NOT NULL DEFAULT 1699,
  margin_right integer NOT NULL DEFAULT 1699,
  margin_bottom integer NOT NULL DEFAULT 1281,
  margin_left integer NOT NULL DEFAULT 1699,
  default_tone text NOT NULL DEFAULT 'tecnico_persuasivo',
  citation_style text NOT NULL DEFAULT 'tribunal_numero_data_link',
  signature_block text,
  use_page_numbers boolean NOT NULL DEFAULT true,
  use_header boolean NOT NULL DEFAULT true,
  use_footer boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_legal_profiles_tenant_unique UNIQUE (tenant_id)
);

ALTER TABLE public.tenant_legal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view legal profiles from their tenant" ON public.tenant_legal_profiles;
DROP POLICY IF EXISTS "Admins can manage legal profiles from their tenant" ON public.tenant_legal_profiles;

CREATE POLICY "Users can view legal profiles from their tenant" ON public.tenant_legal_profiles
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage legal profiles from their tenant" ON public.tenant_legal_profiles
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'socio', 'Administrador', 'Sócio')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'socio', 'Administrador', 'Sócio')
  );

DROP TRIGGER IF EXISTS tr_tenant_legal_profiles_updated_at ON public.tenant_legal_profiles;
CREATE TRIGGER tr_tenant_legal_profiles_updated_at
  BEFORE UPDATE ON public.tenant_legal_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.tenant_legal_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  file_url text,
  file_name text,
  mime_type text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_legal_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view legal assets from their tenant" ON public.tenant_legal_assets;
DROP POLICY IF EXISTS "Admins can manage legal assets from their tenant" ON public.tenant_legal_assets;

CREATE POLICY "Users can view legal assets from their tenant" ON public.tenant_legal_assets
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage legal assets from their tenant" ON public.tenant_legal_assets
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'socio', 'Administrador', 'Sócio')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'socio', 'Administrador', 'Sócio')
  );

DROP TRIGGER IF EXISTS tr_tenant_legal_assets_updated_at ON public.tenant_legal_assets;
CREATE TRIGGER tr_tenant_legal_assets_updated_at
  BEFORE UPDATE ON public.tenant_legal_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_legal_assets_active_type
  ON public.tenant_legal_assets (tenant_id, asset_type)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.tenant_legal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  piece_type text NOT NULL,
  template_mode text NOT NULL DEFAULT 'visual_profile',
  template_docx_url text,
  template_name text,
  structure_markdown text,
  guidance_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_legal_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view legal templates from their tenant" ON public.tenant_legal_templates;
DROP POLICY IF EXISTS "Admins can manage legal templates from their tenant" ON public.tenant_legal_templates;

CREATE POLICY "Users can view legal templates from their tenant" ON public.tenant_legal_templates
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage legal templates from their tenant" ON public.tenant_legal_templates
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'socio', 'Administrador', 'Sócio')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'socio', 'Administrador', 'Sócio')
  );

DROP TRIGGER IF EXISTS tr_tenant_legal_templates_updated_at ON public.tenant_legal_templates;
CREATE TRIGGER tr_tenant_legal_templates_updated_at
  BEFORE UPDATE ON public.tenant_legal_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_legal_templates_active_piece
  ON public.tenant_legal_templates (tenant_id, piece_type)
  WHERE is_active = true;
