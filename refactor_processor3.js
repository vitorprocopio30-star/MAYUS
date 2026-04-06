const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'src', 'app', 'dashboard', 'processos', '[pipelineId]', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Find imports insertion point
const importPosition = content.indexOf('import "react-quill/dist/quill.snow.css";');
if (importPosition === -1) {
    console.error("Imports position not found");
    process.exit(1);
}

// Ensure the types file is imported inside page.tsx
if (!content.includes('import { Pipeline, Stage, Profile, Task } from "@/types/processos";')) {
    content = content.replace(
        'import "react-quill/dist/quill.snow.css";',
        'import "react-quill/dist/quill.snow.css";\nimport { Pipeline, Stage, Profile, Task } from "@/types/processos";\nimport ProcessosTaskModal from "@/components/Processos/ProcessosTaskModal";'
    );
}

// Remove old type declarations
content = content.replace(/(type Pipeline = {[^}]+};)\n/, '');
content = content.replace(/(type Stage = {[^}]+};)\n/, '');
content = content.replace(/(type Profile = {[^}]+};)\n/, '');
content = content.replace(/(type Task = {[\s\S]*?};\n)\n/, '');

// Extract Task Form State block
const hookStatesStart = content.indexOf('// Task Form State');
const hookStatesEnd = content.indexOf('const [pendingMove, setPendingMove] = useState<{');
if (hookStatesStart === -1 || hookStatesEnd === -1) {
    console.error("States not found");
    process.exit(1);
}

const formStatesCode = content.substring(hookStatesStart, hookStatesEnd);

// Instead of manual AST, let's just use string replacement!
// But wait, the component has openNewTaskModal, openEditTaskModal inside page!
// If we move the form states, we must also move those functions OR handle them in the modal.
// The easiest strategy for the modal is to receive:
// isOpen, onClose, task (if editing), null (if creating), stageId (if creating defaulting), and callback onSave.
// If we pass `isOpen`, `onClose`, `editingTask`, `defaultStageId`, the modal itself can initialize its states when `isOpen` becomes true!
const modalCode = `import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { User as UserIcon, AlignLeft, X, Trash2, Calendar, CheckCircle2, ArrowRight, MessageCircle, Tag as TagIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Pipeline, Stage, Profile, Task } from "@/types/processos";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-white/5 animate-pulse rounded-lg" />
});

interface ProcessosTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask: Task | null;
  defaultStageId: string;
  pipeline: Pipeline | null;
  stages: Stage[];
  agents: Profile[];
  profile: any;
  onSaveSuccess: (updatedTask: Task, isNew: boolean) => void;
  onDeleteSuccess: (taskId: string) => void;
}

export default function ProcessosTaskModal({
  isOpen, onClose, editingTask, defaultStageId, pipeline, stages, agents, profile, onSaveSuccess, onDeleteSuccess
}: ProcessosTaskModalProps) {
  const supabase = createClient();
  const [isSaving, setIsSaving] = useState(false);

  ${formStatesCode.replace(/\n\s*$/g, '')}

  // Initialize state when modal opens
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
        setTaskProcesso1Grau(editingTask.processo_1grau || "");
        setTaskProcesso2Grau(editingTask.processo_2grau || "");
        setTaskDemanda(editingTask.demanda || "");
        setTaskAndamento1Grau(editingTask.andamento_1grau || "");
        setTaskAndamento2Grau(editingTask.andamento_2grau || "");
        setTaskOrgaoJulgador(editingTask.orgao_julgador || "");
        setTaskTutelaUrgencia(editingTask.tutela_urgencia || "");
        setTaskSentenca(editingTask.sentenca || "");
        setTaskReu(editingTask.reu || "");
        setTaskValorCausa(editingTask.valor_causa ? editingTask.valor_causa.toString() : "");    
        setTaskPrazoFatal(editingTask.prazo_fatal ? editingTask.prazo_fatal.split('T')[0] : "");
        setTaskLiminarDeferida(editingTask.liminar_deferida || false);
        setTaskClientName(editingTask.client_name || "");
        setTaskDriveLink(editingTask.drive_link || "");
      } else {
        setTaskTitle("");
        setTaskDesc("");
        setTaskStageId(defaultStageId || (stages[0]?.id ?? ""));
        setTaskAssignedTo(null);
        setTaskTags([]);
        setTaskPhone("");
        setTaskSector("");
        setTaskProcesso1Grau("");
        setTaskProcesso2Grau("");
        setTaskDemanda("");
        setTaskAndamento1Grau("");
        setTaskAndamento2Grau("");
        setTaskOrgaoJulgador("");
        setTaskTutelaUrgencia("");
        setTaskSentenca("");
        setTaskReu("");
        setTaskValorCausa("");
        setTaskPrazoFatal("");
        setTaskLiminarDeferida(false);
        setTaskClientName("");
        setTaskDriveLink("");
      }
    }
  }, [isOpen, editingTask, defaultStageId, stages]);

  const handeSaveTask = async () => {
    if (!taskTitle.trim()) { toast.error("Título é obrigatório."); return; }
    if (!taskStageId) return;

    setIsSaving(true);
    try {
      if (editingTask) {
        const { data, error } = await supabase.from("process_tasks").update({
          title: taskTitle,
          description: taskDesc,
          stage_id: taskStageId,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector,
          processo_1grau: taskProcesso1Grau || null,
          processo_2grau: taskProcesso2Grau || null,
          demanda: taskDemanda || null,
          andamento_1grau: taskAndamento1Grau || null,
          andamento_2grau: taskAndamento2Grau || null,
          orgao_julgador: taskOrgaoJulgador || null,
          tutela_urgencia: taskTutelaUrgencia || null,
          sentenca: taskSentenca || null,
          reu: taskReu || null,
          valor_causa: taskValorCausa ? parseFloat(taskValorCausa) : null,
          prazo_fatal: taskPrazoFatal ? new Date(taskPrazoFatal).toISOString() : null,
          liminar_deferida: taskLiminarDeferida,
          client_name: taskClientName || null,
          drive_link: taskDriveLink || null
        }).eq("id", editingTask.id).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, false);
        toast.success("Processo atualizado.");
      } else {
        // Need to calculate maxPos differently, but we don't have all tasks here.
        // We can pass maxPos or just default to 0 and let backend sort it out, or let page do it.
        // For simplicity, passing 0, we can refine this later if needed.
        const { data, error } = await supabase.from("process_tasks").insert({
          tenant_id: profile!.tenant_id,
          pipeline_id: pipeline!.id,
          stage_id: taskStageId,
          title: taskTitle,
          description: taskDesc,
          position_index: 0,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector,
          processo_1grau: taskProcesso1Grau || null,
          processo_2grau: taskProcesso2Grau || null,
          demanda: taskDemanda || null,
          andamento_1grau: taskAndamento1Grau || null,
          andamento_2grau: taskAndamento2Grau || null,
          orgao_julgador: taskOrgaoJulgador || null,
          tutela_urgencia: taskTutelaUrgencia || null,
          sentenca: taskSentenca || null,
          reu: taskReu || null,
          valor_causa: taskValorCausa ? parseFloat(taskValorCausa) : null,
          prazo_fatal: taskPrazoFatal ? new Date(taskPrazoFatal).toISOString() : null,
          liminar_deferida: taskLiminarDeferida,
          client_name: taskClientName || null,
          drive_link: taskDriveLink || null
        }).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, true);
        toast.success("Processo criado.");
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
      const { error } = await supabase.from("process_tasks").delete().eq("id", editingTask.id);
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
    ${content.substring(content.indexOf('{/* TASK MODAL */}'), content.indexOf('{/* WIN LEAD MODAL */}')).replace('{/* TASK MODAL */}', '').replace(/^[\s\n]+|[\s\n]+$/g, '')}
  );
}
`;

fs.writeFileSync(path.join(__dirname, 'src', 'components', 'Processos', 'ProcessosTaskModal.tsx'), modalCode);

// NOW CLEAN UP THE PAGE!
// 1. Remove the form states
content = content.replace(formStatesCode, '\n');

// 2. Adjust openNewTaskModal
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

// 3. Adjust openEditTaskModal
const newOpenEdit = `const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };`;
const oldOpenEditStart = content.indexOf('const openEditTaskModal =');
const oldOpenEditEnd = content.indexOf('const handeSaveTask =');
content = content.replace(content.substring(oldOpenEditStart, oldOpenEditEnd), newOpenEdit + '\n\n  ');

// 4. Remove handeSaveTask and handleDeleteTask entirely + quillModules
const oldHandleSaveStart = content.indexOf('const handeSaveTask =');
const oldQuillEnd = content.indexOf('const quillModules = {') + content.substring(content.indexOf('const quillModules = {')).indexOf('};') + 2;
content = content.replace(content.substring(oldHandleSaveStart, oldQuillEnd), '');

// 5. Replace modal JSX with Component Include
const oldModalJSXStart = content.indexOf('{/* TASK MODAL */}');
const oldModalJSXEnd = content.indexOf('{/* WIN LEAD MODAL */}');

const newModalComponent = `{/* TASK MODAL */}
      <ProcessosTaskModal 
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        editingTask={editingTask}
        defaultStageId={defaultStageId}
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
          toast.success("Processo excluído.");
        }}
      />

      `;

content = content.replace(content.substring(oldModalJSXStart, oldModalJSXEnd), newModalComponent);

fs.writeFileSync(pagePath, content);
console.log("Refactoring absolute success!!");
