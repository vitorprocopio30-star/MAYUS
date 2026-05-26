import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Check, Copy, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";

type MayusTagVariant = "neutral" | "watch" | "fatal" | "done";
type MayusButtonVariant = "default" | "primary" | "danger" | "done";

export function MayusPageShell({
  eyebrow,
  title,
  children,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mayus-page", className)}>
      <div className="mayus-shell">
        <div className="mb-8 flex flex-col gap-6 lg:mb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? <div className="t-eyebrow mb-3">{eyebrow}</div> : null}
            <h1 className="mayus-page-title">{title}</h1>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

export function MayusCard({
  children,
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cn("mayus-card p-5", interactive && "mayus-card-hover", className)} {...props}>
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </div>
  );
}

export function MayusTabs({
  items,
  activeValue,
  onChange,
  className,
}: {
  items: Array<{ value: string; label: string; count?: number }>;
  activeValue: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("mayus-tabs w-full overflow-x-auto", className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={activeValue === item.value}
          data-active={activeValue === item.value}
          className="mayus-tab flex-1 whitespace-nowrap"
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {typeof item.count === "number" ? <span className="ml-2 opacity-70">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function MayusTag({
  children,
  variant = "neutral",
  className,
  dot = false,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: MayusTagVariant; dot?: boolean }) {
  return (
    <span
      className={cn(
        "mayus-tag",
        variant === "watch" && "mayus-tag-watch",
        variant === "fatal" && "mayus-tag-fatal",
        variant === "done" && "mayus-tag-done",
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("mayus-status-dot", `mayus-status-dot-${variant}`)} /> : null}
      {children}
    </span>
  );
}

export function MayusButton({
  children,
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: MayusButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "mayus-button",
        variant === "primary" && "mayus-button-primary",
        variant === "danger" && "mayus-button-danger",
        variant === "done" && "mayus-button-done",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MayusIconButton({
  children,
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: MayusButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "mayus-icon-button",
        variant === "primary" && "mayus-button-primary",
        variant === "danger" && "mayus-button-danger",
        variant === "done" && "mayus-button-done",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MayusInputField({
  icon,
  className,
  inputClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; inputClassName?: string }) {
  return (
    <label className={cn("mayus-field", className)}>
      {icon ? <span className="text-[var(--gold)]">{icon}</span> : null}
      <input className={inputClassName} {...props} />
    </label>
  );
}

export function MayusDateField({
  icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <label className={cn("mayus-field", className)}>
      {icon ? <span className="text-[var(--gold)]">{icon}</span> : null}
      <input type="date" className="[color-scheme:dark]" {...props} />
    </label>
  );
}

export function MayusSelectField({
  icon,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }) {
  return (
    <label className={cn("mayus-field", className)}>
      {icon ? <span className="text-[var(--gold)]">{icon}</span> : null}
      <select className="[color-scheme:dark]" {...props}>
        {children}
      </select>
    </label>
  );
}

export function MayusTextarea({
  className,
  textareaClassName,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { textareaClassName?: string }) {
  return (
    <label className={cn("mayus-field min-h-48 items-start p-0", className)}>
      <textarea className={cn("min-h-48 w-full resize-none p-4", textareaClassName)} {...props} />
    </label>
  );
}

export function MayusProcessNumber({
  value,
  copied = false,
  onCopy,
  label = "Proc:",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onCopy"> & {
  value?: string | null;
  copied?: boolean;
  onCopy?: (value: string) => void;
  label?: string;
}) {
  if (!value) return null;

  return (
    <button
      type="button"
      className={cn("mayus-proc", copied && "mayus-proc-copied", className)}
      title="Copiar número do processo"
      onClick={(event) => {
        event.stopPropagation();
        if (typeof navigator !== "undefined") {
          void navigator.clipboard.writeText(value);
        }
        onCopy?.(value);
      }}
      {...props}
    >
      <Gavel size={14} aria-hidden="true" />
      <span className="truncate">
        {label} {value}
      </span>
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

export function MayusAvatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || "?";

  return (
    <span className={cn("mayus-avatar", className)}>
      {src ? <img src={src} alt={name ?? ""} className="h-full w-full object-cover" /> : initial}
    </span>
  );
}

export function MayusEmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mayus-empty flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon ? <div className="mb-5 text-[var(--ink-3)]">{icon}</div> : null}
      <h2 className="t-title text-2xl">{title}</h2>
      {description ? <p className="t-body mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-2)]">{description}</p> : null}
    </div>
  );
}

export function MayusModal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="mayus-modal-overlay" onClick={onClose}>
      <div className={cn("mayus-modal-panel", className)} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
