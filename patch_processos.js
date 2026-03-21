const fs = require('fs');
const file = 'src/app/dashboard/processos/[pipelineId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add fields to Task
content = content.replace(
  '  sector?: string | null;\n};',
  `  sector?: string | null;
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
};`
);

// 2. Add useState fields
content = content.replace(
  '  const [taskSector, setTaskSector] = useState("");',
  `  const [taskSector, setTaskSector] = useState("");
  const [taskProcesso1Grau, setTaskProcesso1Grau] = useState("");
  const [taskProcesso2Grau, setTaskProcesso2Grau] = useState("");
  const [taskDemanda, setTaskDemanda] = useState("");
  const [taskAndamento1Grau, setTaskAndamento1Grau] = useState("");
  const [taskAndamento2Grau, setTaskAndamento2Grau] = useState("");
  const [taskOrgaoJulgador, setTaskOrgaoJulgador] = useState("");
  const [taskTutelaUrgencia, setTaskTutelaUrgencia] = useState("");
  const [taskSentenca, setTaskSentenca] = useState("");
  const [taskReu, setTaskReu] = useState("");
  const [taskValorCausa, setTaskValorCausa] = useState("");
  const [taskPrazoFatal, setTaskPrazoFatal] = useState("");
  const [taskLiminarDeferida, setTaskLiminarDeferida] = useState(false);`
);

// 3. Reset in openNewTaskModal
content = content.replace(
  '    setTaskSector("");\n    setEditingTask(null);',
  `    setTaskSector("");
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
    setEditingTask(null);`
);

// 4. Set in openEditTaskModal
content = content.replace(
  '    setTaskSector(task.sector || "");\n    setEditingTask(task);',
  `    setTaskSector(task.sector || "");
    setTaskProcesso1Grau(task.processo_1grau || "");
    setTaskProcesso2Grau(task.processo_2grau || "");
    setTaskDemanda(task.demanda || "");
    setTaskAndamento1Grau(task.andamento_1grau || "");
    setTaskAndamento2Grau(task.andamento_2grau || "");
    setTaskOrgaoJulgador(task.orgao_julgador || "");
    setTaskTutelaUrgencia(task.tutela_urgencia || "");
    setTaskSentenca(task.sentenca || "");
    setTaskReu(task.reu || "");
    setTaskValorCausa(task.valor_causa ? task.valor_causa.toString() : "");    
    setTaskPrazoFatal(task.prazo_fatal ? task.prazo_fatal.split('T')[0] : "");
    setTaskLiminarDeferida(task.liminar_deferida || false);
    setEditingTask(task);`
);

// 5. Save logic - update
content = content.replace(
  '          phone: taskPhone,\n          sector: taskSector\n        }).eq("id", editingTask.id)',
  `          phone: taskPhone,
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
          liminar_deferida: taskLiminarDeferida
        }).eq("id", editingTask.id)`
);

// 6. Save logic - insert
content = content.replace(
  '          phone: taskPhone,\n          sector: taskSector\n        }).select().single();',
  `          phone: taskPhone,
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
          liminar_deferida: taskLiminarDeferida
        }).select().single();`
);

// 7. Modal rendering text
content = content.replace(
  /Nova Tarefa/g,
  'Novo Processo'
);
content = content.replace(
  /Editar Tarefa/g,
  'Editar Processo'
);
content = content.replace(
  /Tarefa excluída/g,
  'Processo excluído'
);
content = content.replace(
  /Tarefa criada/g,
  'Processo criado'
);
content = content.replace(
  /Tarefa atualizada/g,
  'Processo atualizado'
);
content = content.replace(
  />Tarefa</g,
  '>Processo<'
);
content = content.replace(
  /Título da Oportunidade/g,
  'Título do Processo'
);

fs.writeFileSync(file, content);
console.log('done modifying typescript logic');
