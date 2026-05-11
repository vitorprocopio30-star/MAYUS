"use client";

import { OrbStage } from "@/components/dashboard/mayus-orb/OrbStage";
import { OrbVoiceSession } from "@/components/dashboard/mayus-orb/OrbVoiceSession";

export function MAYUSOrb() {
  return (
    <OrbVoiceSession>
      {(voice) => <OrbStage voice={voice} />}
    </OrbVoiceSession>
  );
}
