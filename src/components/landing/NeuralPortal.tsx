"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Cormorant_Garamond } from "next/font/google";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], style: ["normal", "italic"] });

interface NeuralPortalProps {
  onEnter: () => void;
}

export const NeuralPortal = ({ onEnter }: NeuralPortalProps) => {
  const [loading, setLoading] = useState(true);
  const [clicked, setClicked] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Simular carregamento inicial dos "pesados" sistemas neurais
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleEnter = () => {
    if (clicked) return;
    setClicked(true);
    // Tempo para a animação de zoom exponencial terminar
    setTimeout(onEnter, 2800);
  };

  if (!mounted) return <div className="fixed inset-0 bg-white dark:bg-[#050505] z-[9999]" />;

  return (
    <div className="fixed inset-0 z-[9999] bg-white dark:bg-[#050505] flex items-center justify-center overflow-hidden">
      {/* Cinematic Grain Overlays */}
      <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-t from-black via-transparent to-black opacity-60" />
      
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-8 z-20"
          >
            <div className="relative w-40 h-[1px] bg-gray-100 dark:bg-white/10 overflow-hidden">
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-[#CCA761] to-transparent shadow-[0_0_10px_#CCA761]"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <span className={`text-[#CCA761] text-xs font-black tracking-[1em] uppercase ${cormorant.className} animate-pulse`}>
                Sincronizando
              </span>
              <span className="text-gray-700 dark:text-gray-300 dark:text-white/20 text-[8px] font-bold tracking-[0.5em] uppercase">
                Rede Neural Mayus Core v2.0
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="portal-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative w-full h-full flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ 
                scale: clicked ? 45 : 1, // Super zoom na pupila
                opacity: 1,
                rotate: clicked ? 15 : 0
              }}
              transition={{ 
                duration: clicked ? 3 : 2, 
                ease: clicked ? [0.64, 0, 0.78, 0] : [0.22, 1, 0.36, 1] 
              }}
              className="relative w-[300px] h-[300px] md:w-[650px] md:h-[650px] group cursor-pointer"
              onClick={handleEnter}
            >
              <Image 
                src="/neural-portal-eye.png" 
                alt="Neural Portal Eye" 
                fill 
                className={`object-contain transition-all duration-1000 ${clicked ? 'brightness-150' : 'hover:brightness-110 drop-shadow-[0_0_30px_rgba(204,167,97,0.2)]'}`}
                priority
              />
              
              {/* Gold Ring Halo */}
              {!clicked && (
                <motion.div 
                  animate={{ 
                    rotate: 360,
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ 
                    rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                    scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                  }}
                  className="absolute inset-[-10%] border border-[#CCA761]/10 rounded-full pointer-events-none"
                />
              )}
            </motion.div>

            {/* Instruction Overlay */}
            {!clicked && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="absolute bottom-20 flex flex-col items-center gap-6"
              >
                <div className="flex flex-col items-center gap-3">
                  <span className={`text-gray-900 dark:text-white text-2xl md:text-4xl ${cormorant.className} italic tracking-widest`}>
                    O Olhar da <span className="text-[#CCA761]">Soberania</span>
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-[#CCA761]/40" />
                    <span className="text-[9px] font-black tracking-[0.5em] text-[#CCA761] uppercase">Entrada Reservada</span>
                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-[#CCA761]/40" />
                  </div>
                </div>
                
                <button 
                  onClick={handleEnter}
                  className="group relative px-12 py-5 border border-[#CCA761]/30 hover:border-[#CCA761] transition-all duration-500 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[#CCA761]/0 group-hover:bg-[#CCA761]/10 transition-colors" />
                  <span className="relative z-10 text-[10px] font-black tracking-[0.8em] text-[#CCA761] uppercase">Acessar o Kernel</span>
                </button>
              </motion.div>
            )}

            {/* Flash Effect on Transition */}
            {clicked && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, delay: 1.5 }}
                className="absolute inset-0 bg-white z-[100] pointer-events-none mix-blend-overlay"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
