"use client";

import { OrbStage } from "@/components/dashboard/mayus-orb/OrbStage";
import { OrbVoiceSession } from "@/components/dashboard/mayus-orb/OrbVoiceSession";
import { usePathname } from "next/navigation";

export function MAYUSOrb() {
  const pathname = usePathname();

  if (pathname === "/dashboard/mayus") return null;

  return (
    <OrbVoiceSession>
      {(voice) => <OrbStage voice={voice} />}
    </OrbVoiceSession>
  );
}
