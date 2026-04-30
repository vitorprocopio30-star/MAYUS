"use client";

import { type ReactNode } from "react";

type LuxVortexCardProps = {
  children: ReactNode;
  className?: string;
};

export function LuxVortexCard({ children, className = "" }: LuxVortexCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.75rem] border border-[#CCA761]/30 bg-[#050505]/60 px-7 py-10 text-center shadow-[0_40px_120px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] outline outline-1 outline-white/[0.05] backdrop-blur-xl md:px-12 md:py-14 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_48%,rgba(204,167,97,0.18)_0%,rgba(204,167,97,0.05)_38%,transparent_72%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,transparent_28%,rgba(204,167,97,0.08)_100%)] opacity-70" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
