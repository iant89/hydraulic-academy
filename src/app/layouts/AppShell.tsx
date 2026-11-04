import { type ReactNode, useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { NAV, NAV_GROUPS } from '../navigation';
import { href } from '../router';
import { useWorkbay } from '@/stores/workbay';
import { useTick } from '@/stores/simLoop';
import { Button, cx } from '@/components/ui';
import s from './AppShell.module.css';

export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [active]);
  const current = NAV.find((n) => n.id === active);
  return (
    <div className={s.shell}>
      <nav className={cx(s.nav, open && s.navOpen)} aria-label="Primary">
        <div className={s.brand}>
          <div className={s.brandMark} aria-hidden>
            <svg width="20" height="20" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="10" fill="none" stroke="#f2a93b" strokeWidth="2.5" />
              <path d="M16 8 L22 19 H10 Z" fill="#f2a93b" />
            </svg>
          </div>
          <div className={s.brandText}>
            <strong>HYDRAULIC</strong>
            <span>ACADEMY · Technician training</span>
          </div>
        </div>
        <div className={s.navScroll}>
          {NAV_GROUPS.map((g) => (
            <div key={g} className={s.group}>
              <div className={s.groupLabel}>{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <a key={n.id} href={href(n.id)} className={cx(s.link, active === n.id && s.linkActive)} title={n.label} aria-current={active === n.id ? 'page' : undefined}>
                  <n.icon size={17} strokeWidth={1.8} />
                  <span className={s.linkText}>{n.label}</span>
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className={s.navFoot}>Training simulator – not a substitute for manufacturer service documentation or qualified instruction.</div>
      </nav>
      {open && <div className={s.backdrop} onClick={() => setOpen(false)} />}
      <div className={s.main}>
        <header className={s.top}>
          <Button variant="ghost" className={s.menuBtn} onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </Button>
          <h1>{current?.label ?? 'Hydraulic Academy'}</h1>
          <span className={s.topSpacer} />
          <WorkbayStatus />
        </header>
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}

function WorkbayStatus() {
  useTick();
  const { machine, profile, session, running } = useWorkbay.getState();
  return (
    <div className={s.status} title="Live equipment in the work bay">
      <span className={cx(s.dot, running && machine.controls.engineRunning && s.dotOn)} />
      <span>{profile.name}</span>
      <span>·</span>
      <span>{machine.controls.engineRunning ? 'Engine running' : 'Engine off'}</span>
      {session && (
        <>
          <span>·</span>
          <span style={{ color: 'var(--accent)' }}>Scenario: {session.brief.title}</span>
        </>
      )}
    </div>
  );
}
