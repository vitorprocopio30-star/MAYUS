"use client";

/* eslint-disable @next/next/no-img-element -- Canvas frame fallback needs a plain browser image. */

import { useCallback, useEffect, useRef, useState } from "react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import { HudFrame } from "@/components/ui/HudFrame";
import { DIALOGUES, FRAME_COUNT, HERO_TEXT_FADE_END, framePath } from "@/lib/hero";

const HERO_MEDIA_SCALE = 0.84;
const HERO_MEDIA_OFFSET_X = 0.12;
const HERO_MEDIA_OFFSET_Y = 0.18;

export function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heroTextRef = useRef<HTMLDivElement | null>(null);
  const bigLeftTextRef = useRef<HTMLDivElement | null>(null);
  const thirdTextRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const powerReadoutRef = useRef<HTMLSpanElement | null>(null);

  const framesRef = useRef<HTMLImageElement[]>([]);
  const tickingRef = useRef(false);
  const loadedRef = useRef(true);
  const lastFrameRef = useRef(-1);
  const prevVisibleIdsRef = useRef("");

  const [loadProgress, setLoadProgress] = useState(1);
  const [loaded, setLoaded] = useState(true);
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let loadedCount = 0;
    const imgs: HTMLImageElement[] = [];

    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        loadedCount++;
        setLoadProgress(loadedCount / FRAME_COUNT);
        if (!loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        loadedCount++;
        setLoadProgress(loadedCount / FRAME_COUNT);
        if (loadedCount === FRAME_COUNT && !loadedRef.current) {
          loadedRef.current = true;
          setLoaded(true);
        }
      };
      img.src = framePath(i);
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

    let baseW: number;
    let baseH: number;
    if (canvasRatio > imgRatio) {
      baseW = cw;
      baseH = cw / imgRatio;
    } else {
      baseH = ch;
      baseW = ch * imgRatio;
    }

    const scale = HERO_MEDIA_SCALE;
    const drawW = Math.floor(baseW * scale);
    const drawH = Math.floor(baseH * scale);
    const drawX = Math.floor((cw - drawW) / 2 + cw * HERO_MEDIA_OFFSET_X);
    const drawY = Math.floor((ch - drawH) / 2 + ch * HERO_MEDIA_OFFSET_Y);

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
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx) ctx.scale(1, 1);
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
          FRAME_COUNT - 1,
          Math.floor(progress * FRAME_COUNT),
        );
        if (frameIndex !== lastFrameRef.current) {
          lastFrameRef.current = frameIndex;
          drawFrame(frameIndex);
        }

        if (heroTextRef.current) {
          const opacity = Math.max(0, 1 - progress / HERO_TEXT_FADE_END);
          heroTextRef.current.style.opacity = String(opacity);
          heroTextRef.current.style.transform = `translateY(${(1 - opacity) * 12}px)`;
        }

        if (bigLeftTextRef.current) {
          const fadeIn = Math.min(1, Math.max(0, (progress - 0.1) / 0.08));
          const fadeOut = Math.min(1, Math.max(0, (0.45 - progress) / 0.08));
          const op = Math.min(fadeIn, fadeOut);
          bigLeftTextRef.current.style.opacity = String(op);
          bigLeftTextRef.current.style.transform = `translateY(${(1 - op) * 14}px)`;
        }

        if (thirdTextRef.current) {
          const op = Math.min(1, Math.max(0, (progress - 0.5) / 0.08));
          thirdTextRef.current.style.opacity = String(op);
          thirdTextRef.current.style.transform = `translateY(${(1 - op) * 14}px)`;
        }

        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${progress})`;
        }

        if (powerReadoutRef.current) {
          const pwr = 87.3 + Math.sin(progress * Math.PI * 2) * 6.7;
          powerReadoutRef.current.textContent = pwr.toFixed(1) + "%";
        }

        const newVisible = new Set<string>();
        for (const d of DIALOGUES) {
          if (progress >= d.show && progress <= d.hide) newVisible.add(d.id);
        }
        const newIds = Array.from(newVisible).sort().join(",");
        if (newIds !== prevVisibleIdsRef.current) {
          prevVisibleIdsRef.current = newIds;
          setVisibleCards(newVisible);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [drawFrame]);

  return (
    <section ref={sectionRef} className="scroll-animation relative z-10">
      <div
        className="sticky top-0 min-h-[100dvh] w-full overflow-hidden bg-black"
        style={{ height: "100dvh", willChange: "transform", transform: "translateZ(0)" }}
      >
        <img
          src={framePath(1)}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{
            transform: `translate(${HERO_MEDIA_OFFSET_X * 100}%, ${HERO_MEDIA_OFFSET_Y * 100}%) scale(${HERO_MEDIA_SCALE})`,
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ willChange: "contents", transform: "translateZ(0)" }}
        />

        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.72) 28%, rgba(0,0,0,0.12) 58%, rgba(0,0,0,0.64) 100%), radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.42) 70%, #000000 100%)",
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

        <div
          ref={heroTextRef}
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-6 px-6 pb-24 md:px-12 md:pb-28"
          style={{ transition: "opacity 80ms linear" }}
        >
          <EyebrowBadge>MAYUS // ROBÔ JURÍDICO // ONLINE</EyebrowBadge>
          <h1 className="font-display max-w-[14ch] text-5xl font-semibold leading-[1.03] tracking-normal text-white md:text-7xl lg:text-8xl">
            Operação
            <br />
            <span className="text-[#CCA761]">Agêntica.</span>
          </h1>
          <p className="max-w-[42ch] font-sans text-sm leading-relaxed text-zinc-400 md:text-base mt-2">
            O robô MAYUS monitora, interpreta e prepara a operação jurídica enquanto a decisão permanece humana.
          </p>
        </div>

        <div
          ref={bigLeftTextRef}
          className="pointer-events-none absolute bottom-24 left-6 z-10 hidden max-w-[48%] flex-col gap-5 md:flex md:bottom-28 md:left-12"
          style={{ opacity: 0, transition: "opacity 80ms linear" }}
        >
          <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-[#CCA761]">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.85)]" />
            Protocolo &mdash; MAYUS OS
          </span>
          <h2 className="font-display font-semibold leading-[0.98] tracking-normal text-white text-[clamp(4rem,7.4vw,7.4rem)]">
            Soberania
            <br />
            <span className="text-[#CCA761]">Jurídica.</span>
          </h2>
          <p className="max-w-[36ch] font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">
            Monitoramento, prazos, minutas e memória institucional trabalhando em ciclo contínuo.
          </p>
        </div>

        <div
          ref={thirdTextRef}
          className="pointer-events-none absolute bottom-24 left-6 z-10 hidden max-w-[52%] flex-col gap-5 md:flex md:bottom-28 md:left-12"
          style={{ opacity: 0, transition: "opacity 80ms linear" }}
        >
          <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-[#CCA761]">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.85)]" />
            Controle &mdash; Humano
          </span>
          <h2 className="font-display font-semibold leading-[0.98] tracking-normal text-white text-[clamp(4rem,7vw,7rem)]">
            Escritório
            <br />
            no <span className="text-[#CCA761]">comando.</span>
          </h2>
          <p className="max-w-[42ch] font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400 mt-6">
            A máquina executa o fluxo. O escritório conserva contexto, estratégia e aprovação final.
          </p>
        </div>

        <div className="pointer-events-none absolute left-6 top-20 z-10 flex items-center gap-2 md:left-10 md:top-24">
          <div className="h-px w-8 bg-[#CCA761]/60" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Núcleo operacional &mdash; ativo
          </span>
        </div>

        <div className="pointer-events-none absolute right-6 top-20 z-10 flex items-center gap-3 md:right-10 md:top-24">
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
            Confiança
          </span>
          <span
            ref={powerReadoutRef}
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#CCA761]"
          >
            87.3%
          </span>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.85)]" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-6 mb-3 h-px bg-white/10 md:mx-10">
            <div
              ref={progressFillRef}
              className="h-full origin-left bg-[#CCA761]"
              style={{ transform: "scaleX(0)", transition: "transform 80ms linear" }}
            />
          </div>
          <div className="mx-6 flex items-center justify-between gap-3 pb-4 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 md:mx-10 md:text-[10px] md:tracking-[0.28em]">
            <span>FRAME 001 / 169</span>
            <span className="hidden md:inline">MAYUS // ROBÔ EM DIAGNÓSTICO</span>
            <span>Scroll &darr;</span>
          </div>
        </div>

        {DIALOGUES.map((d) => {
          const visible = visibleCards.has(d.id);
          const position =
            d.id === "d1"
              ? "top-[22%] right-6 md:right-12"
              : d.id === "d2"
              ? "top-1/2 -translate-y-1/2 right-6 md:right-12"
              : "bottom-24 right-6 md:bottom-28 md:right-12";
          return (
            <div
              key={d.id}
              className={`pointer-events-none absolute ${position} z-20 hidden w-[420px] max-w-[90vw] md:block`}
            >
              <figure
                className={`card-surface pointer-events-auto p-6 transition-all duration-400 ease-out ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
                }`}
              >
                <blockquote className="font-display text-2xl font-medium leading-snug tracking-normal text-white">
                  &ldquo;{d.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between">
                  <span className="font-sans text-sm text-zinc-300">{d.speaker}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#CCA761]">
                    {d.film}
                  </span>
                </figcaption>
              </figure>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex flex-col gap-3 px-6 md:hidden">
          {DIALOGUES.map((d) => {
            const visible = visibleCards.has(d.id);
            return (
              <figure
                key={d.id}
                className={`card-surface pointer-events-auto p-5 transition-all duration-400 ease-out ${
                  visible
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0"
                }`}
              >
                <blockquote className="font-display text-xl font-medium leading-snug text-white">
                  &ldquo;{d.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 flex items-center justify-between">
                  <span className="font-sans text-xs text-zinc-300">
                    {d.speaker}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#CCA761]">
                    {d.film}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>

        {!loaded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-background px-6">
            <EyebrowBadge>MAYUS ENGINE // INICIANDO</EyebrowBadge>
            <div className="h-px w-60 bg-white/10 md:w-80">
              <div
                className="h-full bg-[#CCA761] transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(loadProgress * 100)}%` }}
              />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
              Carregando frames &nbsp;&middot;&nbsp; {Math.round(loadProgress * 100)}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
