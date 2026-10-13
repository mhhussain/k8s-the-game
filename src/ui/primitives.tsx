/* ============================================================
   Shared UI primitives + icon set
   ============================================================ */
import React, { useEffect } from 'react';
import { clamp, sevOf, type Sev, type ServiceStatus } from '../engine';
import { useGame } from '../store';

const ICON_PATHS: Record<string, string> = {
  tickets:  '<path d="M3 5h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path d="M9 5v14" stroke-dasharray="2 2"/>',
  cluster:  '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  tree:     '<circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M12 7.4V12M12 12 6.5 16.6M12 12l5.5 4.6"/>',
  play:     '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  pause:    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  ff:       '<path d="M4 5l8 7-8 7zM13 5l8 7-8 7z" fill="currentColor" stroke="none"/>',
  heart:    '<path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5C19 15.5 12 20 12 20z"/>',
  budget:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1.1 1.1-2 2.5-2s2.5.9 2.5 2-1.1 1.5-2.5 1.5-2.5.4-2.5 1.5 1.1 2 2.5 2 2.5-.9 2.5-2"/>',
  backlog:  '<path d="M4 6h16M4 12h16M4 18h10"/>',
  sla:      '<path d="M3 12h4l2 6 4-14 2 8h6"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  grip:     '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
  box:      '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  layers:   '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  ci:       '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  deploy:   '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><path d="M7 18h10"/>',
  rolling:  '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16"/>',
  scale:    '<path d="M4 20V10M10 20V4M16 20v-7M20 20V8"/>',
  trend:    '<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>',
  node:     '<rect x="3" y="5" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><circle cx="7" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="1" fill="currentColor" stroke="none"/>',
  pin:      '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  shield:   '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  lock:     '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/>',
  cpu:      '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
  mem:      '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7v10M11 7v10M15 7v10"/>',
  alert:    '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  check:    '<path d="M20 6L9 17l-5-5"/>',
  bolt:     '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  search:   '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  arrow:    '<path d="M5 12h14M13 6l6 6-6 6"/>',
  restart:  '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  trash:    '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  edit:     '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  eye:      '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.6"/>',
  server:   '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><circle cx="7" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none"/>',
  tag:      '<path d="M3 7v5l9 9 7-7-9-9H5a2 2 0 0 0-2 2z"/><circle cx="7.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>',
  balance:  '<path d="M12 3v18M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0L5 8zm14 0-2.5 6a3 3 0 0 0 5 0L19 8z"/><path d="M7 21h10"/>',
  shuffle:  '<path d="M16 3h5v5M21 3l-7 7M4 20l6-6M16 21h5v-5M15 15l6 6M4 4l5 5"/>',
  minus:    '<path d="M5 12h14"/>',
  spark:    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  save:     '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  help:     '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  log:      '<path d="M4 5h16M4 10h10M4 15h16M4 20h10"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload:   '<path d="M12 15V3M7 8l5-5 5 5M4 20h16"/>',
  trophy:   '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
  skull:    '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.5" fill="currentColor" stroke="none"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wifi_off: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3-2M12 20h.01M16 10.5a10 10 0 0 1 3 2M2 8.5a15 15 0 0 1 4-2.5M18 6a15 15 0 0 1 4 2.5"/>',
  fire:     '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-.5 2-1.5 3-3 3 0-3-1-6-4-8 0 3-1 5-3 7-1.5 1.5-2 3-2 5 0 4 3 7 8 7z"/>',
  dollar:   '<path d="M12 2v20M17 6.5c0-2-2.2-3.5-5-3.5S7 4.5 7 6.5 9.2 10 12 10s5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.5-5-3.5"/>',
};

export function Icon({ name, size = 18, sw = 1.6, style, className }: { name: string; size?: number; sw?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || '' }} />
  );
}

export function LED({ sev = 'idle', pulse }: { sev?: Sev; pulse?: boolean }) {
  return <span className={`led ${sev}${pulse ? ' pulse' : ''}`} />;
}

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  Running: 'Running', Stale: 'Stale', Degraded: 'Degraded', Pending: 'Pending',
  CrashLoopBackOff: 'CrashLoopBackOff', Terminating: 'Terminating', Idle: 'Idle (0 pods)',
};
export function StatusPill({ status }: { status: ServiceStatus }) {
  const sev = sevOf(status);
  return <span className={`pill ${sev}`}><LED sev={sev} pulse={sev === 'bad'} />{STATUS_LABEL[status] || status}</span>;
}

export function Meter({ icon, label, value, sub, pct, color, flash }: { icon: string; label: string; value: React.ReactNode; sub?: React.ReactNode; pct: number; color: string; flash?: boolean }) {
  return (
    <div className={`meter${flash ? ' flash' : ''}`}>
      <div className="meter-head"><span className="meter-label"><Icon name={icon} size={13} /> {label}</span></div>
      <div className="meter-val" style={{ color }}>{value} {sub && <small>{sub}</small>}</div>
      <div className="meter-bar"><i style={{ width: `${clamp(pct, 0, 100)}%`, background: color }} /></div>
    </div>
  );
}

export function Avatar({ color, name }: { color: string; name: string }) {
  const initial = name.split(/[ ·]/).filter(Boolean)[0]?.[0]?.toUpperCase() ?? '?';
  return <span className="avatar" style={{ background: color }}>{initial}</span>;
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export function Slider({ value, min, max, step = 1, onChange, format, zone }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; zone?: 'bad' | 'warn' | '' }) {
  const cls = zone === 'bad' ? 'badzone' : zone === 'warn' ? 'warnzone' : '';
  return (
    <div className="slider-row">
      <input type="range" className={cls} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span className="sval">{format ? format(value) : value}</span>
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, accent }: { options: { value: T; label: string; icon?: string }[]; value: T; onChange: (v: T) => void; accent?: boolean }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} type="button" className={value === o.value ? `on${accent ? ' accent' : ''}` : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorRate({ rate }: { rate: number }) {
  const pct = rate * 100;
  const col = pct > 15 ? 'var(--bad)' : pct > 3 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="erate">
      <div className="track"><i style={{ width: `${clamp(pct * 2, 2, 100)}%`, background: col }} /></div>
      <span className="num" style={{ color: col }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

/* load = demand / capacity; >0.85 warn, >1 bad */
export function LoadBar({ load }: { load: number }) {
  const col = load > 1 ? 'var(--bad)' : load > 0.85 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="load-bar">
      <div className="track"><i style={{ width: `${clamp(load * 100, 2, 100)}%`, background: col }} /></div>
      <span className="num mono" style={{ color: col, fontSize: 11, minWidth: 36 }}>{Math.round(load * 100)}%</span>
    </div>
  );
}

export function Toasts() {
  const { state, dispatch } = useGame();
  useEffect(() => {
    if (!state.toasts.length) return;
    const last = state.toasts[state.toasts.length - 1];
    const id = window.setTimeout(() => dispatch({ type: 'DISMISS_TOAST', id: last.id }), 4200);
    return () => window.clearTimeout(id);
  }, [state.toasts, dispatch]);
  const ico: Record<string, string> = { bad: 'alert', warn: 'alert', ok: 'check', info: 'info' };
  return (
    <div className="toasts" role="status" aria-live="polite">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dispatch({ type: 'DISMISS_TOAST', id: t.id })}>
          <span className="t-ico" style={{ color: `var(--${t.kind === 'info' ? 'accent' : t.kind})` }}><Icon name={ico[t.kind]} size={16} /></span>
          <div><div className="t-title">{t.title}</div><div className="t-msg">{t.msg}</div></div>
        </div>
      ))}
    </div>
  );
}
