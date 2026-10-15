/**
 * Shared UI primitives.
 *
 * The dialog here is the whole point of the app's design: every edit happens
 * on the screen you are already looking at, not behind a settings page.
 */
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Rivets() {
  return (
    <>
      <span className="gr-rivet left-[9px] top-[9px]" />
      <span className="gr-rivet right-[9px] top-[9px]" />
      <span className="gr-rivet bottom-[9px] left-[9px]" />
      <span className="gr-rivet bottom-[9px] right-[9px]" />
    </>
  );
}

export function Card({
  title,
  icon,
  right,
  tone = 'enamel',
  dash = false,
  bodyClass = 'p-5',
  children,
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  tone?: 'enamel' | 'petrol' | 'steel';
  dash?: boolean;
  bodyClass?: string;
  children: ReactNode;
}) {
  const toneClass = tone === 'petrol' ? 'gr-hdr-petrol' : tone === 'steel' ? 'gr-hdr-steel' : '';
  return (
    <div className="gr-card">
      <Rivets />
      <div className={`gr-face ${dash ? 'gr-face-dash' : ''}`}>
        {title && (
          <div className={`gr-hdr ${toneClass}`}>
            {icon}
            <span>{title}</span>
            {right && <span className="ml-auto font-type text-[11px] normal-case tracking-normal opacity-80">{right}</span>}
          </div>
        )}
        <div className={bodyClass}>{children}</div>
      </div>
    </div>
  );
}

export function SectionRule({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4 mt-8 flex items-center gap-4">
      {icon && <span className="text-brass">{icon}</span>}
      <h2 className="whitespace-nowrap font-sign text-lg uppercase tracking-wide text-cream drop-shadow-[0_2px_0_rgba(0,0,0,.6)]">
        {children}
      </h2>
      <div className="h-0 flex-1 border-b-2 border-t-2 border-b-black/60 border-t-chrome-3" />
    </div>
  );
}

const PILL_TONES = {
  ok: 'text-ok border-ok/60 bg-ok/10',
  warn: 'text-warn border-warn/60 bg-warn/10',
  bad: 'text-bad border-bad/60 bg-bad/10',
  petrol: 'text-petrol border-petrol/50 bg-petrol/10',
  enamel: 'text-enamel border-enamel/50 bg-enamel/10',
} as const;

export function Pill({
  tone = 'petrol',
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  children: ReactNode;
}) {
  return <span className={`gr-pill ${PILL_TONES[tone]}`}>{children}</span>;
}

/**
 * A modal that behaves like one: focus moves in, Escape closes, and the
 * backdrop is inert so a mis-click cannot discard a half-typed service entry.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus the first real control so a keyboard user is not left on the body.
    panel.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={panel} className="gr-card w-full max-w-xl">
        <Rivets />
        <div className="gr-face">
          <div className="gr-hdr">
            <span>{title}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto rounded p-1 text-white/80 transition hover:bg-black/20 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t-2 border-chrome-3 bg-black/5 px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="gr-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-type text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] h-4 w-4 accent-enamel"
      />
      <span>
        <span className="font-stencil text-sm uppercase tracking-[0.1em] text-ink-2">{label}</span>
        {hint && <span className="block font-type text-[11px] text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center font-type text-sm text-ink-3">{children}</p>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded border-l-4 border-bad bg-bad/10 px-4 py-3 font-type text-sm text-bad">
      {message}
    </div>
  );
}

export const money = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const miles = (value: number) => `${value.toLocaleString()} mi`;
