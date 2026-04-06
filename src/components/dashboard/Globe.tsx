"use client";

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const audioLevelRef = useRef(0); // Tracks the simulated audio volume

  const handleInteraction = () => {
    if (isSpeakingRef.current) {
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      audioLevelRef.current = 0;
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const text = "Olá. Eu sou Mayus. O sistema de inteligência artificial exclusivo do seu escritório. Como posso ajudar a maximizar seus resultados hoje?";
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice for a premium, authoritative tone (varies by OS/Browser)
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95; 
    utterance.pitch = 0.8; 

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
    };

    // Fire on every word boundary to simulate real-time audio reactivity
    utterance.onboundary = (event) => {
      // Spike the audio level based on word length to create dynamic, natural-looking waves
      const intensity = Math.min(1.0, 0.4 + (event.charLength * 0.08));
      audioLevelRef.current = intensity;
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      audioLevelRef.current = 0;
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      audioLevelRef.current = 0;
    };

    window.speechSynthesis.speak(utterance);
  };

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      width = rect.width;
      height = rect.height;
    };

    window.addEventListener('resize', resize);
    resize();

    // Generate grid points for a dotted sphere
    const latLines = 45;
    const lonLines = 90;
    let time = 0;
    
    let currentRadius = 0;
    let currentSpeed = 0.0015;
    let waveAmp = 0;

    const render = () => {
      // Decay the audio level quickly to create sharp, responsive spikes
      audioLevelRef.current *= 0.85;
      
      const baseRadius = Math.min(width, height) * 0.45;
      
      // Target values based on Mayus speaking state and real-time audio level
      // The louder the "voice" (audioLevel), the more it expands
      const targetRadius = isSpeakingRef.current 
        ? baseRadius + (baseRadius * 0.15 * audioLevelRef.current) 
        : baseRadius;
        
      const targetSpeed = isSpeakingRef.current ? 0.005 + (audioLevelRef.current * 0.01) : 0.0015;
      
      // The wave amplitude (scattering) spikes dynamically with the voice
      const targetWaveAmp = isSpeakingRef.current ? (audioLevelRef.current * 45) : 0; 

      // Lerp for smooth but snappy transitions
      if (currentRadius === 0) currentRadius = targetRadius;
      currentRadius += (targetRadius - currentRadius) * 0.2; // Fast response to volume
      currentSpeed += (targetSpeed - currentSpeed) * 0.05;
      waveAmp += (targetWaveAmp - waveAmp) * 0.25; // Fast response to volume

      time += currentSpeed; 
      ctx.clearRect(0, 0, width, height);

      const rotX = 0.15; // Slight tilt
      const rotY = time;

      const projected: { x: number; y: number; z: number; scale: number }[][] = [];

      // Calculate 3D to 2D projections
      for (let i = 0; i <= latLines; i++) {
        projected[i] = [];
        const phi = (i * Math.PI) / latLines;
        for (let j = 0; j < lonLines; j++) {
          const theta = (j * 2 * Math.PI) / lonLines;
          
          // High frequency distortion that gets more chaotic when speaking louder
          const dynamicFreqX = 15 + (audioLevelRef.current * 10);
          const dynamicFreqY = 25 + (audioLevelRef.current * 10);
          
          const frequency = Math.sin(phi * dynamicFreqX + time * 20) * Math.cos(theta * dynamicFreqY + time * 30);
          const r = currentRadius + waveAmp * frequency;
          
          const x = r * Math.sin(phi) * Math.cos(theta);
          const y = r * Math.cos(phi);
          const z = r * Math.sin(phi) * Math.sin(theta);

          // Rotate Y
          let x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
          let z1 = x * Math.sin(rotY) + z * Math.cos(rotY);

          // Rotate X
          let y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
          let z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);

          const fov = currentRadius * 4;
          const scale = fov / (fov + z2);
          const x2d = x1 * scale + width / 2;
          const y2d = y2 * scale + height / 2;

          projected[i][j] = { x: x2d, y: y2d, z: z2, scale };
        }
      }

      // Draw dots (particle sphere)
      for (let i = 0; i <= latLines; i++) {
        for (let j = 0; j < lonLines; j++) {
          const p = projected[i][j];
          const isBack = p.z > 0;
          
          // Calculate opacity based on depth and speaking state
          let dotOpacity = 0;
          if (isBack) {
            dotOpacity = isSpeakingRef.current ? 0.08 : 0.03;
          } else {
            // Fade out towards the edges/back for a 3D volume effect
            const depthFactor = Math.max(0, 1 - (p.z / currentRadius));
            dotOpacity = Math.max(0.1, (isSpeakingRef.current ? 1.0 : 0.8) * depthFactor);
          }
          
          // Particles get slightly larger when speaking loudly
          const dotSize = (isSpeakingRef.current ? 1.8 + (audioLevelRef.current * 1.5) : 1.4) * p.scale;
          
          // Pure gold color, shifting to bright white-gold when speaking loudly
          const color = isSpeakingRef.current 
            ? `rgba(255, ${240 + audioLevelRef.current * 15}, ${180 + audioLevelRef.current * 75}, ${dotOpacity})` 
            : `rgba(201, 168, 76, ${dotOpacity})`;
          
          ctx.fillStyle = color;
          
          // Add glow to front dots, intensifying with volume
          if (!isBack) {
             ctx.shadowBlur = isSpeakingRef.current ? 10 + (audioLevelRef.current * 15) : 6;
             ctx.shadowColor = isSpeakingRef.current ? `rgba(255, 230, 150, ${0.6 + audioLevelRef.current * 0.4})` : `rgba(201, 168, 76, 0.5)`;
          } else {
             ctx.shadowBlur = 0;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-[500px] lg:h-[700px] flex items-center justify-center scale-110 cursor-pointer group"
      onClick={handleInteraction}
    >
      {/* Thick Continuous Energy Beam */}
      <div className={`absolute top-[-20%] bottom-[45%] left-1/2 -translate-x-1/2 w-[1200px] pointer-events-none transition-all duration-500 z-0 ${isSpeaking ? 'opacity-100 scale-x-110' : 'opacity-70 scale-x-100'}`}>
        <svg viewBox="0 0 1200 600" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="beam-core" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="80%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#CCA761" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="beam-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#CCA761" stopOpacity="0.8" />
              <stop offset="80%" stopColor="#8c6d36" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8c6d36" stopOpacity="0" />
            </linearGradient>
            <filter id="blur-heavy">
              <feGaussianBlur stdDeviation="40" />
            </filter>
            <filter id="blur-medium">
              <feGaussianBlur stdDeviation="20" />
            </filter>
            <filter id="blur-light">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          {/* Outer Heavy Glow */}
          <path d="M 450 0 L 750 0 L 750 400 C 750 550, 950 600, 1200 600 L 0 600 C 250 600, 450 550, 450 400 Z" fill="url(#beam-glow)" filter="url(#blur-heavy)" />

          {/* Medium Glow */}
          <path d="M 520 0 L 680 0 L 680 420 C 680 560, 850 600, 1200 600 L 0 600 C 350 600, 520 560, 520 420 Z" fill="url(#beam-glow)" filter="url(#blur-medium)" />

          {/* Bright Core */}
          <path d="M 570 0 L 630 0 L 630 450 C 630 580, 800 600, 1200 600 L 0 600 C 400 600, 570 580, 570 450 Z" fill="url(#beam-core)" filter="url(#blur-light)" />
          
          {/* Intense Center Line */}
          <path d="M 590 0 L 610 0 L 610 470 C 610 590, 800 600, 1200 600 L 0 600 C 400 600, 590 590, 590 470 Z" fill="#FFFFFF" filter="url(#blur-light)" />
        </svg>
        
        {/* Animated Vertical Lines inside the beam to simulate flow */}
        <div className="absolute inset-0 left-1/2 -translate-x-1/2 w-[40px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_40%,transparent_90%)]">
           <motion.div
             animate={{ y: ['-50%', '0%'] }}
             transition={{ duration: isSpeaking ? 0.2 : 0.6, repeat: Infinity, ease: "linear" }}
             className="w-full h-[200%] opacity-70"
             style={{
               backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 10px, rgba(255,255,255,0.8) 10px, rgba(255,255,255,0.8) 20px)',
               backgroundSize: '100% 40px'
             }}
           />
        </div>
      </div>

      {/* Core Glow */}
      <div className={`absolute inset-0 rounded-full pointer-events-none scale-75 transition-all duration-500 z-0 ${isSpeaking ? 'bg-[#CCA761]/20 opacity-20 blur-[120px]' : 'bg-[#CCA761]/10 opacity-10 blur-[100px]'}`} />
      
      <canvas 
        ref={canvasRef} 
        className="w-full h-full z-10"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Mayus Status Badge */}
      <motion.div 
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0 }}
        className={`absolute top-10 left-1/2 -translate-x-1/2 backdrop-blur-md border px-6 py-2 rounded-full text-[10px] uppercase tracking-[3px] z-10 transition-all duration-500 flex items-center gap-3 ${isSpeaking ? 'bg-[#CCA761]/20 border-[#CCA761]/60 text-white shadow-[0_0_30px_rgba(255,215,0,0.4)] scale-110' : 'bg-[#0D0D0D]/80 border-[#CCA761]/30 text-[#CCA761] shadow-[0_0_20px_rgba(201,168,76,0.1)]'}`}
      >
        {isSpeaking && (
          <span className="flex gap-1">
            <span className="w-1 h-1 bg-white rounded-full animate-ping" />
            <span className="w-1 h-1 bg-white rounded-full animate-ping delay-75" />
            <span className="w-1 h-1 bg-white rounded-full animate-ping delay-150" />
          </span>
        )}
        {isSpeaking ? 'Mayus: Falando...' : 'Mayus AI: Clique para ouvir'}
      </motion.div>

      {/* Floating Badges */}
      <motion.div 
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0 }}
        className={`absolute top-32 left-0 bg-[#0D0D0D]/80 backdrop-blur-md border border-[#CCA761]/30 px-4 py-2 rounded-full text-[10px] uppercase tracking-[3px] text-[#CCA761] z-10 shadow-[0_0_20px_rgba(201,168,76,0.1)] transition-opacity duration-500 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
      >
        LGPD Compliant
      </motion.div>
      <motion.div 
        animate={{ y: [0, -15, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className={`absolute bottom-32 left-10 bg-[#0D0D0D]/80 backdrop-blur-md border border-[#CCA761]/30 px-4 py-2 rounded-full text-[10px] uppercase tracking-[3px] text-[#CCA761] z-10 shadow-[0_0_20px_rgba(201,168,76,0.1)] transition-opacity duration-500 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
      >
        Multi-Tenant
      </motion.div>
      <motion.div 
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className={`absolute top-40 right-0 bg-[#0D0D0D]/80 backdrop-blur-md border border-[#CCA761]/30 px-4 py-2 rounded-full text-[10px] uppercase tracking-[3px] text-[#CCA761] z-10 shadow-[0_0_20px_rgba(201,168,76,0.1)] transition-opacity duration-500 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
      >
        7 LLMs
      </motion.div>
      <motion.div 
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        className={`absolute bottom-20 right-10 bg-[#0D0D0D]/80 backdrop-blur-md border border-[#CCA761]/30 px-4 py-2 rounded-full text-[10px] uppercase tracking-[3px] text-[#CCA761] z-10 shadow-[0_0_20px_rgba(201,168,76,0.1)] transition-opacity duration-500 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
      >
        WhatsApp Official
      </motion.div>
    </div>
  );
}
