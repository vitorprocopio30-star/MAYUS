"use client";

import type { RefObject } from "react";

export type OrbVisualVariant = "idle" | "hero" | "working";

export function OrbVisual({
  variant = "idle",
  active = false,
  auraRef,
  waveformRef,
}: {
  variant?: OrbVisualVariant;
  active?: boolean;
  auraRef?: RefObject<HTMLDivElement>;
  waveformRef?: RefObject<HTMLDivElement>;
}) {
  const sizeClass = variant === "hero"
    ? "h-[min(72vw,620px)] w-[min(72vw,620px)]"
    : variant === "working"
      ? "h-32 w-32"
      : "h-24 w-24";
  const coreInset = variant === "hero" ? "inset-[14%]" : "inset-[12%]";
  const outerSpin = active
    ? "motion-safe:animate-[spin_14s_linear_infinite]"
    : "motion-safe:animate-[spin_22s_linear_infinite]";

  return (
    <div className={`relative ${sizeClass} shrink-0 select-none`} aria-hidden="true">
      <div className={`absolute inset-0 rounded-full border border-[#CCA761]/40 motion-reduce:animate-none ${outerSpin}`} />
      <div className="absolute inset-[7%] rounded-full border border-dashed border-[#f6d47a]/35 motion-safe:animate-[spin_18s_linear_infinite_reverse] motion-reduce:animate-none" />
      <div className="absolute inset-[15%] rounded-full border border-[#ffae35]/40 shadow-[0_0_30px_rgba(255,176,48,0.35)]" />
      <div
        ref={auraRef}
        className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,_rgba(255,190,65,0.42)_0%,_rgba(204,167,97,0.18)_38%,_transparent_72%)] blur-2xl pointer-events-none"
        style={{ opacity: active ? 0.5 : 0.26, mixBlendMode: "screen", transition: "all 0.1s linear" }}
      />
      <div className="absolute inset-[3%] rounded-full bg-[conic-gradient(from_40deg,transparent_0deg,rgba(255,183,44,0.0)_35deg,rgba(255,183,44,0.9)_48deg,rgba(255,183,44,0.0)_72deg,transparent_110deg,rgba(255,231,92,0.85)_138deg,transparent_160deg,transparent_260deg,rgba(255,160,38,0.85)_292deg,transparent_316deg)] opacity-80 blur-[1px] motion-safe:animate-[spin_9s_linear_infinite] motion-reduce:animate-none" />
      <div className={`absolute ${coreInset} rounded-full overflow-hidden shadow-[0_0_45px_rgba(255,174,44,0.45),inset_0_0_34px_rgba(0,0,0,0.85)]`}>
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_28%,rgba(255,246,187,0.9)_0%,rgba(255,205,92,0.42)_18%,rgba(204,167,97,0.18)_42%,rgba(8,7,5,0.96)_76%)]" />
        <div className="absolute inset-[14%] rounded-full border border-[#fff3a3]/20 bg-[conic-gradient(from_210deg,rgba(255,221,112,0.0)_0deg,rgba(255,221,112,0.58)_64deg,rgba(90,58,18,0.12)_128deg,rgba(255,166,39,0.42)_210deg,rgba(255,221,112,0.0)_360deg)] opacity-90 motion-safe:animate-[spin_16s_linear_infinite_reverse] motion-reduce:animate-none" />
        <div className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,223,126,0.95)_0%,rgba(255,168,43,0.32)_36%,rgba(0,0,0,0.2)_70%)] blur-[1px]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_34%_24%,rgba(255,255,255,0.28),transparent_24%),radial-gradient(circle_at_center,transparent_38%,rgba(0,0,0,0.38)_72%,rgba(0,0,0,0.84)_100%)]" />
      </div>
      <div
        ref={waveformRef}
        className="absolute left-1/2 top-1/2 h-1 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffd36c] opacity-20 drop-shadow-[0_0_16px_#ffd36c]"
        style={{
          transform: "translate(-50%, -50%) scaleY(0.1)",
          transition: "transform 0.05s linear, opacity 0.1s linear",
          boxShadow: "0 0 20px 5px rgba(255, 191, 72, 0.35)",
        }}
      />
      <div className={`absolute inset-[29%] rounded-full border border-[#fff3a3]/20 ${active ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""}`} />
    </div>
  );
}
