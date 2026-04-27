type Props = { children: React.ReactNode; className?: string };

export function EyebrowBadge({ children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-[#CCA761]/25 bg-black/45 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[#CCA761] backdrop-blur-md ${className}`}
      style={{
        boxShadow:
          "inset 0 1px 0 rgba(204,167,97,0.08), 0 0 24px -8px rgba(204,167,97,0.3)",
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.85)]" />
      {children}
    </span>
  );
}
