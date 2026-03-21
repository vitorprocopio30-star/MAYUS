const fs = require('fs');
const file = 'src/app/dashboard/processos/[pipelineId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace everything inside `<div className="lg:col-span-3 space-y-6">` up to its closing `</div>`
const leftSideOld = `<div className="lg:col-span-3 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Título do Processo</label>
                  <input 
                    type="text" 
                    value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                    placeholder="Ex: Empresa X - Implantação de Software"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageCircle size={14} /> WhatsApp (Telefone)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={taskPhone} onChange={e => setTaskPhone(e.target.value)}
                      className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: 11999999999"
                    />
                    {taskPhone && (
                      <a 
                        href={\`https://wa.me/\${taskPhone.replace(/\\D/g, "")}\`} 
                        target="_blank" rel="noopener noreferrer"
                        className="bg-[#25D366] hover:bg-[#20bd5a] text-white p-3 rounded-lg transition-colors flex items-center justify-center shadow-[0_0_15px_rgba(37,211,102,0.3)] shrink-0"
                        title="Abrir no WhatsApp"
                      >
                        <MessageCircle size={20} />
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <AlignLeft size={14} /> Descrição Detalhada
                  </label>
                  <div className="prose prose-invert max-w-none">
                    <ReactQuill 
                      theme="snow"
                      value={taskDesc}
                      onChange={setTaskDesc}
                      modules={quillModules}
                      placeholder="Adicione informações, observações e detalhes da negociação..."
                    />
                  </div>
                </div>
              </div>`;

const leftSideNew = `<div className="lg:col-span-3 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Título do Processo</label>
                  <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                    placeholder="Ex: Novo Processo Contra a Empresa X" autoFocus />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">⚖️ Processo 1º Grau</label>
                    <input type="text" value={taskProcesso1Grau} onChange={e => setTaskProcesso1Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">⚖️ Processo 2º Grau</label>
                    <input type="text" value={taskProcesso2Grau} onChange={e => setTaskProcesso2Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">🎯 Demanda</label>
                    <input type="text" value={taskDemanda} onChange={e => setTaskDemanda(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👇 Andamento do Processo 1º Grau</label>
                    <input type="text" value={taskAndamento1Grau} onChange={e => setTaskAndamento1Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👇 Andamento do Processo 2º Grau</label>
                    <input type="text" value={taskAndamento2Grau} onChange={e => setTaskAndamento2Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👨‍⚖️ Órgão julgador</label>
                    <input type="text" value={taskOrgaoJulgador} onChange={e => setTaskOrgaoJulgador(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👩‍⚖️ Tutela de urgência</label>
                    <input type="text" value={taskTutelaUrgencia} onChange={e => setTaskTutelaUrgencia(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👩‍⚖️ Sentença</label>
                    <input type="text" value={taskSentenca} onChange={e => setTaskSentenca(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">🦉 Réu</label>
                    <input type="text" value={taskReu} onChange={e => setTaskReu(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">💵 Valor da Causa</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                      <input type="number" step="0.01" value={taskValorCausa} onChange={e => setTaskValorCausa(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-10 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">📅 Fatal</label>
                    <input type="date" value={taskPrazoFatal} onChange={e => setTaskPrazoFatal(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors appearance-none" style={{ colorScheme: 'dark' }} />
                  </div>

                  <div className="space-y-1.5 flex items-center mt-7 gap-3 h-full">
                    <input type="checkbox" checked={taskLiminarDeferida} onChange={e => setTaskLiminarDeferida(e.target.checked)}
                      className="w-5 h-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded focus:ring-[#CCA761]/50 accent-[#CCA761] cursor-pointer" id="liminar_deferida" />
                    <label htmlFor="liminar_deferida" className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer pt-0">
                      ✅ Liminar Deferida
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5 mt-6">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <AlignLeft size={14} /> Resumo do Caso
                  </label>
                  <div className="prose prose-invert max-w-none">
                    <ReactQuill 
                      theme="snow"
                      value={taskDesc}
                      onChange={setTaskDesc}
                      modules={quillModules}
                      placeholder="Adicione informações, observações e detalhes do processo..."
                    />
                  </div>
                </div>
              </div>`;

content = content.replace(leftSideOld, leftSideNew);

const rightSidePrefix = '<div className="space-y-6 lg:border-l lg:border-white/5 lg:pl-6">';
const rightSideNewPrefix = `<div className="space-y-6 lg:border-l lg:border-white/5 lg:pl-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageCircle size={14} /> WhatsApp (Telefone)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={taskPhone} onChange={e => setTaskPhone(e.target.value)}
                      className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: 11999999999"
                    />
                    {taskPhone && (
                      <a 
                        href={\`https://wa.me/\${taskPhone.replace(/\\D/g, "")}\`} 
                        target="_blank" rel="noopener noreferrer"
                        className="bg-[#25D366] hover:bg-[#20bd5a] text-white p-3 rounded-lg transition-colors flex items-center justify-center shadow-[0_0_15px_rgba(37,211,102,0.3)] shrink-0"
                        title="Abrir no WhatsApp"
                      >
                        <MessageCircle size={20} />
                      </a>
                    )}
                  </div>
                </div>\n`;

content = content.replace(rightSidePrefix, rightSideNewPrefix);

fs.writeFileSync(file, content);
console.log('done patching jsx layout');
