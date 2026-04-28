"use client";

import { type ReactNode } from "react";

type LuxVortexCardProps = {
  children: ReactNode;
  className?: string;
};

export function LuxVortexCard({ children, className = "" }: LuxVortexCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.75rem] border border-[#E2C97E]/18 bg-black/42 px-7 py-10 text-center shadow-[0_34px_110px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.06)] outline outline-1 outline-white/[0.035] backdrop-blur-md md:px-12 md:py-14 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_48%,rgba(226,201,126,0.12)_0%,rgba(226,201,126,0.035)_38%,transparent_72%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06)_0%,transparent_28%,rgba(226,201,126,0.06)_100%)] opacity-60" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
