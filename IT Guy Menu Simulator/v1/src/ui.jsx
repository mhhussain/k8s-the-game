/* ============================================================
   CLUSTER — shared UI primitives + icon set
   ============================================================ */

/* ---------- icons (16px stroke, currentColor) ---------- */
const ICON_PATHS = {
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
};
function Icon({ name, size=18, sw=1.6, style, className }) {
  return React.createElement('svg', {
    width:size, height:size, viewBox:'0 0 24 24', fill:'none',
    stroke:'currentColor', strokeWidth:sw, strokeLinecap:'round', strokeLinejoin:'round',
    className, style, dangerouslySetInnerHTML:{ __html: ICON_PATHS[name] || '' },
  });
}

/* ---------- LED + Pill ---------- */
function LED({ sev='idle', pulse }) {
  return <span className={`led ${sev}${pulse?' pulse':''}`} />;
}
const STATUS_LABEL = {
  Running:'Running', Stale:'Stale', Degraded:'Degraded', Pending:'Pending',
  CrashLoopBackOff:'CrashLoopBackOff', Terminating:'Terminating', Idle:'Idle (0 pods)',
};
function StatusPill({ status }) {
  const sev = sevOf(status);
  return (
    <span className={`pill ${sev}`}>
      <LED sev={sev} pulse={sev==='bad'} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* ---------- Meter (HUD) ---------- */
function Meter({ icon, label, value, sub, pct, color, flash }) {
  return (
    <div className={`meter${flash?' flash':''}`}>
      <div className="meter-head">
        <span className="meter-label"><Icon name={icon} size={13} /> {label}</span>
      </div>
      <div className="meter-val" style={{ color }}>{value} {sub && <small>{sub}</small>}</div>
      <div className="meter-bar"><i style={{ width:`${clamp(pct,0,100)}%`, background:color }} /></div>
    </div>
  );
}

/* ---------- Avatar ---------- */
function Avatar({ color, name }) {
  const initials = name.split(/[ ·]/).filter(Boolean).slice(0,1).map(w=>w[0]).join('').toUpperCase();
  return <span className="avatar" style={{ background:color }}>{initials}</span>;
}

/* ---------- Toggle ---------- */
function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

/* ---------- Slider with zone coloring ---------- */
function Slider({ value, min, max, step=1, onChange, format, zone }) {
  const cls = zone === 'bad' ? 'badzone' : zone === 'warn' ? 'warnzone' : '';
  return (
    <div className="slider-row">
      <input type="range" className={cls} min={min} max={max} step={step} value={value}
             onChange={e=>onChange(Number(e.target.value))} />
      <span className="sval">{format ? format(value) : value}</span>
    </div>
  );
}

/* ---------- Segmented control ---------- */
function Seg({ options, value, onChange, accent }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} className={value===o.value ? `on${accent?' accent':''}` : ''}
                onClick={()=>onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- error-rate bar ---------- */
function ErrorRate({ rate }) {
  const pct = rate*100;
  const col = pct > 15 ? 'var(--bad)' : pct > 3 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="erate">
      <div className="track"><i style={{ width:`${clamp(pct*2,2,100)}%`, background:col }} /></div>
      <span className="num" style={{ color:col }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

/* ---------- Toasts ---------- */
function Toasts() {
  const { state, dispatch } = useGame();
  useEffect(() => {
    if (!state.toasts.length) return;
    const last = state.toasts[state.toasts.length-1];
    const id = setTimeout(()=>dispatch({ type:'DISMISS_TOAST', id:last.id }), 4200);
    return ()=>clearTimeout(id);
  }, [state.toasts]);
  const ico = { bad:'alert', warn:'alert', ok:'check', info:'info' };
  return (
    <div className="toasts">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={()=>dispatch({type:'DISMISS_TOAST',id:t.id})}>
          <span className="t-ico" style={{ color:`var(--${t.kind==='info'?'accent':t.kind})` }}><Icon name={ico[t.kind]} size={16} /></span>
          <div>
            <div className="t-title">{t.title}</div>
            <div className="t-msg">{t.msg}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Icon, LED, StatusPill, STATUS_LABEL, Meter, Avatar, Toggle, Slider, Seg, ErrorRate, Toasts });
