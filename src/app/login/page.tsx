"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Inter, Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({ subsets: ["latin"] });

const CHECK_LOCK_TIMEOUT_MS = 1800;
const AUTH_STEP_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timeoutId));
  });
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  
  const [step, setStep] = useState<"password" | "totp" | "forgot">("password");
  const [factorId, setFactorId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [lockMinutes, setLockMinutes] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reason") === "account_disabled") {
        setErrorMsg("Sua conta foi desativada pelo administrador. Entre em contato com o escritório.");
      }
    }
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");
    setLockMinutes(0);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHECK_LOCK_TIMEOUT_MS);
      const lockRes = await fetch(`/api/auth/check-lock?email=${encodeURIComponent(email)}`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (lockRes.ok) {
        const lockData = await lockRes.json();
        if (lockData.locked) {
          setLockMinutes(lockData.remainingMinutes);
          setErrorMsg(`Conta bloqueada temporariamente. Muitas tentativas de login. Tente novamente em ${lockData.remainingMinutes} minuto(s).`);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // A checagem de bloqueio nao pode impedir login legitimo quando Supabase esta lento.
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        AUTH_STEP_TIMEOUT_MS,
        "auth_timeout",
      );

      if (error) {
        fetch("/api/audit/login", {
          method: "POST",
          body: JSON.stringify({ email, success: false, errorMsg: error.message }),
        }).catch(console.error);

        setErrorMsg(
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : error.message
        );
        setIsLoading(false);
      } else {
        const { data: authData, error: authError } = await withTimeout(
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          AUTH_STEP_TIMEOUT_MS,
          "mfa_level_timeout",
        );
        
        if (authError) {
          setErrorMsg("Erro ao verificar nível de segurança.");
          setIsLoading(false);
          return;
        }

        if (authData.currentLevel === authData.nextLevel) {
          fetch("/api/audit/login", {
            method: "POST",
            body: JSON.stringify({
              email,
              success: true,
              userId: data.user.id,
              tenantId: data.user.app_metadata?.tenant_id
            }),
          }).catch(console.error);

          router.push("/dashboard");
          router.refresh();
        } else {
          const { data: factorsData, error: factorsError } = await withTimeout(
            supabase.auth.mfa.listFactors(),
            AUTH_STEP_TIMEOUT_MS,
            "mfa_factors_timeout",
          );

          if (factorsError || !factorsData) {
              setErrorMsg("Falha ao recuperar os fatores de segurança configurados.");
              setIsLoading(false);
              return;
          }

          const totpFactor = factorsData.totp.find(f => f.status === "verified");

          if (totpFactor) {
              setFactorId(totpFactor.id);
              setStep("totp");
              setIsLoading(false);
          } else {
              setErrorMsg("Conta com segurança inconsistente. Contate o suporte.");
              setIsLoading(false);
          }
        }
      }
    } catch {
      setErrorMsg("A validacao demorou demais. Tente novamente em alguns segundos.");
      setIsLoading(false);
    }
  }, [email, password, router, supabase.auth]);

  const handleVerifyTotp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;

    setIsLoading(true);
    setErrorMsg("");

    try {
      const { data: challengeData, error: challengeError } = await withTimeout(
        supabase.auth.mfa.challenge({ factorId }),
        AUTH_STEP_TIMEOUT_MS,
        "mfa_challenge_timeout",
      );

      if (challengeError) {
          setErrorMsg("Erro ao iniciar o desafio de segurança.");
          setIsLoading(false);
          return;
      }

      const { error: verifyError } = await withTimeout(
        supabase.auth.mfa.verify({
            factorId,
            challengeId: challengeData.id,
            code: totpCode,
        }),
        AUTH_STEP_TIMEOUT_MS,
        "mfa_verify_timeout",
      );

      if (verifyError) {
          setErrorMsg("Código inválido ou expirado.");
          setIsLoading(false);
      } else {
          router.push("/dashboard");
          router.refresh();
      }
    } catch {
        setErrorMsg("A verificacao demorou demais. Tente novamente em alguns segundos.");
        setIsLoading(false);
    }
  }, [factorId, totpCode, router, supabase.auth]);

  return (
    <div
      className={`relative min-h-screen flex items-center justify-center overflow-hidden ${inter.className} bg-[#050505]`}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />

      {/* BACKGROUND ELEMENTS */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image
          src="/bg_office.png"
          alt="Office"
          fill
          className="object-cover opacity-[0.16] grayscale"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#020202]/95 via-[#050505]/88 to-[#0A0A0A]/96" />
        <div className="absolute left-[-15%] top-[10%] h-[420px] w-[420px] rounded-full bg-[#CCA761]/[0.06] blur-[140px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[360px] w-[360px] rounded-full bg-[#CCA761]/[0.04] blur-[120px]" />
      </div>
      
      {/* LOGIN CARD */}
      <div className="relative z-10 w-full max-w-4xl mx-4 my-auto animate-[fadeUp_1s_ease-out]">
        <div 
          className="relative w-full rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/[0.03] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
        >
          <div className="absolute inset-0 rounded-[2.5rem] border border-[#CCA761]/10 pointer-events-none" />

          <div className="relative w-full h-full flex flex-col md:flex-row bg-[#0A0A0A]/95 rounded-[2.5rem] overflow-hidden">
            {/* LEFT PANEL: BRANDING */}
            <div className="w-full md:w-[45%] p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                 <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[#CCA761] blur-[150px] rounded-full" />
              </div>

              <div className="relative z-10 text-center -mt-10">
                <div className="relative w-64 h-64 md:w-80 md:h-80 mx-auto hover:scale-105 transition-transform duration-1000 ease-out">
                  <Image
                    src="/mayus_logo.png"
                    alt="MAYUS"
                    fill
                    className="object-contain drop-shadow-[0_0_30px_rgba(204,167,97,0.2)]"
                    priority
                  />
                </div>

                <div className="mt-[-2rem] px-6">
                  <p className={`text-gray-300 text-xl md:text-2xl font-light leading-snug tracking-wide ${cormorant.className}`}>
                    Sua plataforma premium para <br />
                    <span className="text-[#CCA761] font-bold italic">excelência jurídica.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: AUTH FORM */}
            <div className="w-full md:w-[55%] p-8 md:p-14 flex flex-col bg-[#0d0d0d]">
              <div className="w-full max-w-sm mx-auto h-full flex flex-col justify-center">
                
                <header className="mb-10">
                  <h1 className={`text-white text-3xl md:text-4xl font-bold tracking-tight mb-4 ${montserrat.className}`}>
                    Portal <span className="text-[#CCA761]">MAYUS</span>
                  </h1>
                  <div className="flex items-center gap-3">
                    <div className="h-[1px] w-8 bg-[#CCA761]/40" />
                    <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-black">
                      {step === 'totp' ? 'Verificação MFA' : step === 'forgot' ? 'Recuperação' : 'Segurança de Acesso'}
                    </p>
                  </div>
                </header>

                {errorMsg && (
                  <div className="mb-8 rounded-2xl bg-red-500/5 border border-red-500/20 p-4 animate-[fadeUp_0.3s_ease-out]">
                    <p className="text-red-400 text-xs font-bold uppercase tracking-widest text-center">{errorMsg}</p>
                  </div>
                )}

                {successMsg && (
                  <div className="mb-8 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-4 animate-[fadeUp_0.3s_ease-out]">
                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest text-center">{successMsg}</p>
                  </div>
                )}

                {step === 'password' && (
                  <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">E-mail Corporativo</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com.br"
                        required
                        className="w-full bg-black/40 border border-white/5 text-white rounded-xl px-4 py-3.5 text-sm outline-none transition-all focus:border-[#CCA761]/50 focus:bg-black/60 placeholder:text-gray-800"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Senha de Acesso</label>
                        <button 
                          type="button"
                          onClick={() => setStep('forgot')}
                          className="text-[9px] text-[#CCA761]/60 hover:text-[#CCA761] uppercase font-black tracking-widest transition-colors"
                        >
                          Esqueci a senha
                        </button>
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full bg-black/40 border border-white/5 text-white rounded-xl px-4 py-3.5 text-sm outline-none transition-all focus:border-[#CCA761]/50 focus:bg-black/60 placeholder:text-gray-800 tracking-widest"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[#CCA761] to-[#e3c27e] p-[1px] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                      <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-[#CCA761] to-[#e3c27e] px-6 py-4 rounded-[calc(0.75rem-1px)] transition-all group-hover:bg-transparent">
                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                        <span className="relative z-10 text-[11px] font-black uppercase tracking-[0.3em] text-black">
                          {isLoading ? "Validando..." : "Entrar na MAYUS"}
                        </span>
                      </div>
                    </button>

                    <div className="text-center pt-4">
                      <button
                        type="button" 
                        onClick={() => router.push('/signup')}
                        className="text-[10px] text-gray-600 hover:text-[#CCA761] transition-colors uppercase font-black tracking-[0.2em]"
                      >
                        Novo por aqui? Criar Conta
                      </button>
                    </div>
                  </form>
                )}

                {step === 'totp' && (
                  <form onSubmit={handleVerifyTotp} className="space-y-8 animate-[fadeUp_0.4s_ease-out]">
                    <div className="space-y-4">
                      <p className="text-xs text-gray-500 font-medium leading-relaxed">Código de 6 dígitos gerado pelo seu app autenticador.</p>
                      <input
                        type="text"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="000000"
                        required
                        className="w-full bg-black/40 border border-white/5 text-[#CCA761] rounded-2xl px-6 py-5 text-4xl font-mono text-center outline-none focus:border-[#CCA761]/50 tracking-[0.3em]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || totpCode.length !== 6}
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[#CCA761] to-[#e3c27e] p-[1px] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                      <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-[#CCA761] to-[#e3c27e] px-6 py-4 rounded-[calc(0.75rem-1px)]">
                        <span className="relative z-10 text-[11px] font-black uppercase tracking-[0.3em] text-black">Verificar</span>
                      </div>
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setStep('password')}
                        className="text-[10px] text-gray-600 hover:text-[#CCA761] transition-colors uppercase font-black tracking-[0.2em]"
                      >
                        Voltar para Login
                      </button>
                    </div>
                  </form>
                )}

                {step === 'forgot' && (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    try {
                      const res = await fetch('/api/auth/reset-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: resetEmail }),
                      });
                      if (res.ok) setSuccessMsg('Instruções enviadas para seu e-mail.');
                      else setErrorMsg('Erro ao solicitar recuperação.');
                    } catch { setErrorMsg('Falha na conexão.'); }
                    finally { setIsLoading(false); }
                  }} className="space-y-8 animate-[fadeUp_0.4s_ease-out]">
                    <div className="space-y-4">
                      <p className="text-xs text-gray-500 font-medium leading-relaxed">Enviaremos um link seguro para redefinir sua senha.</p>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">E-mail Corporativo</label>
                         <input
                           type="email"
                           value={resetEmail}
                           onChange={(e) => setResetEmail(e.target.value)}
                           placeholder="seu@email.com.br"
                           required
                           className="w-full bg-black/40 border border-white/5 text-white rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#CCA761]/50"
                         />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[#CCA761] to-[#e3c27e] p-[1px] transition-all hover:scale-[1.02]"
                    >
                      <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-[#CCA761] to-[#e3c27e] px-6 py-4 rounded-[calc(0.75rem-1px)]">
                        <span className="relative z-10 text-[11px] font-black uppercase tracking-[0.3em] text-black">Enviar Link</span>
                      </div>
                    </button>

                    <div className="text-center">
                      <button 
                        type="button" 
                        onClick={() => setStep('password')}
                        className="text-[10px] text-gray-600 hover:text-[#CCA761] transition-colors uppercase font-black tracking-[0.2em]"
                      >
                        Voltar para Login
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
