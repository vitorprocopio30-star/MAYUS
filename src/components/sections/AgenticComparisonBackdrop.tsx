"use client";

import { useCallback, useEffect, useRef } from "react";

const AGENTIC_FRAME_COUNT = 120;

const agenticFramePath = (n: number) =>
  `/frames_agentic/frame_${String(n).padStart(4, "0")}.jpg`;

export function AgenticComparisonBackdrop() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<HTMLImageElement[]>([]);
  const lastFrameRef = useRef(-1);
  const tickingRef = useRef(false);

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const img = framesRef.current[index];
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * 0.82;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = (cw - drawW) / 2 + cw * 0.05;
    const drawY = ch * 0.31;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const rect = root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    drawFrame(lastFrameRef.current >= 0 ? lastFrameRef.current : 0);
  }, [drawFrame]);

  useEffect(() => {
    const imgs: HTMLImageElement[] = [];
    let cancelled = false;

    for (let i = 1; i <= AGENTIC_FRAME_COUNT; i++) {
      const img = new Image();
      const index = i - 1;
      img.onload = () => {
        if (cancelled) return;
        if (lastFrameRef.current < 0) {
          lastFrameRef.current = 0;
          drawFrame(0);
          return;
        }
        if (lastFrameRef.current === index) {
          drawFrame(index);
        }
      };
      img.src = agenticFramePath(i);
      imgs.push(img);
    }

    framesRef.current = imgs;
    return () => {
      cancelled = true;
    };
  }, [drawFrame]);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (rootRef.current) observer.observe(rootRef.current);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;

      requestAnimationFrame(() => {
        tickingRef.current = false;
        const root = rootRef.current;
        if (!root) return;

        const section = root.closest("section");
        const rect = (section || root).getBoundingClientRect();
        const viewport = window.innerHeight || 1;
        const scrollable = rect.height - viewport;
        const progress = Math.min(
          1,
          Math.max(0, scrollable <= 0 ? 0 : -rect.top / scrollable),
        );
        const frameIndex = Math.min(
          AGENTIC_FRAME_COUNT - 1,
          Math.floor(progress * AGENTIC_FRAME_COUNT),
        );

        if (frameIndex !== lastFrameRef.current) {
          lastFrameRef.current = frameIndex;
          drawFrame(frameIndex);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [drawFrame]);

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/frames_agentic/frame_0034.jpg')] bg-[length:66%_auto] bg-[position:58%_68%] bg-no-repeat opacity-90 brightness-[1.08] saturate-[1.04]" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-95 saturate-[1.04] brightness-[1.08]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,3,4,0.96)_0%,rgba(3,3,4,0.80)_27%,rgba(3,3,4,0.34)_58%,rgba(3,3,4,0.82)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_44%_at_60%_66%,rgba(226,201,126,0.20)_0%,transparent_62%),linear-gradient(180deg,rgba(5,5,5,0.72)_0%,rgba(5,5,5,0.22)_48%,rgba(5,5,5,0.82)_100%)]" />
      <div className="absolute inset-0 opacity-[0.16] bg-[linear-gradient(to_right,rgba(226,201,126,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(226,201,126,0.12)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="absolute bottom-0 right-0 h-48 w-80 bg-[linear-gradient(135deg,rgba(5,5,5,0)_0%,rgba(5,5,5,0.84)_46%,rgba(5,5,5,0.98)_100%)] md:h-64 md:w-[34rem]" />
      <div className="absolute bottom-[16%] right-[9%] h-24 w-48 rounded-full bg-[#050505]/90 blur-xl md:h-28 md:w-56" />
    </div>
  );
}
