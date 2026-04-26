ALTER FUNCTION public.handle_tenant_settings_updated_at() SET search_path = public;

ALTER FUNCTION public.handle_brain_updated_at() SET search_path = public;

ALTER FUNCTION public.handle_process_document_memory_updated_at() SET search_path = public;

ALTER FUNCTION public.handle_process_documents_updated_at() SET search_path = public;

ALTER FUNCTION public.handle_process_draft_versions_updated_at() SET search_path = public;

ALTER FUNCTION public.create_process_draft_version_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, uuid) SET search_path = public;

ALTER FUNCTION public.transition_process_draft_version_atomic(uuid, uuid, uuid, text, uuid) SET search_path = public;
