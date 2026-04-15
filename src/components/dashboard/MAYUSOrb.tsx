"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Scale, X } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { useConversation } from "@elevenlabs/react";
import * as THREE from "three";

export function MAYUSOrb() {
  const { role } = useUserProfile();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const orbAuraRef = useRef<HTMLDivElement>(null);
  const coreWaveformRef = useRef<HTMLDivElement>(null);

  // --- CONFIGURAÇÃO ELEVENLABS ---
  const conversation = useConversation({
    clientTools: {
      trocar_fundo_tema: async () => {},
      abrir_agenda: async () => {},
      criar_tarefa_n8n_master: async () => {},
      memorizar_informacao_intima: async () => {},
    },
    onConnect: () => {},
    onDisconnect: () => {
      setIsExpanded(false);
    },
    onError: (err) => {
      console.error("[ElevenLabs]", err);
      toast.error("Erro na sincronia com o Agente.");
      setIsExpanded(false);
    },
  });

  const { status, isSpeaking } = conversation;

  // --- HANDLER DE CLIQUE (BOTÃO PRINCIPAL) ---
  const toggleListening = useCallback(async () => {
    const allowed = ["admin", "socio", "Sócio", "Administrador"];
    if (!allowed.includes(role || "")) {
      toast.error("Módulo Vocal MAYUS restrito ao nível executivo.");
      return;
    }

    if (status === "connected") {
      await conversation.endSession();
    } else if (status === "disconnected") {
      setIsExpanded(true);

      try {
        const response = await fetch("/api/agent/voice/signed-url");
        if (!response.ok) throw new Error("Falha ao obter URL segura");
        
        const { signed_url } = await response.json();
        if (!signed_url) throw new Error("URL Vazia");
        
        await conversation.startSession({ 
          signedUrl: signed_url,
          dynamicVariables: {
            nome_usuario: "Doutor Vitor"
          }
        });
      } catch (err: any) {
        setIsExpanded(false);
      }
    }
  }, [role, status, conversation]);

  // --- EFEITO: AUDIO AMBIENT ---
  useEffect(() => {
    if (isExpanded && audioRef.current) {
      audioRef.current.volume = 0.2;
      audioRef.current.play().catch(() => {});
    } else if (!isExpanded && audioRef.current) {
      audioRef.current.pause();
    }
  }, [isExpanded]);

  // --- RENDEREIZAÇÃO THREE.JS (GLOBO + STARFIELD) ---
  useEffect(() => {
    if (!isExpanded || !mountRef.current) return;

    let animationId: number;
    const clock = new THREE.Clock();

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000"); // preto absoluto

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // ==================================================
    // STARFIELD (FUNDO COM PARTÍCULAS SIDERAIS DOURADAS)
    // ==================================================
    const starCount = 1800; // Aumentado para mais densidade
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        starPos[i * 3] = (Math.random() - 0.5) * 28;     // x: -14 a 14
        starPos[i * 3 + 1] = (Math.random() - 0.5) * 18; // y: -9 a 9
        starPos[i * 3 + 2] = Math.random() * -46 + 6;    // z: -40 a 6
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    
    const starMat = new THREE.PointsMaterial({
        size: 0.032,
        color: 0xE7C676, // Champanhe quente / Ouro claro
        transparent: true,
        opacity: 0.95, // Muito mais aceso
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // ==================================================
    // GLOBE CENTRAL (GLOBO MAIS DOURADO)
    // ==================================================
    const sphereGeo = new THREE.IcosahedronGeometry(1.4, 16); // Densidade de pontos
    const basePos = sphereGeo.attributes.position.array;
    const numPoints = basePos.length / 3;
    
    const globeGeo = new THREE.BufferGeometry();
    const globePos = new Float32Array(numPoints * 3);
    const globeCol = new Float32Array(numPoints * 3);
    const randoms = new Float32Array(numPoints);
    
    for (let i = 0; i < numPoints; i++) {
        globePos[i*3] = basePos[i*3];
        globePos[i*3+1] = basePos[i*3+1];
        globePos[i*3+2] = basePos[i*3+2];
        randoms[i] = Math.random();
    }
    globeGeo.setAttribute("position", new THREE.BufferAttribute(globePos, 3));
    globeGeo.setAttribute("color", new THREE.BufferAttribute(globeCol, 3));

    const globeMat = new THREE.PointsMaterial({
        size: 0.025,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const globe = new THREE.Points(globeGeo, globeMat);
    scene.add(globe);

    // ==================================================
    // ANIMATION LOOP E REACTIVITY
    // ==================================================
    let currentIntensity = 0;
    let lastTime = 0;
    let accumulatedPhase = 0;

    const animate = () => {
        animationId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        const delta = t - lastTime;
        lastTime = t;

        // Variáveis de controle de estado (STARFIELD SPEED e GLOBE IDLE CALMING)
        let targetIntensity = 0;
        let starSpeed = 0.006; // velocidade suspensa/elegante
        
        if (status === "connecting" || status === "disconnecting") {
            targetIntensity = 0.15; // listening suave
            starSpeed = 0.008;
        } else if (status === "connected") {
            if (isSpeaking) {
                targetIntensity = 1.0;
                starSpeed = 0.009; // apenas discretamente mais rápido falando
            } else {
                targetIntensity = 0.05; // IDLE quase imperceptível
                starSpeed = 0.006;
            }
        }

        // Transição Absoluta Orgânica (Liquid Viscosity)
        // Valores baixíssimos para garantir que a subida seja orgânica (0.12) e a descida de falar para ouvir (0.035) derreta quase como um metal líquido lento, tirando zero qualquer agressividae.
        const lerpSpeed = targetIntensity < currentIntensity ? 0.035 : 0.12;
        currentIntensity += (targetIntensity - currentIntensity) * lerpSpeed;

        // Atualização Global do Globo e Pontos
        const positions = globeGeo.attributes.position.array as Float32Array;
        const colors = globeGeo.attributes.color.array as Float32Array;
        
        // RADIAL SCALE TUNING - Rotação fluida e lenta
        globe.rotation.y = t * 0.04 + (currentIntensity * 0.1);
        globe.rotation.z = t * 0.015;

        // PHASE SPEED LÍQUIDO - Em vez de pular a target speed, atrelamos a velocidade das ondas sinuosas à intensidade global. 
        // Quando a voz vai embora num "fade", o aceleramento celular desacelera na mesma proporção curva.
        const dynamicPhaseSpeed = 0.3 + (currentIntensity * 0.8);
        accumulatedPhase += delta * dynamicPhaseSpeed;

        // SPEAKING REACTIVITY E GLOBE GOLD TUNING
        for (let i = 0; i < numPoints; i++) {
            const bx = basePos[i*3];
            const by = basePos[i*3+1];
            const bz = basePos[i*3+2];
            const rnd = randoms[i];
            
            // Deformação reativa evoluindo a partir do accumulatedPhase
            const baseNoiseAmp = 0.015 + (currentIntensity * 0.065);
            const noise = Math.sin((accumulatedPhase * 1.2) + rnd * 15) * baseNoiseAmp;
            
            const speakAmp = currentIntensity * 1.0;
            const speakPush = speakAmp * (0.09 + rnd * 0.08) * Math.sin((accumulatedPhase * 15) + rnd * 12);
            
            const expand = 1 + noise + speakPush;
            
            positions[i*3] = bx * expand;
            positions[i*3+1] = by * expand;
            positions[i*3+2] = bz * expand;

            // Cores: interpolação mais quente (Dourado/Âmbar ao Champanhe)
            // Normalizar a altura do vertice para cor
            const yNorm = (by + 1.4) / 2.8; // Aprox 0 a 1
            colors[i*3]     = 0.78 + yNorm * 0.22; // Red
            colors[i*3+1]   = 0.52 + yNorm * 0.28; // Green
            colors[i*3+2]   = 0.08 + yNorm * 0.10; // Blue
        }
        globeGeo.attributes.position.needsUpdate = true;
        globeGeo.attributes.color.needsUpdate = true;

        // Atualiza Starfield
        const stars = starGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < starCount; i++) {
            stars[i*3+2] += starSpeed;
            if (stars[i*3+2] > 6) {
                stars[i*3+2] = -40; // Volta para profundidade original
                stars[i*3] = (Math.random() - 0.5) * 28;
                stars[i*3+1] = (Math.random() - 0.5) * 18;
            }
        }
        starGeo.attributes.position.needsUpdate = true;

        // ==================================================
        // AURA EXTERNA E FREQUENCIA HTML OVERLAYS
        // ==================================================
        if (orbAuraRef.current) {
            const scale = 1.05 + currentIntensity * 0.25;
            const opacity = 0.18 + currentIntensity * 0.35;
            orbAuraRef.current.style.transform = `scale(${scale})`;
            orbAuraRef.current.style.opacity = `${opacity}`;
            // Removemos o swap bruto do animationDuration do CSS para evitar glitch no browser, mantendo o CSS base fixo girando e apenas modulando a Escala e Blur
        }

        if (coreWaveformRef.current) {
            // CORE FREQUENCY LINE
            const scaleY = currentIntensity < 0.2 ? 0.1 : (currentIntensity * 1.5 + Math.sin(t * 20) * 0.8 * currentIntensity);
            coreWaveformRef.current.style.transform = `scaleY(${scaleY})`;
            coreWaveformRef.current.style.opacity = `${currentIntensity < 0.2 ? 0.05 : 0.6 + currentIntensity * 0.4}`;
        }

        renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
        cancelAnimationFrame(animationId);
        window.removeEventListener("resize", handleResize);
        globeGeo.dispose();
        globeMat.dispose();
        starGeo.dispose();
        starMat.dispose();
        renderer.dispose();
        mountRef.current?.removeChild(renderer.domElement);
    };
  }, [isExpanded, status, isSpeaking]);

  return (
    <>
      <audio ref={audioRef} src="https://ice1.somafm.com/dronezone-128-mp3" loop preload="none" className="hidden" />

      {/* MODO EXPANDIDO */}
      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-all duration-[1000ms] ${isExpanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        
        {/* CONTAINER DO THREE.JS */}
        <div ref={mountRef} className="absolute inset-0 z-0 pointer-events-none" />

        {/* EFEITOS GLOBAIS SOBRE O THREE.JS */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#000000_100%)] z-[5] pointer-events-none opacity-80" />

        <div className="relative z-10 flex items-center justify-center w-[600px] h-[600px]">
           {/* AURA EXTERNA DOURADA */}
           <div 
             ref={orbAuraRef}
             className="absolute inset-[15%] rounded-full bg-[radial-gradient(circle,_#CCA761_0%,_transparent_70%)] blur-[40px] pointer-events-none animate-[spin_12s_linear_infinite]"
             style={{ opacity: 0.18, mixBlendMode: "screen", transition: "all 0.1s linear" }}
           />

           {/* CORE FREQUENCY LINE (Vibra e pulsa horizontalmente no centro) */}
           <div 
             ref={coreWaveformRef}
             className="absolute w-24 h-1 bg-[#CCA761] rounded-full drop-shadow-[0_0_15px_#CCA761] pointer-events-none"
             style={{ 
               transform: "scaleY(0.1)", 
               opacity: 0.1, 
               transition: "transform 0.05s linear, opacity 0.1s linear",
               boxShadow: "0 0 20px 5px rgba(204, 167, 97, 0.6)"
             }}
           />
        </div>

        {/* BOTAO FECHAR (SEM NAVEGAÇÃO, APENAS DISCONNECT) */}
        <button 
          onClick={async () => {
            if (status === "connected") await conversation.endSession();
            setIsExpanded(false);
          }} 
          className="absolute top-12 right-12 text-[#CCA761] hover:scale-110 hover:text-white transition-transform z-[110]"
        >
          <X size={32} />
        </button>

      </div>

      {/* BOTÃO ORB RECOLHIDO (INALTERADO) */}
      <div className={`fixed bottom-8 right-8 z-[90] transition-all duration-700 ease-in-out ${isExpanded ? "opacity-0 scale-50 pointer-events-none translate-y-10" : "opacity-100 scale-100"}`}>
        <button
          onClick={toggleListening}
          className="relative group w-24 h-24 flex items-center justify-center outline-none"
        >
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#CCA761]/30 animate-[spin_10s_linear_infinite]" />
          <div className="absolute inset-2 rounded-full border border-[#CCA761]/50 animate-[spin_6s_linear_infinite_reverse]" />
          <div className="relative w-12 h-12 bg-[#0a0a0a] rounded-full border border-[#CCA761]/50 flex items-center justify-center transition-all duration-500 group-hover:scale-110 shadow-[inset_0_0_15px_rgba(204,167,97,0.2)]">
            <Scale size={22} className="text-[#CCA761]" />
          </div>
        </button>
      </div>
    </>
  );
}
