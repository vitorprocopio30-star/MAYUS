-- 1. Cria a Tabela do Mural de Feedbacks
CREATE TABLE mural_feedbacks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Se o user for deletado, mantemos o feedback
  content TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  sentiment TEXT, -- Pode ser 'positive', 'negative' ou 'neutral' avaliado pela IA
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilita RLS (Row Level Security)
ALTER TABLE mural_feedbacks ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Acesso
-- Todos da mesma empresa podem ver (no frontend vamos filtrar os que têm menos de 24h)
CREATE POLICY "Membros da empresa veem o mural" 
ON mural_feedbacks FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Todos da mesma empresa podem postar
CREATE POLICY "Membros da empresa podem postar no mural" 
ON mural_feedbacks FOR INSERT 
WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Apenas o administrador ou o criador do post (se não for anônimo) pode deletar
CREATE POLICY "Criadores ou Admins podem deletar" 
ON mural_feedbacks FOR DELETE
USING (
  auth.uid() = user_id OR 
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'Administrador'
);
