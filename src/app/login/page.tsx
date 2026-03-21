"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Playfair_Display, Inter, Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";

// Gravando e Padronizando as Tipografias Principais do MAYUS
const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"] });

const PARTICLES = [
  { id: 1, left: 15, delay: 0, duration: 18, size: 4 },
  { id: 2, left: 35, delay: 2, duration: 22, size: 6 },
  { id: 3, left: 55, delay: 4, duration: 20, size: 5 },
  { id: 4, left: 85, delay: 1, duration: 25, size: 7 },
  { id: 5, left: 90, delay: 5, duration: 19, size: 5 },
  { id: 6, left: 10, delay: 3, duration: 21, size: 4 },
  { id: 7, left: 25, delay: 6, duration: 24, size: 8 },
  { id: 8, left: 45, delay: 8, duration: 17, size: 6 },
  { id: 9, left: 65, delay: 7, duration: 26, size: 5 },
  { id: 10, left: 75, delay: 9, duration: 23, size: 9 },
  { id: 11, left: 5, delay: 11, duration: 16, size: 4 },
  { id: 12, left: 20, delay: 10, duration: 20, size: 5 },
  { id: 13, left: 40, delay: 13, duration: 22, size: 7 },
  { id: 14, left: 60, delay: 12, duration: 18, size: 6 },
  { id: 15, left: 80, delay: 14, duration: 25, size: 8 },
  { id: 16, left: 95, delay: 15, duration: 19, size: 5 },
  { id: 17, left: 50, delay: 1.5, duration: 21, size: 4 },
  { id: 18, left: 30, delay: 4.5, duration: 24, size: 6 },
  { id: 19, left: 70, delay: 2.5, duration: 20, size: 7 },
  { id: 20, left: 12, delay: 8.5, duration: 17, size: 5 },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  
  // Controle de Etapa: 'password' (Normal), 'totp' (Desafio 2FA), ou 'forgot' (Esqueci Senha)
  const [step, setStep] = useState<"password" | "totp" | "forgot">("password");
  const [factorId, setFactorId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [lockMinutes, setLockMinutes] = useState(0);

  // Detecta redirecionamento por conta desativada
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

    // ── Rate Limiting: Verifica bloqueio ANTES de tentar autenticar ──
    try {
      const lockRes = await fetch(`/api/auth/check-lock?email=${encodeURIComponent(email)}`);
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
      // Se a checagem falhar, permite o login (fail-open)
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
      const { data: authData, error: authError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
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
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        
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
  }, [email, password, router, supabase.auth]);

  const handleVerifyTotp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;

    setIsLoading(true);
    setErrorMsg("");

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
        setErrorMsg("Erro ao iniciar o desafio de segurança.");
        setIsLoading(false);
        return;
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: totpCode,
    });

    if (verifyError) {
        setErrorMsg("Código inválido ou expirado.");
        setIsLoading(false);
    } else {
        router.push("/dashboard");
        router.refresh();
    }
  }, [factorId, totpCode, router, supabase.auth]);

  return (
    <div
      className={`relative min-h-screen flex items-center justify-center overflow-hidden ${montserrat.className} bg-[#0a0a0a]`}
    >
      {/* Imagem de Fundo Premium */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Image
          src="/bg_office.png"
          alt="Office Background"
          fill
          className="object-cover opacity-25"
          priority
          quality={100}
        />
        <div className="absolute inset-0 bg-[#0a0a0a]/70 backdrop-blur-[2px]" />
      </div>

      {/* Bolas Douradas Animadas */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {PARTICLES.map((particle) => (
          <div
            key={particle.id}
            className="absolute bottom-[-20px] rounded-full bg-gradient-to-tr from-[#CCA761] to-[#f1d58d] opacity-0 animate-particles"
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${particle.left}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              boxShadow: "0 0 10px rgba(204,167,97,0.5), 0 0 20px rgba(204,167,97,0.3)"
            }}
          />
        ))}
      </div>
      
      {/* ======= CONTAINER PRINCIPAL ======= */}
      <div className="relative z-10 w-full max-w-3xl xl:max-w-4xl animate-fade-in-up my-auto mx-4 flex items-center justify-center">
        <div 
          className="relative w-full rounded-3xl overflow-hidden p-[2px] animate-float"
          style={{
            boxShadow: "0 40px 100px -10px rgba(0, 0, 0, 0.95)"
          }}
        >
        {/* Feixe de Luz Giratório (Border Beam) */}
        <div 
          className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] opacity-60"
          style={{
            background: "conic-gradient(from 0deg, transparent 75%, #B8975E 100%)"
          }}
        />

        {/* Quadro Escuro Real */}
        <div className="relative w-full h-full flex flex-col md:flex-row bg-[#0C0C0C] rounded-[22px] overflow-hidden">
          
          {/* Painel Esquerdo ("Quadro de Boas Vindas") */}
          <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-[#222222] relative overflow-hidden group">
            
            {/* Adicionado margin negativa superior maior para subir o bloco mais um pouco */}
            <div className="relative text-center w-full flex flex-col items-center -mt-8 md:-mt-12">
              {/* Logo MAYUS com tamanho extra */}
              <div className="relative w-[20rem] h-[20rem] md:w-[28rem] md:h-[28rem] mb-[-30px] hover:scale-105 transition-transform duration-700">
                <Image
                  src="/logo.png"
                  alt="MAYUS Logo"
                  fill
                  className="object-contain"
                  priority
                  quality={100}
                />
              </div>
              
              {/* Frase com destaque final de tamanho */}
              <div className="mt-[-20px] md:mt-[-50px] text-center z-10 px-4">
                <p className={`text-[#d4d4d4] text-[1.3rem] md:text-[1.6rem] font-medium max-w-sm leading-snug mx-auto tracking-wide ${cormorant.className}`}>
                  Sua plataforma premium para <br className="hidden md:block" />
                  <strong className="text-[#CCA761] font-bold">excelência</strong> e soluções jurídicas.
                </p>
              </div>
            </div>
          </div>

          {/* Painel Direito (Formulário) */}
          <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col bg-[#111111]">
            
            <div className="w-full max-w-sm mx-auto flex flex-col h-full">
              
              {/* Headline Luxuosa */}
              <div className="text-left mb-6">
                <h1 className={`text-[#e0e0e0] text-2xl md:text-3xl leading-tight tracking-wider ${montserrat.className} font-light mb-4`}>
                  Bem-vindo ao <strong className="text-[#CCA761] font-bold">MAYUS.</strong>
                </h1>
                
                {/* Header Subtítulo Form */}
                <h2 className="text-[#ffffff] text-xs md:text-sm font-bold mb-[4px] tracking-[0.2em] uppercase">Acesso Restrito</h2>
                <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-widest">{step === 'totp' ? 'Verificação de Segurança' : step === 'forgot' ? 'Recuperação de Conta' : 'Faça o login seguro'}</p>
              </div>

              <div className="flex-grow flex flex-col gap-2">
                {/* Mensagem de Erro */}
                {errorMsg && (
                  <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-red-300 text-sm font-medium">{errorMsg}</p>
                  </div>
                )}

                {/* Renderização Condicional do Formulário com base no `step` */}
                {step === 'password' ? (
                  <form onSubmit={handleLogin} className="flex flex-col gap-4 h-full">
                    <div className="space-y-1 animate-fade-in-up">
                      <label className="block text-xs font-semibold text-gray-200" htmlFor="email">
                        E-mail corporativo
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@mayus.com.br"
                        required
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555]"
                      />
                    </div>

                    <div className="space-y-1 animate-fade-in-up" style={{ animationDelay: '0.1s'}}>
                      <div className="flex justify-between items-end">
                        <label className="block text-xs font-semibold text-gray-200" htmlFor="password">
                          Senha
                        </label>
                        <button 
                          type="button"
                          onClick={() => { setStep('forgot'); setErrorMsg(''); setSuccessMsg(''); setResetEmail(email); }}
                          className="text-[10px] text-[#a0832c] hover:text-[#d4af37] transition-colors underline-offset-4 hover:underline"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555] tracking-widest text-base"
                      />
                    </div>

                    <div className="mt-auto animate-fade-in-up" style={{ animationDelay: '0.2s'}}>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={`relative w-full bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-bold rounded-lg px-4 py-3 text-xs flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-none overflow-hidden ${
                          isLoading ? "opacity-70 cursor-not-allowed transform-none" : "hover:-translate-y-[1px]"
                        }`}
                      >
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
                        
                        {isLoading ? (
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#111111]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        <span className="relative z-10 tracking-widest font-[800] text-sm">
                          {isLoading ? "ACESSANDO..." : "ACESSAR PLATAFORMA"}
                        </span>
                      </button>
                    </div>

                    <div className="text-center pt-3">
                      <button 
                        type="button" 
                        onClick={() => router.push('/signup')}
                        className="text-xs text-[#555] hover:text-[#d4af37] transition-colors uppercase tracking-wider"
                      >
                        Primeiro acesso? → Criar conta
                      </button>
                    </div>
                  </form>
                ) : step === 'totp' ? (
                  <form onSubmit={handleVerifyTotp} className="flex flex-col gap-4 animate-fade-in-up h-full">
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 font-medium">Conta protegida por Autenticação de 2 Fatores.</p>
                      <label className="block text-xs font-semibold text-[#CCA761]" htmlFor="totpCode">
                        Código do Autenticador (6 dígitos)
                      </label>
                      <input
                        id="totpCode"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="123456"
                        required
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#333] tracking-[0.5em] text-center text-lg font-mono"
                      />
                    </div>

                    <div className="mt-auto pb-4">
                      <button
                        type="submit"
                        disabled={isLoading || totpCode.length !== 6}
                        className={`relative w-full bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-bold rounded-lg px-4 py-3 text-xs flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-none overflow-hidden ${
                          (isLoading || totpCode.length !== 6) ? "opacity-70 cursor-not-allowed transform-none" : "hover:-translate-y-[1px]"
                        }`}
                      >
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
                        
                        {isLoading ? (
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#111111]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        <span className="relative z-10 tracking-widest font-[800] text-sm">
                          {isLoading ? "VERIFICANDO..." : "CONFIRMAR CÓDIGO"}
                        </span>
                      </button>
                    </div>

                    <div className="text-center pt-4">
                      <button 
                         type="button" 
                         onClick={() => setStep('password')}
                         className="text-xs text-[#555] hover:text-[#d4af37] transition-colors uppercase tracking-wider"
                      >
                        Voltar para Senha
                      </button>
                    </div>
                  </form>
                ) : step === 'forgot' ? (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    setErrorMsg('');
                    setSuccessMsg('');
                    try {
                      const res = await fetch('/api/auth/reset-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: resetEmail }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setErrorMsg(data.error || 'Erro ao enviar link de recuperação.');
                      } else {
                        setSuccessMsg('Se o e-mail existir, um link de recuperação foi enviado. Verifique sua caixa de entrada.');
                      }
                    } catch (err) {
                      setErrorMsg('Erro inesperado. Tente novamente.');
                    } finally {
                      setIsLoading(false);
                    }
                  }} className="flex flex-col gap-4 animate-fade-in-up h-full">
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 font-medium">Insira seu e-mail corporativo e enviaremos um link para redefinir sua senha.</p>
                      <label className="block text-xs font-semibold text-[#CCA761]" htmlFor="resetEmail">
                        E-mail de Recuperação
                      </label>
                      <input
                        id="resetEmail"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="admin@mayus.com.br"
                        required
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555]"
                      />
                    </div>

                    {successMsg && (
                      <div className="bg-green-900/20 border border-green-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
                        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-green-300 text-sm font-medium">{successMsg}</p>
                      </div>
                    )}

                    <div className="mt-auto pb-4">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={`relative w-full bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-bold rounded-lg px-4 py-3 text-xs flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-none overflow-hidden ${
                          isLoading ? "opacity-70 cursor-not-allowed transform-none" : "hover:-translate-y-[1px]"
                        }`}
                      >
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
                        {isLoading ? (
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#111111]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        <span className="relative z-10 tracking-widest font-[800] text-sm">
                          {isLoading ? "ENVIANDO..." : "ENVIAR LINK DE RECUPERAÇÃO"}
                        </span>
                      </button>
                    </div>

                    <div className="text-center pt-4">
                      <button 
                        type="button" 
                        onClick={() => { setStep('password'); setErrorMsg(''); setSuccessMsg(''); }}
                        className="text-xs text-[#555] hover:text-[#d4af37] transition-colors uppercase tracking-wider"
                      >
                        Voltar para Login
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
