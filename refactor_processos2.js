const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'src', 'app', 'dashboard', 'processos', '[pipelineId]', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// The modal starts at {/* TASK MODAL */}
const modalStartStr = '{/* TASK MODAL */}';
const modalEndStr = '{/* WIN LEAD MODAL */}';

const startIndex = content.indexOf(modalStartStr);
const endIndex = content.indexOf(modalEndStr);

if (startIndex === -1 || endIndex === -1) {
    console.error("Tags not found");
    process.exit(1);
}

// Ensure the types file exists
const typesStr = `
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
  processo_1grau?: string | null;
  processo_2grau?: string | null;
  demanda?: string | null;
  andamento_1grau?: string | null;
  andamento_2grau?: string | null;
  orgao_julgador?: string | null;
  tutela_urgencia?: string | null;
  sentenca?: string | null;
  reu?: string | null;
  valor_causa?: number | null;
  prazo_fatal?: string | null;
  liminar_deferida?: boolean | null;
  data_ultima_movimentacao?: string;
  client_name?: string | null;
  drive_link?: string | null;
};
`;

const typesPath = path.join(__dirname, 'src', 'types', 'processos.ts');
if (!fs.existsSync(path.dirname(typesPath))) {
    fs.mkdirSync(path.dirname(typesPath), { recursive: true });
}
fs.writeFileSync(typesPath, typesStr);

content = content.replace(/(type Pipeline = {[^}]+};)\s*/, '');
content = content.replace(/(type Stage = {[^}]+};)\s*/, '');
content = content.replace(/(type Profile = {[^}]+};)\s*/, '');
content = content.replace(/(type Task = {[\s\S]*?};\s*)\s*/, '');

content = content.replace('import WinLeadModal from "@/components/Processos/WinLeadModal";', 
'import WinLeadModal from "@/components/Processos/WinLeadModal";\nimport ProcessosTaskModal from "@/components/Processos/ProcessosTaskModal";\nimport { Pipeline, Stage, Profile, Task } from "@/types/processos";');

const hookStatesStart = content.indexOf('// Task Form State');
const hookStatesEnd = content.indexOf('const openNewTaskModal =');
const hooksToExtract = content.substring(hookStatesStart, hookStatesEnd);

const functionsStart = content.indexOf('const handeSaveTask =');
const functionsEnd = content.indexOf('const handleDeleteTask =', functionsStart) + content.substring(content.indexOf('const handleDeleteTask =')).indexOf('};') + 2;

// The rest of the refactoring is quite complex to do in regex for a 1100 line react file. 
console.log("Hooks ready to extract");
