-- Adiciona colunas nome do cliente (client_name) e link do drive (drive_link) na tabela process_tasks
ALTER TABLE public.process_tasks ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.process_tasks ADD COLUMN IF NOT EXISTS drive_link text;
