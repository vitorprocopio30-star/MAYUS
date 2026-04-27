"use client";

/* eslint-disable @next/next/no-img-element -- Canvas frame fallback needs a plain browser image. */

import { useCallback, useEffect, useRef, useState } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { BEATS, CINE_FRAME_COUNT, cineFramePath } from "@/lib/cinematic";

export function CinematicReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const h2ControlRef = useRef<HTMLHeadingElement | null>(null);
  const h2ExecutionRef = useRef<HTMLHeadingElement | null>(null);
  const h2SovereigntyRef = useRef<HTMLHeadingElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const seqReadoutRef = useRef<HTMLSpanElement | null>(null);

  const framesRef = useRef<HTMLImageElement[]>([]);
  const tickingRef = useRef(false);
  const loadedRef = useRef(true);
  const lastFrameRef = useRef(-1);
  const prevVisibleIdsRef = useRef("");

  const [loadProgress, setLoadProgress] = useState(1);
  const [loaded, setLoaded] = useState(true);
  const [visibleBeats, setVisibleBeats] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let loadedCount = 0;
    const imgs: HTMLImageElement[] = [];

    for (let i = 1; i <= CINE_FRAME_COUNT; i++) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        loadedCount++;
        setLoadProgress(loadedCount / CINE_FRAME_COUNT);
        if (!loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        loadedCount++;
        setLoadProgress(loadedCount / CINE_FRAME_COUNT);
        if (loadedCount === CINE_FRAME_COUNT && !loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      };
      img.src = cineFramePath(i);
      imgs.push(img);
    }
    framesRef.current = imgs;

    return () => {
      cancelled = true;
    };
  }, []);

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const img = framesRef.current[index];
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = cw / ch;

    let drawW: number;
    let drawH: number;
    if (canvasRatio > imgRatio) {
      drawW = cw;
      drawH = cw / imgRatio;
    } else {
      drawH = ch;
      drawW = ch * imgRatio;
    }

    const scale = window.innerWidth <= 768 ? 0.98 : 0.78;
    drawW *= scale;
    drawH *= scale;

    const drawX = (cw - drawW) / 2 - cw * 0.1;
    const drawY = (ch - drawH) / 2 + ch * 0.01;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    drawFrame(lastFrameRef.current >= 0 ? lastFrameRef.current : 0);
  }, [drawFrame]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    if (!loaded) return;
    drawFrame(0);
    lastFrameRef.current = 0;
  }, [loaded, drawFrame]);

  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;

      requestAnimationFrame(() => {
        tickingRef.current = false;
        const section = sectionRef.current;
        if (!section || !loadedRef.current) return;

        const rect = section.getBoundingClientRect();
        const scrollable = section.offsetHeight - window.innerHeight;
        const progress =
          scrollable <= 0
            ? 0
            : Math.min(1, Math.max(0, -rect.top / scrollable));

        const frameIndex = Math.min(
          CINE_FRAME_COUNT - 1,
          Math.floor(progress * CINE_FRAME_COUNT),
        );
        if (frameIndex !== lastFrameRef.current) {
          lastFrameRef.current = frameIndex;
          drawFrame(frameIndex);
        }

        if (h2ControlRef.current) {
          const op = Math.min(1, Math.max(0, (0.35 - progress) / 0.1));
          h2ControlRef.current.style.opacity = String(op);
        }

        if (h2ExecutionRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.32) / 0.08)) * Math.min(1, Math.max(0, (0.68 - progress) / 0.08));
          h2ExecutionRef.current.style.opacity = String(op);
        }

        if (h2SovereigntyRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.65) / 0.1));
          h2SovereigntyRef.current.style.opacity = String(op);
        }

        if (outroRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.86) / 0.06));
          outroRef.current.style.opacity = String(op);
          outroRef.current.style.transform = `translateY(${(1 - op) * 14}px)`;
        }

        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${progress})`;
        }

        if (seqReadoutRef.current) {
          const n = Math.min(CINE_FRAME_COUNT, frameIndex + 1);
          seqReadoutRef.current.textContent =
            `SEQ ${String(n).padStart(3, "0")} / ${CINE_FRAME_COUNT}`;
        }

        const newVisible = new Set<string>();
        for (const b of BEATS) {
          if (progress >= b.show && progress <= b.hide) newVisible.add(b.id);
        }
        const newIds = Array.from(newVisible).sort().join(",");
        if (newIds !== prevVisibleIdsRef.current) {
          prevVisibleIdsRef.current = newIds;
          setVisibleBeats(newVisible);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [drawFrame]);

  return (
    <section
      ref={sectionRef}
      id="cinematic"
      className="scroll-animation relative border-t border-white/5 bg-background"
    >
      <div
        className="sticky top-0 min-h-[100dvh] w-full overflow-hidden bg-background"
        style={{ height: "100dvh", willChange: "transform", transform: "translateZ(0)" }}
      >
        <div className="absolute inset-0">
          <img
            src={cineFramePath(1)}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ transform: "translate(-10%, 1%) scale(0.78)" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ 
              willChange: "contents", 
              transform: "translateZ(0)",
              filter: "contrast(1.05) brightness(1.05)" 
            }}
          />
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 36%, rgba(0,0,0,0.74) 68%, rgba(0,0,0,0.98) 100%), linear-gradient(180deg, transparent 0%, transparent 72%, rgba(0,0,0,0.72) 92%, #000 100%), radial-gradient(120% 80% at 50% 90%, transparent 24%, rgba(10,10,11,0.5) 70%, rgba(10,10,11,0.9) 100%)",
          }}
        />

        <div className="pointer-events-none absolute left-6 top-24 text-[#CCA761] md:left-10 md:top-28">
          <HudFrame corner="tl" size={26} />
        </div>
        <div className="pointer-events-none absolute right-6 top-24 text-[#CCA761] md:right-10 md:top-28">
          <HudFrame corner="tr" size={26} />
        </div>
        <div className="pointer-events-none absolute bottom-14 left-6 text-[#CCA761] md:bottom-16 md:left-10">
          <HudFrame corner="bl" size={26} />
        </div>
        <div className="pointer-events-none absolute bottom-14 right-6 text-[#CCA761] md:bottom-16 md:right-10">
          <HudFrame corner="br" size={26} />
        </div>

        <div className="pointer-events-none absolute right-6 top-24 z-10 flex max-w-[44ch] flex-col items-end gap-6 text-right md:right-12 md:top-28">
          <EyebrowBadge>ORQUESTRAÇÃO // MAYUS</EyebrowBadge>
          <div className="grid grid-cols-1 grid-rows-1 self-stretch min-h-[116px] md:min-h-[146px]">
            <h2
              ref={h2ControlRef}
              className="font-display col-start-1 row-start-1 text-5xl font-semibold leading-[1.02] tracking-normal text-white md:text-6xl lg:text-7xl"
              style={{ transition: "opacity 240ms ease-out" }}
            >
              O humano fica no
              <br />
              <span className="text-[#CCA761]">comando.</span>
            </h2>
            <h2
              ref={h2ExecutionRef}
              className="font-display col-start-1 row-start-1 text-5xl font-semibold leading-[1.02] tracking-normal text-white md:text-6xl lg:text-7xl"
              style={{ opacity: 0, transition: "opacity 240ms ease-out" }}
            >
              O MAYUS
              <br />
              <span className="text-[#CCA761]">executa.</span>
            </h2>
            <h2
              ref={h2SovereigntyRef}
              className="font-display col-start-1 row-start-1 text-5xl font-semibold leading-[1.02] tracking-normal text-white md:text-6xl lg:text-7xl"
              style={{ opacity: 0, transition: "opacity 240ms ease-out" }}
            >
              A operação ganha
              <br />
              <span className="text-[#CCA761]">soberania.</span>
            </h2>
          </div>
          <p className="max-w-[42ch] rounded-xl border border-white/10 bg-black/45 p-4 font-sans text-sm leading-relaxed text-zinc-300 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-md md:text-base">
            O MAYUS age em tempo real: monitora tribunais, organiza movimentações, antecipa prazos críticos e prepara minutas com contexto do caso. A tecnologia reduz a fricção operacional para que sua equipe foque em estratégia, atendimento consultivo e revisão final.
          </p>
        </div>

        <div className="pointer-events-none absolute left-6 top-20 z-10 flex items-center gap-2 md:left-10 md:top-24">
          <div className="h-px w-8 bg-[#CCA761]/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Registro &mdash; ativo
          </span>
        </div>

        <div className="pointer-events-none absolute right-6 top-20 z-10 flex items-center gap-3 md:right-10 md:top-24">
          <span
            ref={seqReadoutRef}
            className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#CCA761]"
          >
            SEQ 001 / {CINE_FRAME_COUNT}
          </span>
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.85)]"
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-6 mb-3 h-px bg-white/10 md:mx-10">
            <div
              ref={progressFillRef}
              className="h-full origin-left bg-[#CCA761]"
              style={{ transform: "scaleX(0)", transition: "transform 80ms linear" }}
            />
          </div>
          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:mx-10">
            <span>SISTEMA // SOB CONTROLE</span>
            <span>MAYUS // PLAYBACK</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {BEATS.map((b, i) => {
          const visible = visibleBeats.has(b.id);
          const position =
            i === 0
              ? "top-[24%] left-6 md:left-12"
              : i === 1
              ? "top-1/2 -translate-y-1/2 left-6 md:left-12"
              : "bottom-24 left-6 md:bottom-28 md:left-12";
          return (
            <div
              key={b.id}
              className={`pointer-events-none absolute ${position} z-20 hidden w-[420px] max-w-[90vw] md:block`}
            >
              <figure
                className={`card-surface pointer-events-auto p-6 transition-all duration-400 ease-out ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
                }`}
              >
                <span className="mb-2 inline-block font-mono text-[10px] uppercase tracking-[0.28em] text-[#CCA761]">
                  {b.label}
                </span>
                <blockquote className="font-display text-2xl font-medium leading-snug tracking-normal text-white">
                  &ldquo;{b.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between">
                  <span className="font-sans text-sm text-zinc-300">{b.speaker}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                    {b.film}
                  </span>
                </figcaption>
              </figure>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 top-[36%] z-20 flex flex-col gap-3 px-6 md:hidden">
          {BEATS.map((b) => {
            const visible = visibleBeats.has(b.id);
            return (
              <figure
                key={b.id}
                className={`card-surface pointer-events-auto p-5 transition-all duration-400 ease-out ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
              >
                <span className="mb-2 inline-block font-mono text-[9px] uppercase tracking-[0.24em] text-[#CCA761]">
                  {b.label}
                </span>
                <blockquote className="font-display text-xl font-medium leading-snug text-white">
                  &ldquo;{b.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 flex items-center justify-between">
                  <span className="font-sans text-xs text-zinc-300">{b.speaker}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                    {b.film}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        {!loaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background px-6">
            <EyebrowBadge>MAYUS // RENDERIZANDO CENA</EyebrowBadge>
            <div className="h-px w-60 bg-white/10 md:w-80">
              <div
                className="h-full bg-[#CCA761] transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(loadProgress * 100)}%` }}
              />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Carregando sequência &nbsp;&middot;&nbsp; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
