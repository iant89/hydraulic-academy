import { type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant, size, active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'lg'; active?: boolean }) {
  return <button type="button" className={cx(s.btn, variant && s[variant], size && s[size], active && s.active, className)} {...rest} />;
}

export function Panel({ title, actions, children, flush, className, icon }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; icon?: ReactNode }) {
  return (
    <section className={cx(s.panel, className)}>
      {(title || actions) && (
        <header className={s.panelHead}>
          {icon}
          {title && <h2>{title}</h2>}
          <span className={s.spacer} />
          {actions}
        </header>
      )}
      <div className={cx(s.panelBody, flush && s.flush)}>{children}</div>
    </section>
  );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'accent' | undefined;
export function Badge({ tone, children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={cx(s.badge, tone && s[`b-${tone}`])} title={title}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
      {sub && <span className={s.statSub}>{sub}</span>}
    </div>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select({ options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string; disabled?: boolean }[] }) {
  return (
    <select className={s.select} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={s.input} {...props} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={s.textarea} {...props} />;
}

export function Range({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step?: number; onChange(v: number): void; display: string }) {
  const id = useId();
  return (
    <div className={s.field}>
      <span id={id}>{label}</span>
      <div className={s.range}>
        <input aria-labelledby={id} type="range" min={min} max={max} step={step ?? (max - min) / 100} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{display}</output>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: NoInfer<T>; label: ReactNode }[]; value: T; onChange(v: T): void }) {
  return (
    <div className={s.tabs} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={cx(s.tab, value === t.id && s.tabActive)} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children: ReactNode }) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warn' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info;
  return (
    <div className={cx(s.callout, tone !== 'info' && s[`c-${tone}`])} role={tone === 'danger' ? 'alert' : undefined}>
      {title && (
        <div className={s.calloutTitle}>
          <Icon size={14} /> {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Meter({ value, color }: { value: number; color?: string }) {
  return (
    <div className={s.meter} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={s.meterFill} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className={s.kv}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const tableClass = s.table;
export const tableWrapClass = s.tableWrap;
export { cx };
