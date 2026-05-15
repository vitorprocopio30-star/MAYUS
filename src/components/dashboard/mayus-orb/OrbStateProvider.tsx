"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  extractMayusOrbEventFromBrainStep,
  initialOrbState,
  orbStateReducer,
  type OrbEventSource,
  type OrbState,
  type OrbTransitionOptions,
} from "./orb-state-core";

type OrbStateContextValue = {
  state: OrbState;
  summon: (options?: OrbTransitionOptions) => void;
  startWorking: (options?: OrbTransitionOptions) => void;
  present: (options?: OrbTransitionOptions) => void;
  dismiss: () => void;
  reset: () => void;
};

const OrbStateContext = createContext<OrbStateContextValue | null>(null);

function applySource(options: OrbTransitionOptions | undefined, source: OrbEventSource) {
  return {
    ...(options || {}),
    source: options?.source || source,
  };
}

export function OrbStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(orbStateReducer, initialOrbState);
  const { tenantId } = useUserProfile();
  const supabase = useMemo(() => createClient(), []);

  const summon = useCallback((options?: OrbTransitionOptions) => {
    dispatch({ type: "summon", ...applySource(options, "local_fallback") });
  }, []);

  const startWorking = useCallback((options?: OrbTransitionOptions) => {
    dispatch({ type: "start_working", ...applySource(options, "local_fallback") });
  }, []);

  const present = useCallback((options?: OrbTransitionOptions) => {
    dispatch({ type: "present", ...applySource(options, "local_fallback") });
  }, []);

  const dismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`mayus_orb:brain_steps:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "brain_steps",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const orbEvent = extractMayusOrbEventFromBrainStep(payload.new);
          if (!orbEvent) return;

          if (orbEvent.state === "working") {
            dispatch({ type: "start_working", source: "brain_realtime", event: orbEvent });
            return;
          }

          if (orbEvent.state === "presenting") {
            dispatch({ type: "present", source: "brain_realtime", event: orbEvent });
            return;
          }

          if (orbEvent.state === "summoned") {
            dispatch({ type: "summon", source: "brain_realtime", event: orbEvent });
            return;
          }

          dispatch({ type: "dismiss" });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId]);

  useEffect(() => {
    if (state.stage !== "presenting") return;

    const timeout = window.setTimeout(() => {
      dispatch({
        type: "settle_presentation",
        nextStage: state.source === "voice" ? "summoned" : "idle",
      });
    }, state.source === "voice" ? 2400 : 2200);

    return () => window.clearTimeout(timeout);
  }, [state.stage, state.source, state.updatedAt]);

  const value = useMemo<OrbStateContextValue>(
    () => ({
      state,
      summon,
      startWorking,
      present,
      dismiss,
      reset,
    }),
    [dismiss, present, reset, startWorking, state, summon]
  );

  return <OrbStateContext.Provider value={value}>{children}</OrbStateContext.Provider>;
}

export function useOrbState() {
  const context = useContext(OrbStateContext);
  if (!context) {
    throw new Error("useOrbState deve ser usado dentro de OrbStateProvider.");
  }
  return context;
}
