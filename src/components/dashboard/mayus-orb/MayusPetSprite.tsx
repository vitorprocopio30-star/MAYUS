"use client";

import type { CSSProperties } from "react";
import {
  MAYUS_PET_ATLAS,
  MAYUS_PET_STATES,
  MAYUS_PET_VARIANTS,
  normalizeMayusPetState,
  type MayusPetState,
  type MayusPetVariant,
} from "@/lib/mayus-pet";

type MayusPetSpriteProps = {
  variant: MayusPetVariant;
  state?: MayusPetState;
  size?: number;
  active?: boolean;
  className?: string;
};

export function MayusPetSprite({
  variant,
  state = "idle",
  size = 96,
  active = false,
  className = "",
}: MayusPetSpriteProps) {
  const resolvedState = normalizeMayusPetState(state);
  const stateMeta = MAYUS_PET_STATES[resolvedState];
  const variantMeta = MAYUS_PET_VARIANTS[variant];
  const scale = size / MAYUS_PET_ATLAS.cellWidth;
  const frameWidth = size;
  const frameHeight = MAYUS_PET_ATLAS.cellHeight * scale;
  const sheetWidth = MAYUS_PET_ATLAS.width * scale;
  const sheetHeight = MAYUS_PET_ATLAS.height * scale;
  const rowOffset = stateMeta.row * frameHeight;
  const finalFrameOffset = stateMeta.frameCount * frameWidth;
  const frameSteps = stateMeta.frameCount;
  const rootStyle = {
    width: frameWidth,
    minWidth: frameWidth,
    maxWidth: frameWidth,
    height: frameHeight,
    minHeight: frameHeight,
    maxHeight: frameHeight,
    "--mayus-pet-duration": `${stateMeta.durationMs}ms`,
    "--mayus-pet-float-duration": active ? "5.8s" : "7.2s",
    "--mayus-pet-row-offset": `${rowOffset}px`,
    "--mayus-pet-final-offset": `${finalFrameOffset}px`,
  } as CSSProperties;

  return (
    <span
      className={`mayus-pet-presence relative inline-flex shrink-0 overflow-hidden bg-transparent ${className}`}
      style={rootStyle}
      aria-hidden="true"
      data-mayus-pet-state={resolvedState}
      data-mayus-pet-variant={variant}
    >
      <span
        className="mayus-pet-frame absolute left-0 top-0 block bg-no-repeat"
        style={{
          width: sheetWidth,
          height: sheetHeight,
          backgroundImage: `url(${variantMeta.publicPath})`,
          backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
          filter:
            variant === "black"
              ? "brightness(1.18) contrast(1.12) saturate(1.05)"
              : "brightness(1.03) contrast(1.06)",
        }}
      />
      <style jsx>{`
        .mayus-pet-presence {
          animation: mayusPetPresence var(--mayus-pet-float-duration) ease-in-out infinite;
          contain: layout paint size;
          isolation: isolate;
          line-height: 0;
        }

        .mayus-pet-frame {
          animation: mayusPetFrames var(--mayus-pet-duration) steps(${frameSteps}, end) infinite;
          backface-visibility: hidden;
          image-rendering: auto;
          transform: translate3d(0, calc(var(--mayus-pet-row-offset) * -1), 0);
          transform-origin: left top;
          will-change: transform;
        }

        @keyframes mayusPetFrames {
          from {
            transform: translate3d(0, calc(var(--mayus-pet-row-offset) * -1), 0);
          }
          to {
            transform: translate3d(calc(var(--mayus-pet-final-offset) * -1), calc(var(--mayus-pet-row-offset) * -1), 0);
          }
        }

        @keyframes mayusPetPresence {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(0, -5px, 0) scale(1.012);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mayus-pet-presence,
          .mayus-pet-frame {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}
