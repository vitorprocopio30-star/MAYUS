const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'src', 'app', 'dashboard', 'crm', '[pipelineId]', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Find imports insertion point
const importPosition = content.indexOf('import "react-quill/dist/quill.snow.css";');
if (importPosition === -1) {
    console.error("Imports position not found");
    process.exit(1);
}

// Ensure the types file is imported inside page.tsx
if (!content.includes('import { Pipeline, Stage, Profile, Task } from "@/types/crm";')) {
    content = content.replace(
        'import "react-quill/dist/quill.snow.css";',
        'import "react-quill/dist/quill.snow.css";\nimport { Pipeline, Stage, Profile, Task } from "@/types/crm";\nimport CrmTaskModal from "@/components/crm/CrmTaskModal";'
    );
}

// Extract types and create types/crm.ts
const typesCode = `
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
  data_ultima_movimentacao?: string;
};
`;

const typesPath = path.join(__dirname, 'src', 'types', 'crm.ts');
if (!fs.existsSync(path.dirname(typesPath))) {
    fs.mkdirSync(path.dirname(typesPath), { recursive: true });
}
fs.writeFileSync(typesPath, typesCode);

// Remove old type declarations from page.tsx
content = content.replace(/(type Pipeline = {[^}]+};)\s*/, '');
content = content.replace(/(type Stage = {[^}]+};)\s*/, '');
content = content.replace(/(type Profile = {[^}]+};)\s*/, '');
content = content.replace(/(type Task = {[\s\S]*?};\s*)/, '');

// Extract Task Form State block
const hookStatesStart = content.indexOf('// Task Form State');
const hookStatesEnd = content.indexOf('// Pending Move State for Win/Loss');
if (hookStatesStart === -1 || hookStatesEnd === -1) {
    console.error("States not found");
    process.exit(1);
}
const formStatesCode = content.substring(hookStatesStart, hookStatesEnd);

// Create Component CrmTaskModal
const modalCode = `import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { User as UserIcon, AlignLeft, X, Trash2, Calendar, CheckCircle2, ArrowRight, MessageCircle, Tag as TagIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Pipeline, Stage, Profile, Task } from "@/types/crm";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-white/5 animate-pulse rounded-lg" />
});

interface CrmTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask: Task | null;
  defaultStageId: string;
  pipelineId: string;
  pipeline: Pipeline | null;
  stages: Stage[];
  agents: Profile[];
  profile: any;
  onSaveSuccess: (updatedTask: Task, isNew: boolean) => void;
  onDeleteSuccess: (taskId: string) => void;
}

export default function CrmTaskModal({
  isOpen, onClose, editingTask, defaultStageId, pipelineId, pipeline, stages, agents, profile, onSaveSuccess, onDeleteSuccess
}: CrmTaskModalProps) {
  const supabase = createClient();
  const [isSaving, setIsSaving] = useState(false);

  ${formStatesCode.replace(/\n\s*$/g, '')}

  useEffect(() => {
    if (isOpen) {
      if (editingTask) {
        setTaskTitle(editingTask.title);
        setTaskDesc(editingTask.description || "");
        setTaskStageId(editingTask.stage_id);
        setTaskAssignedTo(editingTask.assigned_to);
        setTaskTags(editingTask.tags || []);
        setTaskPhone(editingTask.phone || "");
        setTaskSector(editingTask.sector || "");
      } else {
        setTaskTitle("");
        setTaskDesc("");
        setTaskStageId(defaultStageId || (stages[0]?.id ?? ""));
        setTaskAssignedTo(null);
        setTaskTags([]);
        setTaskPhone("");
        setTaskSector("");
      }
    }
  }, [isOpen, editingTask, defaultStageId, stages]);

  const handeSaveTask = async () => {
    if (!taskTitle.trim()) { toast.error("Título é obrigatório."); return; }
    if (!taskStageId) return;

    setIsSaving(true);
    try {
      if (editingTask) {
        const { data, error } = await supabase.from("crm_tasks").update({
          title: taskTitle,
          description: taskDesc,
          stage_id: taskStageId,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector
        }).eq("id", editingTask.id).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, false);
        toast.success("Tarefa atualizada.");
      } else {
        const { data, error } = await supabase.from("crm_tasks").insert({
          tenant_id: profile!.tenant_id,
          pipeline_id: pipelineId,
          stage_id: taskStageId,
          title: taskTitle,
          description: taskDesc,
          position_index: 0,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector
        }).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, true);
        toast.success("Tarefa criada.");
      }
      onClose();
    } catch (err) {
      toast.error("Erro ao salvar tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!editingTask || !confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase.from("crm_tasks").delete().eq("id", editingTask.id);
      if (error) throw error;
      onDeleteSuccess(editingTask.id);
      onClose();
    } catch (err) {
      toast.error("Erro ao excluir tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
      ['link', 'clean']
    ],
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#141414] relative">
           <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#CCA761] to-transparent opacity-50" />
           <h2 className="text-lg font-bold text-white flex items-center gap-2">
             {editingTask ? "Editar Tarefa" : "Nova Tarefa"}
           </h2>
           <div className="flex items-center gap-2">
             {editingTask && (
               <button 
                 onClick={handleDeleteTask}
                 className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-white/5 transition-colors"
                 title="Excluir Tarefa"
               >
                 <Trash2 size={20} />
               </button>
             )}
             <button onClick={onClose} className="text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors">
               <X size={20} />
             </button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 no-scrollbar grid grid-cols-1 lg:grid-cols-4 gap-8">
          ${content.substring(content.indexOf('<div className="lg:col-span-3 space-y-6">'), content.indexOf('<div className="p-5 border-t border-white/5 bg-[#141414] flex items-center justify-end gap-3">'))}
        <div className="p-5 border-t border-white/5 bg-[#141414] flex items-center justify-end gap-3">
          <button 
            onClick={onClose} 
            className="text-sm font-semibold text-gray-400 hover:text-white px-5 py-2.5 hover:bg-white/5 rounded-lg transition-colors"
            disabled={isSaving}
          >
            Descartar
          </button>
          <button 
            onClick={handeSaveTask} 
            disabled={isSaving} 
            className="flex items-center gap-2 bg-[#CCA761] hover:bg-[#b89552] text-black px-8 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-[#CCA761]/10"
          >
            {isSaving ? "Processando..." : (editingTask ? "Salvar Alterações" : "Criar Tarefa")}
          </button>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join(__dirname, 'src', 'components', 'crm', 'CrmTaskModal.tsx'), modalCode);

// CLEAN UP PAGE.TSX
content = content.replace(formStatesCode, '\n');

const newOpenNew = `
  const [defaultStageId, setDefaultStageId] = useState("");

  const openNewTaskModal = (stageId?: string) => {
    setDefaultStageId(stageId || (stages[0]?.id ?? ""));
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };`;
const oldOpenNewStart = content.indexOf('const openNewTaskModal =');
const oldOpenNewEnd = content.indexOf('const openEditTaskModal =');
content = content.replace(content.substring(oldOpenNewStart, oldOpenNewEnd), newOpenNew + '\n\n  ');

const newOpenEdit = `const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };`;
const oldOpenEditStart = content.indexOf('const openEditTaskModal =');
const oldOpenEditEnd = content.indexOf('const handeSaveTask =');
content = content.replace(content.substring(oldOpenEditStart, oldOpenEditEnd), newOpenEdit + '\n\n  ');

const oldHandleSaveStart = content.indexOf('const handeSaveTask =');
const oldQuillEnd = content.indexOf('const quillModules = {') + content.substring(content.indexOf('const quillModules = {')).indexOf('};') + 2;
content = content.replace(content.substring(oldHandleSaveStart, oldQuillEnd), '');

const oldModalJSXStart = content.indexOf('{/* TASK MODAL */}');
const oldModalJSXEnd = content.indexOf('{/* WIN LEAD MODAL */}');

if (oldModalJSXStart !== -1 && oldModalJSXEnd !== -1) {
    const newModalComponent = `{/* TASK MODAL */}
      <CrmTaskModal 
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        editingTask={editingTask}
        defaultStageId={defaultStageId}
        pipelineId={pipelineId}
        pipeline={pipeline}
        stages={stages}
        agents={agents}
        profile={profile}
        onSaveSuccess={(updatedTask, isNew) => {
          if (isNew) {
            setTasks([...tasks, updatedTask]);
          } else {
            setTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
          }
        }}
        onDeleteSuccess={(taskId) => {
          setTasks(tasks.filter(t => t.id !== taskId));
        }}
      />

      `;

    content = content.replace(content.substring(oldModalJSXStart, oldModalJSXEnd), newModalComponent);
}

fs.writeFileSync(pagePath, content);
console.log("Refactoring absolute success!!");
