CREATE TABLE IF NOT EXISTS public.process_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  process_task_id uuid NOT NULL REFERENCES public.process_tasks(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  drive_folder_id text,
  folder_label text,
  name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  modified_at timestamptz,
  web_view_link text,
  document_type text,
  classification_status text NOT NULL DEFAULT 'pending',
  extraction_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_documents_drive_file_unique UNIQUE (drive_file_id)
);

ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view process documents from their tenant" ON public.process_documents;
DROP POLICY IF EXISTS "Users can insert process documents from their tenant" ON public.process_documents;
DROP POLICY IF EXISTS "Users can update process documents from their tenant" ON public.process_documents;
DROP POLICY IF EXISTS "Users can delete process documents from their tenant" ON public.process_documents;

CREATE POLICY "Users can view process documents from their tenant" ON public.process_documents
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert process documents from their tenant" ON public.process_documents
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update process documents from their tenant" ON public.process_documents
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete process documents from their tenant" ON public.process_documents
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_process_documents_tenant_id ON public.process_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_process_task_id ON public.process_documents(process_task_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_document_type ON public.process_documents(document_type);

CREATE TABLE IF NOT EXISTS public.process_document_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  process_document_id uuid NOT NULL REFERENCES public.process_documents(id) ON DELETE CASCADE,
  raw_text text,
  normalized_text text,
  excerpt text,
  page_count integer,
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_at timestamptz,
  extraction_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_document_contents_document_unique UNIQUE (process_document_id)
);

ALTER TABLE public.process_document_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view process document contents from their tenant" ON public.process_document_contents;
DROP POLICY IF EXISTS "Users can insert process document contents from their tenant" ON public.process_document_contents;
DROP POLICY IF EXISTS "Users can update process document contents from their tenant" ON public.process_document_contents;
DROP POLICY IF EXISTS "Users can delete process document contents from their tenant" ON public.process_document_contents;

CREATE POLICY "Users can view process document contents from their tenant" ON public.process_document_contents
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert process document contents from their tenant" ON public.process_document_contents
  FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update process document contents from their tenant" ON public.process_document_contents
  FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete process document contents from their tenant" ON public.process_document_contents
  FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_process_document_contents_tenant_id ON public.process_document_contents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_document_contents_document_id ON public.process_document_contents(process_document_id);

CREATE OR REPLACE FUNCTION public.handle_process_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_process_documents_updated_at ON public.process_documents;
CREATE TRIGGER tr_process_documents_updated_at
  BEFORE UPDATE ON public.process_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_process_documents_updated_at();

DROP TRIGGER IF EXISTS tr_process_document_contents_updated_at ON public.process_document_contents;
CREATE TRIGGER tr_process_document_contents_updated_at
  BEFORE UPDATE ON public.process_document_contents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_process_documents_updated_at();
