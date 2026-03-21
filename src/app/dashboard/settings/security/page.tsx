"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ShieldCheck, Smartphone, CheckCircle2 } from "lucide-react";

export default function SecuritySettingsPage() {
  const supabase = createClient();
  const [factors, setFactors] = useState<any[]>([]);
  const [qrCodeData, setQrCodeData] = useState<{ id: string; qrCode: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFullyEnrolled, setIsFullyEnrolled] = useState(false);

  useEffect(() => {
    loadFactors();
  }, []);

  const loadFactors = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      
      const totpFactors = data.totp || [];
      setFactors(totpFactors);
      
      if (totpFactors.some(f => f.status === 'verified')) {
        setIsFullyEnrolled(true);
      }
    } catch (error) {
      console.error("Erro ao carregar fatores MFA", error);
    }
  };

  const handleEnrollTOTP = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      });
      
      if (error) throw error;
      
      setQrCodeData({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret
      });
      
    } catch (error: any) {
      toast.error("Falha ao iniciar pareamento", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!qrCodeData || !verifyCode) return;
    
    try {
      setIsLoading(true);
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: qrCodeData.id
      });
      
      if (challengeError) throw challengeError;
      
      const { data: verify, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: qrCodeData.id,
        challengeId: challenge.id,
        code: verifyCode
      });
      
      if (verifyError) throw verifyError;
      
      toast.success("Autenticação em 2 Fatores Ativada!");
      setQrCodeData(null);
      setVerifyCode("");
      loadFactors();
      
    } catch (error: any) {
      toast.error("Código Inválido", { description: "Verifique se digitou o token mais recente do aplicativo." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnenroll = async (factorId: string) => {
    if (!confirm("Tem certeza que deseja remover o seu aplicativo Autenticador? O seu painel ficará menos seguro.")) return;
    
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      
      toast.success("Proteção 2FA Removida.");
      setIsFullyEnrolled(false);
      loadFactors();
    } catch (err: any) {
      toast.error("Falha ao remover", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
      
      {/* Categoria/Header */}
      <div>
        <h1 className="text-3xl font-light tracking-wide text-[#e0e0e0] flex items-center gap-3">
          <ShieldCheck className="text-[#CCA761] w-8 h-8" />
          Segurança da <span className="text-[#CCA761] font-bold">Conta</span>
        </h1>
        <p className="text-gray-400 mt-2 text-sm tracking-wide">
          Proteja o acesso ao seu painel MAYUS contra invasões vinculando um código gerado ao vivo no seu celular.
        </p>
      </div>

      {/* Caixa Principal */}
      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow de Fundo */}
        <div className="absolute top-0 right-0 p-32 bg-[#CCA761]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-[#222]">
            <div className={`p-4 rounded-full ${isFullyEnrolled ? 'bg-green-900/30 text-green-400' : 'bg-[#222] text-gray-400'}`}>
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-medium text-gray-100">
                Autenticação de Dois Fatores (MFA)
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full ${isFullyEnrolled ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                <p className="text-sm text-gray-400">
                  {isFullyEnrolled ? "Ativo (Sua conta possui Camada 2 de Segurança)" : "Inativo (Recomendado ativar)"}
                </p>
              </div>
            </div>
          </div>

          {/* Estado 1: Se já tem fator ativo, mostrar botão de remover */}
          {isFullyEnrolled && !qrCodeData && (
            <div className="space-y-6">
              <div className="bg-green-900/10 border border-green-900/40 p-5 rounded-lg flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-green-400 font-medium mb-1">Proteção Máxima Ativada</h3>
                  <p className="text-green-500/70 text-sm">Sua conta será permanentemente validada pelo seu celular no momento de cada login na plataforma. Este nível restringe invasores mesmo se sua senha for descoberta.</p>
                </div>
              </div>

              {factors.filter(f => f.status === 'verified').map(factor => (
                <div key={factor.id} className="flex justify-end pt-4">
                  <button
                    onClick={() => handleUnenroll(factor.id)}
                    disabled={isLoading}
                    className="text-red-400 hover:text-red-300 text-sm font-medium tracking-wide border border-transparent hover:border-red-900/50 bg-transparent hover:bg-red-900/10 px-4 py-2 rounded-lg transition-all"
                  >
                    Desativar Fator
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Estado 2: Botão para Iniciar as Configurações */}
          {!isFullyEnrolled && !qrCodeData && (
            <div className="space-y-6 flex flex-col items-start">
               <p className="text-gray-300 text-sm max-w-2xl leading-relaxed">
                 O 2FA exibe um código numérico aletório que expira a cada 30 segundos usando os aplicativos oficiais <strong>Google Authenticator</strong>, Authy ou Microsoft Authenticator. 
               </p>

               <button
                  onClick={handleEnrollTOTP}
                  disabled={isLoading}
                  className="bg-[#CCA761] hover:bg-[#e3c27e] text-black font-semibold px-6 py-3 rounded-lg shadow-[0_0_15px_rgba(204,167,97,0.3)] transition-all flex items-center gap-2"
               >
                  {isLoading ? 'Gerando...' : 'Vincular Celular a Conta'}
               </button>
            </div>
          )}

          {/* Estado 3: O Pareamento na Metade (Mostrando QR Code) */}
          {qrCodeData && (
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start bg-[#181818] p-6 lg:p-8 rounded-xl border border-[#333]">
              
              <div className="bg-[#fff] p-4 rounded-xl flex-shrink-0">
                {/* Renderizando QR Code Oficial da uri fornecida pela Supabase API */}
                <QRCodeSVG value={qrCodeData.qrCode} size={180} />
              </div>

              <div className="flex flex-col flex-grow">
                <h3 className="text-lg font-bold tracking-wide text-[#e0e0e0] mb-2">Escaneie o QR Code</h3>
                <ol className="list-decimal pl-4 space-y-2 text-sm text-gray-400 mb-6">
                  <li>Abra o aplicativo de Autenticação de sua escolha.</li>
                  <li>Inicie o Câmera de captura do Celular.</li>
                  <li>Aponte para o quadro à esquerda.</li>
                  <li>Digite no campo abaixo a primeira sequência exibida.</li>
                </ol>

                <div className="flex flex-col gap-3">
                  <label className="text-xs font-semibold uppercase tracking-widest text-[#CCA761]">Código Atual</label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      className="bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-white tracking-[0.4em] font-mono text-xl w-36 text-center focus:border-[#CCA761] focus:ring-1 focus:ring-[#CCA761] transition-all"
                      placeholder="000000"
                      maxLength={6}
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    />
                    <button
                      onClick={handleVerifyEnrollment}
                      disabled={isLoading || verifyCode.length !== 6}
                      className="bg-green-600 hover:bg-green-500 disabled:bg-[#333] disabled:text-gray-500 text-white font-medium px-6 py-3 rounded-lg transition-all"
                    >
                      Verificar Par
                    </button>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-[#333]">
                  <p className="text-xs text-gray-500 mb-1">Chave Manual Secreta (Caso sua Câmera falhe)</p>
                  <code className="text-[10px] text-[#CCA761] bg-[#111] px-2 py-1 rounded select-all tracking-wider font-mono">
                    {qrCodeData.secret}
                  </code>

                   <div className="mt-4 flex justify-end">
                      <button 
                         onClick={() => {
                           setQrCodeData(null); 
                           setVerifyCode('');
                         }} 
                         className="text-xs text-gray-400 hover:text-white underline-offset-4 hover:underline"
                      >
                         Cancelar Cadastro
                      </button>
                   </div>
                </div>
                
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
