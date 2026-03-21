-- Add tags and settings columns to crm_pipelines
ALTER TABLE crm_pipelines 
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{"auto_create": true, "auto_assign": false, "sync_agents": false, "auto_resolve": false, "auto_win": false}'::jsonb;
