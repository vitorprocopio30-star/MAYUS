"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { isStrongPassword, getPasswordStrength } from "@/lib/permissions";

const cormorant = Cormorant_Garamond({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const montserrat = Montserrat({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
});

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
];

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const emailFromInvite = searchParams.get("email") || "";
  const tokenFromInvite = searchParams.get("token") || "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(emailFromInvite);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [inviteExpired, setInviteExpired] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const isPasswordStrong = isStrongPassword(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    if (emailFromInvite) setEmail(emailFromInvite);
  }, [emailFromInvite]);

  // Verificar se o convite está expirado
  useEffect(() => {
    if (!tokenFromInvite) return;
    const checkInvite = async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("expires_at, accepted")
        .eq("id", tokenFromInvite)
        .maybeSingle();

      if (error || !data) {
        setInviteExpired(true);
        return;
      }
      if (data.accepted) {
        setInviteExpired(true);
        setErrorMsg("Este convite já foi utilizado.");
        return;
      }
      if (new Date(data.expires_at) < new Date()) {
        setInviteExpired(true);
      }
    };
    checkInvite();
  }, [tokenFromInvite, supabase]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (password !== confirmPassword) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    if (!isPasswordStrong) {
      setErrorMsg("A senha deve conter no mínimo 8 caracteres, incluindo letras, números e símbolos.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Criar o usuário no Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          setErrorMsg("Este e-mail já está cadastrado. Faça login.");
        } else {
          setErrorMsg(error.message);
        }
        setIsLoading(false);
        return;
      }

      // 2. Se tiver token de convite, marca como aceito
      if (tokenFromInvite) {
        await supabase
          .from("invites")
          .update({ accepted: true })
          .eq("id", tokenFromInvite);
      }

      setSuccessMsg("Conta criada com sucesso! Redirecionando para o login...");
      
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
            
            <div className="relative text-center w-full flex flex-col items-center -mt-8 md:-mt-12">
              {/* Logo MAYUS */}
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
              
              {/* Frase */}
              <div className="mt-[-20px] md:mt-[-50px] text-center z-10 px-4">
                <p className={`text-[#d4d4d4] text-[1.3rem] md:text-[1.6rem] font-medium max-w-sm leading-snug mx-auto tracking-wide ${cormorant.className}`}>
                  Configure sua conta e comece a <br className="hidden md:block" />
                  <strong className="text-[#CCA761] font-bold">operar</strong> com excelência.
                </p>
              </div>
            </div>
          </div>

          {/* Painel Direito (Formulário de Cadastro) */}
          <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col bg-[#111111]">
            
            <div className="w-full max-w-sm mx-auto flex flex-col h-full">
              
              {/* Headline */}
              <div className="text-left mb-6">
                <h1 className={`text-[#e0e0e0] text-2xl md:text-3xl leading-tight tracking-wider ${montserrat.className} font-light mb-4`}>
                  Criar Conta <strong className="text-[#CCA761] font-bold">MAYUS.</strong>
                </h1>
                
                <h2 className="text-[#ffffff] text-xs md:text-sm font-bold mb-[4px] tracking-[0.2em] uppercase">Cadastro por Convite</h2>
                <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-widest">Finalize seu acesso à plataforma</p>
              </div>

              <div className="flex-grow flex flex-col gap-2">

                {/* Card de Convite Expirado */}
                {inviteExpired && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-red-900/20 border border-red-800/30 flex items-center justify-center mb-6">
                      <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    </div>
                    <h2 className={`text-2xl text-white mb-3 ${cormorant.className} italic font-bold`}>
                      Convite <span className="text-red-400">Expirado</span>
                    </h2>
                    <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-6">
                      {errorMsg || "Este link de convite expirou após 48 horas. Solicite ao administrador do seu escritório um novo envio."}
                    </p>
                    <button
                      onClick={() => router.push('/login')}
                      className="text-xs text-[#CCA761] hover:text-[#f1d58d] transition-colors uppercase tracking-wider border border-[#CCA761]/30 px-6 py-2.5 rounded-lg hover:bg-[#CCA761]/5"
                    >
                      Ir para o Login
                    </button>
                  </div>
                )}

                {/* Formulário — oculto se convite expirado */}
                {!inviteExpired && (<>
                {/* Mensagem de Erro */}
                {errorMsg && (
                  <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-red-300 text-sm font-medium">{errorMsg}</p>
                  </div>
                )}

                {/* Mensagem de Sucesso */}
                {successMsg && (
                  <div className="bg-green-900/20 border border-green-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-green-300 text-sm font-medium">{successMsg}</p>
                  </div>
                )}

                <form onSubmit={handleSignup} className="flex flex-col gap-4 h-full">
                  
                  <div className="space-y-1 animate-fade-in-up">
                    <label className="block text-xs font-semibold text-gray-200" htmlFor="fullName">
                      Nome Completo
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="João da Silva"
                      required
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555]"
                    />
                  </div>

                  <div className="space-y-1 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                    <label className="block text-xs font-semibold text-gray-200" htmlFor="signupEmail">
                      E-mail corporativo
                    </label>
                    <input
                      id="signupEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      readOnly={!!emailFromInvite}
                      className={`w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555] ${emailFromInvite ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                  </div>

                  <div className="space-y-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <label className="block text-xs font-semibold text-gray-200" htmlFor="signupPassword">
                      Senha Segura
                    </label>
                    <input
                      id="signupPassword"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555] tracking-widest text-base"
                    />
                    {/* Barra de Força Visual */}
                    {password.length > 0 && (
                      <div className="space-y-1.5 mt-2 p-3 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">
                        <div className="flex gap-1">
                          <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength.minLength ? 'bg-[#CCA761]' : 'bg-[#222]'}`} />
                          <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength.hasLetter ? 'bg-[#CCA761]' : 'bg-[#222]'}`} />
                          <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength.hasNumber ? 'bg-[#4ade80]' : 'bg-[#222]'}`} />
                          <div className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength.hasSymbol ? 'bg-[#4ade80]' : 'bg-[#222]'}`} />
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[9px]">
                          <span className={passwordStrength.minLength ? 'text-[#CCA761]' : 'text-gray-600'}>✓ 8+ caracteres</span>
                          <span className={passwordStrength.hasLetter ? 'text-[#CCA761]' : 'text-gray-600'}>✓ Letras</span>
                          <span className={passwordStrength.hasNumber ? 'text-[#4ade80]' : 'text-gray-600'}>✓ Números</span>
                          <span className={passwordStrength.hasSymbol ? 'text-[#4ade80]' : 'text-gray-600'}>✓ Símbolos (!@#)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
                    <label className="block text-xs font-semibold text-gray-200" htmlFor="confirmPassword">
                      Confirmar Senha
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] transition-all placeholder:text-[#555] tracking-widest text-base"
                    />
                  </div>

                  <div className="mt-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <button
                      type="submit"
                      disabled={isLoading || !isPasswordStrong || !passwordsMatch || inviteExpired}
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
                        {isLoading ? "CRIANDO CONTA..." : "CRIAR MINHA CONTA"}
                      </span>
                    </button>
                  </div>
                </form>

                <div className="text-center pt-4">
                  <button 
                    type="button" 
                    onClick={() => router.push('/login')}
                    className="text-xs text-[#555] hover:text-[#d4af37] transition-colors uppercase tracking-wider"
                  >
                    Já tenho uma conta → Fazer Login
                  </button>
                </div>
                </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#CCA761] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
