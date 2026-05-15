"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import * as THREE from "three";
import { useOrbState } from "./OrbStateProvider";
import { OrbVisual } from "./OrbVisual";
import { shouldShowWorkingOrb } from "./orb-state-core";

export type OrbVoiceControls = {
  status: string;
  isSpeaking: boolean;
  toggleListening: () => Promise<void>;
  close: () => Promise<void>;
};

export function OrbStage({ voice }: { voice: OrbVoiceControls }) {
  const { state, dismiss } = useOrbState();
  const mountRef = useRef<HTMLDivElement>(null);
  const orbAuraRef = useRef<HTMLDivElement>(null);
  const coreWaveformRef = useRef<HTMLDivElement>(null);

  const isVoiceSource = state.source === "voice";
  const isFaceToFace = isVoiceSource && (state.stage === "summoned" || state.stage === "presenting");
  const isWorking = shouldShowWorkingOrb(state);
  const isOpen = isFaceToFace;
  const isOrbActive = voice.status === "connected" || voice.status === "connecting" || voice.isSpeaking || isWorking;

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!isFaceToFace || prefersReducedMotion || !mountRef.current) return;

    let animationId: number;
    const clock = new THREE.Clock();
    const mountNode = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountNode.appendChild(renderer.domElement);

    const starCount = 1800;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      starPos[i * 3] = (Math.random() - 0.5) * 28;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 18;
      starPos[i * 3 + 2] = Math.random() * -46 + 6;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.032,
      color: 0xE7C676,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    const sphereGeo = new THREE.IcosahedronGeometry(1.4, 16);
    const basePos = sphereGeo.attributes.position.array;
    const numPoints = basePos.length / 3;

    const globeGeo = new THREE.BufferGeometry();
    const globePos = new Float32Array(numPoints * 3);
    const globeCol = new Float32Array(numPoints * 3);
    const randoms = new Float32Array(numPoints);

    for (let i = 0; i < numPoints; i += 1) {
      globePos[i * 3] = basePos[i * 3];
      globePos[i * 3 + 1] = basePos[i * 3 + 1];
      globePos[i * 3 + 2] = basePos[i * 3 + 2];
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

    let currentIntensity = 0;
    let lastTime = 0;
    let accumulatedPhase = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const delta = t - lastTime;
      lastTime = t;

      let targetIntensity = 0;
      let starSpeed = 0.006;

      if (voice.status === "connecting" || voice.status === "disconnecting") {
        targetIntensity = 0.15;
        starSpeed = 0.008;
      } else if (voice.status === "connected") {
        if (voice.isSpeaking) {
          targetIntensity = 1.0;
          starSpeed = 0.009;
        } else {
          targetIntensity = 0.05;
          starSpeed = 0.006;
        }
      }

      const lerpSpeed = targetIntensity < currentIntensity ? 0.035 : 0.12;
      currentIntensity += (targetIntensity - currentIntensity) * lerpSpeed;

      const positions = globeGeo.attributes.position.array as Float32Array;
      const colors = globeGeo.attributes.color.array as Float32Array;

      globe.rotation.y = t * 0.04 + currentIntensity * 0.1;
      globe.rotation.z = t * 0.015;

      const dynamicPhaseSpeed = 0.3 + currentIntensity * 0.8;
      accumulatedPhase += delta * dynamicPhaseSpeed;

      for (let i = 0; i < numPoints; i += 1) {
        const bx = basePos[i * 3];
        const by = basePos[i * 3 + 1];
        const bz = basePos[i * 3 + 2];
        const rnd = randoms[i];
        const baseNoiseAmp = 0.015 + currentIntensity * 0.065;
        const noise = Math.sin(accumulatedPhase * 1.2 + rnd * 15) * baseNoiseAmp;
        const speakAmp = currentIntensity * 1.0;
        const speakPush = speakAmp * (0.09 + rnd * 0.08) * Math.sin(accumulatedPhase * 15 + rnd * 12);
        const expand = 1 + noise + speakPush;
        const yNorm = (by + 1.4) / 2.8;

        positions[i * 3] = bx * expand;
        positions[i * 3 + 1] = by * expand;
        positions[i * 3 + 2] = bz * expand;
        colors[i * 3] = 0.78 + yNorm * 0.22;
        colors[i * 3 + 1] = 0.52 + yNorm * 0.28;
        colors[i * 3 + 2] = 0.08 + yNorm * 0.1;
      }

      globeGeo.attributes.position.needsUpdate = true;
      globeGeo.attributes.color.needsUpdate = true;

      const stars = starGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < starCount; i += 1) {
        stars[i * 3 + 2] += starSpeed;
        if (stars[i * 3 + 2] > 6) {
          stars[i * 3 + 2] = -40;
          stars[i * 3] = (Math.random() - 0.5) * 28;
          stars[i * 3 + 1] = (Math.random() - 0.5) * 18;
        }
      }
      starGeo.attributes.position.needsUpdate = true;

      if (orbAuraRef.current) {
        const scale = 1.05 + currentIntensity * 0.25;
        const opacity = 0.18 + currentIntensity * 0.35;
        orbAuraRef.current.style.transform = `scale(${scale})`;
        orbAuraRef.current.style.opacity = `${opacity}`;
      }

      if (coreWaveformRef.current) {
        const scaleY = currentIntensity < 0.2
          ? 0.1
          : currentIntensity * 1.5 + Math.sin(t * 20) * 0.8 * currentIntensity;
        coreWaveformRef.current.style.transform = `translate(-50%, -50%) scaleY(${scaleY})`;
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
      sphereGeo.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, [isFaceToFace, voice.status, voice.isSpeaking]);

  const handleClose = async () => {
    await voice.close();
    dismiss();
  };

  return (
    <>
      <style>{`
        @keyframes mayusOrbDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -8px, 0) scale(1.015); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mayus-orb-drift { animation: none !important; }
        }
      `}</style>

      <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm transition-all duration-[900ms] motion-reduce:transition-none ${isFaceToFace ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div ref={mountRef} className="absolute inset-0 z-0 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#000000_100%)] z-[5] pointer-events-none opacity-80" />

        <div className="mayus-orb-drift relative z-10 flex items-center justify-center motion-safe:animate-[mayusOrbDrift_7s_ease-in-out_infinite]">
          <OrbVisual
            variant="hero"
            active={isOrbActive || state.stage === "presenting"}
            auraRef={orbAuraRef}
            waveformRef={coreWaveformRef}
          />
        </div>

        <button
          onClick={handleClose}
          className="absolute top-12 right-12 text-[#CCA761] hover:scale-110 hover:text-gray-900 dark:text-white transition-transform z-[110]"
          aria-label="Fechar MAYUSOrb"
        >
          <X size={32} />
        </button>
      </div>

      <div className={`fixed top-24 left-4 md:left-[calc(var(--mayus-dashboard-sidebar-offset,280px)+1.5rem)] z-[95] pointer-events-none transition-all duration-700 ease-out motion-reduce:transition-none ${isWorking ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-4 scale-90"}`}>
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-[#CCA761]/20 blur-xl motion-safe:animate-pulse" />
          <OrbVisual variant="working" active />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#CCA761]/30 bg-black/80 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#f4d58a] shadow-[0_0_22px_rgba(204,167,97,0.22)]">
            executando
          </div>
        </div>
      </div>

      <div className={`fixed bottom-8 right-8 z-[90] transition-all duration-700 ease-in-out motion-reduce:transition-none ${isOpen ? "opacity-0 scale-50 pointer-events-none translate-y-10" : "opacity-100 scale-100"}`}>
        <button
          onClick={voice.toggleListening}
          className="relative group w-24 h-24 flex items-center justify-center outline-none"
          title="Ativar MAYUSOrb"
          aria-label="Ativar MAYUSOrb"
        >
          <OrbVisual variant="idle" active={false} />
        </button>
      </div>
    </>
  );
}
