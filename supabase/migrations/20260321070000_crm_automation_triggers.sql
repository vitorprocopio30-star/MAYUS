-- ==============================================================================
-- 09_crm_automation_triggers.sql
-- Objetivo: Criar automações de Banco de Dados (Notificações e Logs LGPD)
-- ==============================================================================

-- 1. Auditar Movimentações do Kanban CRM (De Qual para Qual Estágio, Troca de Dono)
CREATE OR REPLACE FUNCTION public.log_crm_task_changes()
RETURNS trigger AS $$
DECLARE
  v_action text;
  v_old_stage_name text;
  v_new_stage_name text;
  v_admin_id uuid;
BEGIN
  -- Se for UPDATE (Movimentação, Edição ou Troca de Responsável)
  IF TG_OP = 'UPDATE' THEN
    -- A. Logar Troca de Responsável
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id, old_data, new_data)
      VALUES (NEW.tenant_id, auth.uid(), 'ASSIGNMENT_CHANGED', 'crm_tasks', NEW.id, jsonb_build_object('assigned_to', OLD.assigned_to), jsonb_build_object('assigned_to', NEW.assigned_to));
      
      -- Notificar o Novo Responsável (In-App Push)
      IF NEW.assigned_to IS NOT NULL THEN
        INSERT INTO public.notifications (tenant_id, user_id, title, message, type, link_url)
        VALUES (NEW.tenant_id, NEW.assigned_to, 'Novo Lead Atribuído', 'Você foi designado para a oportunidade: ' || NEW.title, 'info', '/dashboard/crm/' || NEW.pipeline_id);
      END IF;
    END IF;

    -- B. Logar Movimentação de Estágio (Kanban)
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
      -- Insere no Log de Movimentação (BI e Auditoria)
      INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id, old_data, new_data)
      VALUES (NEW.tenant_id, auth.uid(), 'STAGE_MOVED', 'crm_tasks', NEW.id, jsonb_build_object('stage_id', OLD.stage_id), jsonb_build_object('stage_id', NEW.stage_id));
      
      -- Verificar se o novo estágio é de FECHADO GANHO
      IF EXISTS (SELECT 1 FROM public.crm_stages WHERE id = NEW.stage_id AND is_win = true) THEN
        -- Pegar o Sócios/Admin para notificar
        FOR v_admin_id IN (SELECT id FROM public.profiles WHERE tenant_id = NEW.tenant_id AND role IN ('Administrador', 'Sócio')) LOOP
           INSERT INTO public.notifications (tenant_id, user_id, title, message, type, link_url)
           VALUES (NEW.tenant_id, v_admin_id, '🎉 NOVO CONTRATO FECHADO!', 'A oportunidade "' || NEW.title || '" foi ganha. Valor: R$ ' || COALESCE(NEW.value::text, '0,00'), 'success', '/dashboard/crm/' || NEW.pipeline_id);
        END LOOP;
        
        -- Log Específico de Contrato Fechado
        INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id)
        VALUES (NEW.tenant_id, auth.uid(), 'CONTRACT_WON', 'crm_tasks', NEW.id);
      END IF;

      -- Verificar se o novo estágio é PERDIDO
      IF EXISTS (SELECT 1 FROM public.crm_stages WHERE id = NEW.stage_id AND is_loss = true) THEN
        INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id, new_data)
        VALUES (NEW.tenant_id, auth.uid(), 'CONTRACT_LOST', 'crm_tasks', NEW.id, jsonb_build_object('motivo_perda', NEW.motivo_perda));
      END IF;
    END IF;
    
    -- C. Qualificado pela IA SDR (Se o lead scoring subiu massivamente ou origem = IA)
    -- Simulação de gatilho de IA que o sistema externo aciona atualizando o Lead
    IF OLD.lead_scoring IS DISTINCT FROM NEW.lead_scoring AND NEW.lead_scoring >= 80 THEN
        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO public.notifications (tenant_id, user_id, title, message, type)
            VALUES (NEW.tenant_id, NEW.assigned_to, '🤖 Lead Quente Qualificado (SDR)', 'A IA detectou forte intenção de fechamento no lead: ' || NEW.title, 'alert');
        END IF;
    END IF;
    
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar O Trigger na Tabela crm_tasks
DROP TRIGGER IF EXISTS on_crm_task_update ON public.crm_tasks;
CREATE TRIGGER on_crm_task_update
  AFTER UPDATE ON public.crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_crm_task_changes();


-- 2. Auditar Criação e Modificação Crítica de CLIENTES (PF/PJ) - LGPD
CREATE OR REPLACE FUNCTION public.log_client_changes()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id)
    VALUES (NEW.tenant_id, auth.uid(), 'CLIENT_CREATED', 'clients', NEW.id);
    
    -- Notificar Admins sobre novo lead entrando via formulário/integracao
    IF auth.uid() IS NULL THEN -- Significa que foi Inserção via API externa/formulário
        INSERT INTO public.notifications (tenant_id, user_id, title, message, type, link_url)
        SELECT NEW.tenant_id, p.id, 'Novo Cadastro de Cliente/Lead', 'O lead ' || CASE WHEN NEW.type = 'PF' THEN NEW.full_name ELSE NEW.company_name END || ' entrou no sistema.', 'info', '/dashboard/clientes'
        FROM public.profiles p WHERE p.tenant_id = NEW.tenant_id AND p.role IN ('Administrador', 'Sócio');
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Edição de Documento ou Contato Sensível (CPF/CNPJ/Telefone/Email)
    IF OLD.document IS DISTINCT FROM NEW.document OR OLD.phone IS DISTINCT FROM NEW.phone OR OLD.email IS DISTINCT FROM NEW.email THEN
      INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity, target_id, old_data, new_data)
      VALUES (
        NEW.tenant_id, auth.uid(), 'SENSITIVE_DATA_CHANGED', 'clients', NEW.id,
        jsonb_build_object('document', OLD.document, 'phone', OLD.phone, 'email', OLD.email),
        jsonb_build_object('document', NEW.document, 'phone', NEW.phone, 'email', NEW.email)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_client_change ON public.clients;
CREATE TRIGGER on_client_change
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_client_changes();
