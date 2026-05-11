"use client";

import { useCallback, type ReactNode } from "react";
import { useConversation } from "@elevenlabs/react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MAYUS_ORB_VISUAL_CHANGE_MESSAGE } from "@/lib/brain/orb-events";
import { useOrbState } from "./OrbStateProvider";
import type { OrbVoiceControls } from "./OrbStage";

function normalizeRole(role: string | undefined) {
  return (role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeToolPayload(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : { value: payload };
}

function promptFromPayload(payload: Record<string, unknown>) {
  if (typeof payload.prompt === "string") return payload.prompt;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.instruction === "string") return payload.instruction;
  return undefined;
}

export function OrbVoiceSession({
  children,
}: {
  children: (voice: OrbVoiceControls) => ReactNode;
}) {
  const { role, profile } = useUserProfile();
  const { summon, startWorking, present, dismiss } = useOrbState();

  const invokePrimaryBrain = useCallback(async (toolName: string, payload: unknown = {}) => {
    startWorking({
      source: "voice",
      message: MAYUS_ORB_VISUAL_CHANGE_MESSAGE,
    });
    toast.message("MAYUS em execucao", { description: MAYUS_ORB_VISUAL_CHANGE_MESSAGE });

    const normalizedPayload = normalizeToolPayload(payload);
    const response = await fetch("/api/agent/voice/brain-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName,
        toolPayload: normalizedPayload,
        prompt: promptFromPayload(normalizedPayload),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      present({
        source: "voice",
        event: data?.orb,
        message: data?.error || "O MAYUS encontrou um bloqueio e vai mostrar o que aconteceu.",
      });
      throw new Error(data?.error || "Falha ao consultar o cerebro principal.");
    }

    present({
      source: "voice",
      event: data?.orb,
      message: data?.orb?.message,
    });

    return data?.reply || "Missao registrada no cerebro principal do MAYUS.";
  }, [present, startWorking]);

  const conversation = useConversation({
    clientTools: {
      consultar_cerebro_principal: async (payload) => invokePrimaryBrain("consultar_cerebro_principal", payload),
      ask_mayus_brain: async (payload) => invokePrimaryBrain("ask_mayus_brain", payload),
      executar_no_mayus: async (payload) => invokePrimaryBrain("executar_no_mayus", payload),
      trocar_fundo_tema: async (payload) => invokePrimaryBrain("trocar_fundo_tema", payload),
      abrir_agenda: async (payload) => invokePrimaryBrain("abrir_agenda", payload),
      criar_tarefa_n8n_master: async (payload) => invokePrimaryBrain("criar_tarefa_n8n_master", payload),
      memorizar_informacao_intima: async (payload) => invokePrimaryBrain("memorizar_informacao_intima", payload),
    },
    onConnect: () => {},
    onDisconnect: () => {
      dismiss();
    },
    onError: (err) => {
      console.error("[ElevenLabs]", err);
      toast.error("Erro na sincronia com o Agente.");
      dismiss();
    },
  });

  const close = useCallback(async () => {
    if (conversation.status === "connected") {
      await conversation.endSession();
    }
    dismiss();
  }, [conversation, dismiss]);

  const toggleListening = useCallback(async () => {
    const allowedRoles = ["admin", "socio", "administrador"];
    if (!allowedRoles.includes(normalizeRole(role))) {
      toast.error("Modulo vocal MAYUS restrito ao nivel executivo.");
      return;
    }

    if (conversation.status === "connected") {
      await close();
      return;
    }

    if (conversation.status !== "disconnected") return;

    summon({ source: "voice" });

    try {
      const response = await fetch("/api/agent/voice/signed-url");
      if (!response.ok) throw new Error("Falha ao obter URL segura");

      const { signed_url } = await response.json();
      if (!signed_url) throw new Error("URL vazia");

      await conversation.startSession({
        signedUrl: signed_url,
        dynamicVariables: {
          nome_usuario: profile?.full_name || "Doutor",
          modo_operacao: "O ElevenLabs e apenas a camada de voz. Toda decisao, memoria e execucao devem ser solicitadas ao cerebro principal do MAYUS pelas clientTools disponiveis.",
        },
      });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao iniciar o shell de voz do MAYUS.");
      dismiss();
    }
  }, [close, conversation, dismiss, profile?.full_name, role, summon]);

  return (
    <>
      {children({
        status: conversation.status,
        isSpeaking: conversation.isSpeaking,
        toggleListening,
        close,
      })}
    </>
  );
}
