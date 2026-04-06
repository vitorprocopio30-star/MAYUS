
export type Pipeline = { id: string; name: string; description: string; tags: string[]; sectors: string[] };
export type Stage = { id: string; name: string; color: string; order_index: number; is_loss: boolean; is_win: boolean };
export type Profile = { id: string; full_name: string; avatar_url: string | null };
export type Task = { 
  id: string; 
  stage_id: string; 
  title: string; 
  description: string; 
  position_index: number; 
  client_id: string | null; 
  value: number | null;
  assigned_to: string | null;
  tags: string[];
  created_at: string;
  motivo_perda?: string;
  phone?: string | null;
  sector?: string | null;
  department_id?: string | null;
  data_ultima_movimentacao?: string;
};
