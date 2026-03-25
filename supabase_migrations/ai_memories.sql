-- 1. Cria a Tabela Secreta de Memórias
CREATE TABLE user_ai_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  memory_text TEXT NOT NULL,
  context_tags TEXT[], -- Ex: ["família", "esposa"]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilita RLS (Segurança de Nível de Linha)
ALTER TABLE user_ai_memories ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Acesso
CREATE POLICY "Usuários veem suas próprias memórias" 
ON user_ai_memories FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários inserem suas próprias memórias" 
ON user_ai_memories FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Workspace completo" 
ON user_ai_memories FOR ALL 
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
