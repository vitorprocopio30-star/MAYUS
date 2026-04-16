"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { getPasswordStrength, isStrongPassword } from "@/lib/permissions";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
});

function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (password !== confirmPassword) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (!isStrongPassword(password)) {
      setErrorMsg("A senha deve conter letras, números e pelo menos um símbolo.");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErrorMsg(error.message || "Erro ao atualizar senha.");
        setIsLoading(false);
        return;
      }

      setSuccessMsg("Senha atualizada com sucesso! Redirecionando...");
      
      setTimeout(() => {
        router.push("/login");
      }, 2000);

    } catch (err) {
      setErrorMsg("Erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`relative min-h-screen flex items-center justify-center overflow-hidden ${montserrat.className} bg-[#0a0a0a]`}
    >
      {/* Imagem de Fundo */}
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
      
      {/* Container Central */}
      <div className="relative z-10 w-full max-w-md animate-fade-in-up mx-4">
        <div 
          className="relative w-full rounded-3xl overflow-hidden p-[2px]"
          style={{ boxShadow: "0 40px 100px -10px rgba(0, 0, 0, 0.95)" }}
        >
          {/* Border Beam */}
          <div 
            className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] opacity-60"
            style={{ background: "conic-gradient(from 0deg, transparent 75%, #B8975E 100%)" }}
          />

          <div className="relative w-full bg-[#0C0C0C] rounded-[22px] p-8 md:p-10">
            
            {/* Logo pequena */}
            <div className="flex justify-center mb-6">
              <div className="relative w-24 h-24">
                <Image src="/mayus_logo.png" alt="MAYUS Logo" fill className="object-contain" priority />
              </div>
            </div>

            {/* Headline */}
            <div className="text-center mb-8">
              <h1 className={`text-[#e0e0e0] text-2xl leading-tight tracking-wider ${montserrat.className} font-light mb-2`}>
                Nova <strong className="text-[#CCA761] font-bold">Senha</strong>
              </h1>
              <p className="text-gray-500 text-[10px] uppercase tracking-widest">Defina sua nova senha de acesso</p>
            </div>

            {/* Messages */}
            {errorMsg && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-red-300 text-sm font-medium">{errorMsg}</p>
              </div>
            )}

            {successMsg && (
              <div className="bg-green-900/20 border border-green-800/40 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
                <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-300 text-sm font-medium">{successMsg}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-200" htmlFor="newPassword">
                  Nova Senha (mínimo 8 caracteres)
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555] tracking-widest text-base"
                />
                {/* Indicadores de força da senha */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(getPasswordStrength(password)).map(([key, passed]) => (
                      <div key={key} className={`flex items-center gap-2 text-[11px] ${passed ? 'text-green-400' : 'text-gray-500'}`}>
                        <span>{passed ? '✓' : '○'}</span>
                        <span>
                          {key === 'minLength' && 'Mínimo 8 caracteres'}
                          {key === 'hasLetter' && 'Pelo menos uma letra'}
                          {key === 'hasNumber' && 'Pelo menos um número'}
                          {key === 'hasSymbol' && 'Pelo menos um símbolo (!@#$...)'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-200" htmlFor="confirmNewPassword">
                  Confirmar Nova Senha
                </label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555] tracking-widest text-base"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`relative w-full mt-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-bold rounded-lg px-4 py-3 text-xs flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-none overflow-hidden ${
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
                  {isLoading ? "ATUALIZANDO..." : "SALVAR NOVA SENHA"}
                </span>
              </button>
            </form>

            <div className="text-center pt-6">
              <button 
                type="button" 
                onClick={() => router.push('/login')}
                className="text-xs text-[#555] hover:text-[#d4af37] transition-colors uppercase tracking-wider"
              >
                Voltar para Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#CCA761] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <UpdatePasswordForm />
    </Suspense>
  );
}
