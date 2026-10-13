/* ============================================================
   CLUSTER — App shell, router, intro, first-ticket beat, modals, keyboard
   ============================================================ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONFIG, money, dayOf, clockLabel, slotMeta, AUTOSAVE_KEY,
  type Action, type SaveMeta, type Screen, type Theme, type BoardView, type ToastKind, type Outcome, type Stats,
} from '../engine';
import { useGame } from '../store';
import { Icon, LED, Seg, Slider, Toggle, Toasts } from './primitives';
import { HUD, SideNav, Brand, type Modal } from './hud';
import { TicketBoard } from './tickets';
import { InfraScreen } from './cluster';
import { TechTree } from './techtree';
import { ServiceForm } from './service-form';

const THEME_LABEL: Record<Theme, string> = { daylight: 'Daylight', bubblegum: 'Bubblegum', voltage: 'Voltage' };
const BOARD_LABEL: Record<BoardView, string> = { cards: 'Cards', grid: 'Grid', table: 'Table' };
const SCREEN_KEYS: Record<string, Screen> = { '1': 'tickets', '2': 'infra', '3': 'tree' };

export function App() {
  const { state, dispatch, settings, setSettings, save } = useGame();
  const [intro, setIntro] = useState<boolean>(() => !settings.seenIntro);
  const [modal, setModal] = useState<Modal>(null);

  const outcomeOpen = state.outcome !== null && !state.endless;
  const anyModal = modal !== null || intro || outcomeOpen;

  // theme + drama
  useEffect(() => { document.documentElement.dataset.theme = settings.theme || 'daylight'; }, [settings.theme]);
  useEffect(() => { document.documentElement.style.setProperty('--drama', String(state.settings.drama)); }, [state.settings.drama]);
  // default board layout → engine
  useEffect(() => { dispatch({ type: 'BOARD_VIEW', view: settings.boardView }); }, [settings.boardView, dispatch]);

  const closeIntro = useCallback(() => { setSettings({ seenIntro: true }); setIntro(false); }, [setSettings]);

  // keyboard: space pauses/resumes, Escape closes, 1/2/3 switch screens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.key === 'Escape') {
        if (modal) setModal(null);
        else if (intro) closeIntro();
        else if (state.firstBeat) dispatch({ type: 'CLEAR_BEAT' });
        return;
      }
      if (typing || anyModal) return;
      if (e.code === 'Space') {
        e.preventDefault();
        dispatch(state.clock.paused ? { type: 'SPEED', speed: state.clock.speed } : { type: 'PAUSE', paused: true });
        return;
      }
      const screen = SCREEN_KEYS[e.key];
      if (screen && !e.metaKey && !e.ctrlKey && !e.altKey) dispatch({ type: 'NAV', screen });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.clock.paused, state.clock.speed, state.firstBeat, modal, intro, anyModal, closeIntro, dispatch]);

  const close = () => setModal(null);

  return (
    <div className="app">
      <Brand />
      <HUD onOpen={setModal} />
      <SideNav />
      <div className="main">
        {state.ui.screen === 'tickets' && <TicketBoard />}
        {state.ui.screen === 'infra'   && <InfraScreen />}
        {state.ui.screen === 'tree'    && <TechTree />}
      </div>

      <ServiceForm />
      <Toasts />

      {state.endless && (
        <span className="pill accent" style={{ position: 'fixed', left: 92, bottom: 16, zIndex: 50, boxShadow: 'var(--shadow)' }}>
          <Icon name="spark" size={12} /> Endless mode
        </span>
      )}

      {intro && <Intro onClose={closeIntro} />}
      {!intro && state.firstBeat && <FirstBeat beat={state.firstBeat} dispatch={dispatch} />}

      {modal === 'settings' && <SettingsModal onClose={close} onReplayIntro={() => { close(); setIntro(true); }} />}
      {modal === 'save'     && <SaveLoadModal onClose={close} />}
      {modal === 'log'      && <ActivityLog onClose={close} />}
      {modal === 'help'     && <HelpModal onClose={close} />}

      {outcomeOpen && state.outcome && <OutcomeModal outcome={state.outcome} stats={state.stats} onContinue={() => dispatch({ type: 'CONTINUE_ENDLESS' })} onNewGame={() => save.newGame()} />}
    </div>
  );
}

/* ---------- first-ticket-lands beat ---------- */
function FirstBeat({ beat, dispatch }: { beat: { id: string; title: string }; dispatch: React.Dispatch<Action> }) {
  const go = () => { dispatch({ type: 'NAV', screen: 'tickets' }); dispatch({ type: 'CLEAR_BEAT' }); };
  return (
    <>
      <div className="overlay" onClick={() => dispatch({ type: 'CLEAR_BEAT' })} />
      <div className="firstbeat">
        <div className="fb-ico"><Icon name="tickets" size={28} /></div>
        <h3>Your first ticket just landed</h3>
        <p><b style={{ color: 'var(--text)' }}>{beat.title}</b><br />Work arrives on the board as tickets. Read it, build what it needs, then mark it done — the engine grades your live cluster against the acceptance criteria.</p>
        <div className="flex gap8" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={go}><Icon name="arrow" size={15} /> Open the ticket</button>
          <button type="button" className="btn ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => dispatch({ type: 'CLEAR_BEAT' })}>Later</button>
        </div>
      </div>
    </>
  );
}

/* ---------- Intro: the core loop ---------- */
const INTRO_STEPS = [
  { ico: 'tickets', t: 'Read a ticket',     d: 'Work arrives on the board moments after you start. Each lists acceptance criteria — and hints at what they didn’t say.' },
  { ico: 'box',     t: 'Build an image',    d: 'Drag a Repo onto the Registry to build a container image.' },
  { ico: 'bolt',    t: 'Author a service',  d: 'Pick the image, set replicas, let pods auto-spread across your nodes. Deploy.' },
  { ico: 'node',    t: 'Grow the cluster',  d: 'You start with one small node. Provision more — generic (flexible) or special (dense) — and tag them as you go.' },
  { ico: 'check',   t: 'Get it validated',  d: 'Hit Mark done — the system grades the live cluster against the criteria, like the High-Availability checklist.' },
  { ico: 'tree',    t: 'Automate it',       d: 'Buy the Dashboard, Deployments, Affinity, Auto-Rebalance and more until the cluster runs itself.' },
];

function IntroSteps() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {INTRO_STEPS.map((s, i) => (
        <div key={i} className="flex gap12" style={{ alignItems: 'flex-start' }}>
          <div className="u-ico" style={{ margin: 0, flex: 'none', width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={s.ico} size={18} /></div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}><span className="mono faint" style={{ fontSize: 11, marginRight: 6 }}>{i + 1}</span>{s.t}</div>
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>{s.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Intro({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="overlay" />
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', zIndex: 95 }}>
        <div className="panel" style={{ width: 700, maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
          <div className="panel-head" style={{ padding: '20px 24px' }}>
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 800 }}>Welcome, Architect.</h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>You run the <b className="mono">prod-east-1</b> cluster. No terminal — just menus, forms, and drag-and-drop. You’re starting from a blank slate.</div>
            </div>
            <button type="button" className="cbtn" onClick={onClose}><Icon name="close" size={16} /></button>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <IntroSteps />
          </div>
          <div className="so-foot" style={{ borderRadius: '0 0 var(--r-lg) var(--r-lg)' }}>
            <span className="cost">Time is paused. Press <span className="kbd">space</span> to play/pause — your first ticket lands a few seconds in.</span>
            <button type="button" className="btn primary" onClick={onClose}><Icon name="arrow" size={15} /> Start the shift</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- shared modal frame ---------- */
function ModalFrame({ title, sub, onClose, width, children, foot }: {
  title: string; sub?: React.ReactNode; onClose: () => void; width?: number; children: React.ReactNode; foot?: React.ReactNode;
}) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-wrap" onClick={onClose}>
        <div className="modal" role="dialog" aria-label={title} style={width ? { width } : undefined} onClick={e => e.stopPropagation()}>
          <div className="panel-head" style={{ padding: '18px 24px' }}>
            <div>
              <h3 className="modal-title">{title}</h3>
              {sub && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{sub}</div>}
            </div>
            <button type="button" className="cbtn" title="Close (esc)" onClick={onClose}><Icon name="close" size={16} /></button>
          </div>
          <div className="so-body">{children}</div>
          {foot && <div className="so-foot">{foot}</div>}
        </div>
      </div>
    </>
  );
}

function SettingsRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="sr-l">{label}</div>
        {desc && <div className="sr-d">{desc}</div>}
      </div>
      <div className="flex gap8">{children}</div>
    </div>
  );
}

/* two-step confirm: first click arms, second (within 3s) fires */
function useConfirm() {
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);
  const ask = (key: string, fn: () => void) => { if (armed === key) { setArmed(null); fn(); } else setArmed(key); };
  return { armed, ask, reset: () => setArmed(null) };
}

/* ---------- Settings ---------- */
function SettingsModal({ onClose, onReplayIntro }: { onClose: () => void; onReplayIntro: () => void }) {
  const { state, dispatch, settings, setSettings, save } = useGame();
  const confirm = useConfirm();
  return (
    <ModalFrame title="Settings" sub="Visual direction, alarm intensity and how the shift runs." onClose={onClose} width={620}>
      <SettingsRow label="Theme" desc="Sets the whole palette; saved on this browser.">
        <Seg<Theme> accent value={settings.theme} onChange={v => setSettings({ theme: v })}
          options={(['daylight', 'bubblegum', 'voltage'] as Theme[]).map(v => ({ value: v, label: THEME_LABEL[v] }))} />
      </SettingsRow>
      <SettingsRow label="Default board layout" desc="How the Cluster status board opens.">
        <Seg<BoardView> value={settings.boardView} onChange={v => { setSettings({ boardView: v }); dispatch({ type: 'BOARD_VIEW', view: v }); }}
          options={(['cards', 'grid', 'table'] as BoardView[]).map(v => ({ value: v, label: BOARD_LABEL[v] }))} />
      </SettingsRow>
      <SettingsRow label="Drift drama" desc="Scales crash risk, incident frequency and LED pulse.">
        <div style={{ width: 230 }}>
          <Slider value={state.settings.drama} min={0} max={1} step={0.1} onChange={v => dispatch({ type: 'SET_DRAMA', drama: v })}
            format={v => v.toFixed(1)} zone={state.settings.drama >= 0.9 ? 'bad' : state.settings.drama >= 0.7 ? 'warn' : ''} />
        </div>
      </SettingsRow>
      <SettingsRow label="Pause when a ticket lands" desc="Stop the clock so you can read it first.">
        <Toggle checked={state.settings.pauseOnTicket} onChange={on => dispatch({ type: 'SET_PAUSE_ON_TICKET', on })} />
      </SettingsRow>
      <SettingsRow label="Autosave" desc={`Every ${CONFIG.AUTOSAVE_EVERY} ticks, on pause and when the tab closes.`}>
        <Toggle checked={settings.autosave} onChange={autosave => setSettings({ autosave })} />
      </SettingsRow>
      <SettingsRow label="Replay intro" desc="Show the welcome walkthrough again.">
        <button type="button" className="btn sm ghost" onClick={onReplayIntro}><Icon name="help" size={14} /> Replay intro</button>
      </SettingsRow>
      <SettingsRow label="New game" desc="Wipe the current run and start from a blank slate.">
        <button type="button" className="btn sm danger" onClick={() => confirm.ask('new', () => { save.newGame(); onClose(); })}>
          <Icon name="restart" size={14} /> {confirm.armed === 'new' ? 'Start over? Current run is lost' : 'New game'}
        </button>
      </SettingsRow>
    </ModalFrame>
  );
}

/* ---------- Save / load ---------- */
function relTime(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  return `${Math.floor(d / 86_400_000)} d ago`;
}
const metaLine = (m: SaveMeta) =>
  `Day ${m.day} · ${money(m.budget)} · ${m.services} service${m.services === 1 ? '' : 's'} · ${m.tickets} open ticket${m.tickets === 1 ? '' : 's'} · saved ${relTime(m.savedAt)}`;

function SaveLoadModal({ onClose }: { onClose: () => void }) {
  const { dispatch, save } = useGame();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const slots: (SaveMeta | null)[] = save.slots;
  const auto = slotMeta(AUTOSAVE_KEY);
  const toast = (kind: ToastKind, title: string, msg: string) => dispatch({ type: 'TOAST', kind, title, msg });

  const doSave = (i: number) => { const ok = save.saveSlot(i); toast(ok ? 'ok' : 'bad', ok ? 'Game saved' : 'Save failed', ok ? `Slot ${i + 1}` : 'Browser storage is unavailable.'); };
  const doLoad = (i: number) => { const ok = save.loadSlot(i); if (ok) { toast('info', 'Game loaded', `Slot ${i + 1} · clock paused`); onClose(); } else toast('bad', 'Load failed', 'That slot could not be read.'); };
  const doAuto = () => { const ok = save.loadAutosave(); if (ok) { toast('info', 'Autosave loaded', 'Clock paused'); onClose(); } else toast('bad', 'Load failed', 'No autosave found.'); };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { await save.importFile(file); toast('ok', 'Save imported', `${file.name} · clock paused`); onClose(); }
    catch (err) { toast('bad', 'Import failed', err instanceof Error ? err.message : 'Not a Cluster save file'); }
  };

  return (
    <ModalFrame title="Save / load" sub="Three manual slots plus the rolling autosave. Loading pauses the clock." onClose={onClose} width={640}
      foot={
        <>
          <span className="cost">Exported files carry a save between browsers or machines — import one here to pick it up.</span>
          <button type="button" className="btn sm ghost" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> Import JSON</button>
          <button type="button" className="btn sm" onClick={() => save.exportFile()}><Icon name="download" size={14} /> Export JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} />
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slots.map((m, i) => (
          <div key={i} className={`save-slot${m ? '' : ' empty'}`}>
            <Icon name="save" size={18} style={{ color: m ? 'var(--accent)' : 'var(--text-faint)' }} />
            <div>
              <div className="ss-name">{m ? (m.label || `Slot ${i + 1}`) : `Slot ${i + 1}`}{m?.outcome && <span className={`pill ${m.outcome.kind === 'won' ? 'ok' : 'bad'}`} style={{ marginLeft: 8, padding: '1px 7px', fontSize: 10 }}>{m.outcome.kind}</span>}</div>
              <div className="ss-meta">{m ? metaLine(m) : 'Empty slot'}</div>
            </div>
            <div className="ss-actions">
              <button type="button" className="btn sm primary" onClick={() => (m ? confirm.ask(`save-${i}`, () => doSave(i)) : doSave(i))}>
                {confirm.armed === `save-${i}` ? 'Overwrite?' : 'Save'}
              </button>
              <button type="button" className="btn sm" disabled={!m} onClick={() => confirm.ask(`load-${i}`, () => doLoad(i))}>
                {confirm.armed === `load-${i}` ? 'Load? Unsaved progress is lost' : 'Load'}
              </button>
              {m && (
                <button type="button" className="btn sm ghost" title="Delete this save" onClick={() => confirm.ask(`del-${i}`, () => save.deleteSlot(i))}>
                  {confirm.armed === `del-${i}` ? 'Delete?' : <Icon name="trash" size={14} />}
                </button>
              )}
            </div>
          </div>
        ))}

        <div className={`save-slot${auto ? '' : ' empty'}`} style={{ marginTop: 6 }}>
          <Icon name="clock" size={18} style={{ color: auto ? 'var(--text-dim)' : 'var(--text-faint)' }} />
          <div>
            <div className="ss-name">Autosave <span className="faint mono" style={{ fontSize: 10, fontWeight: 400 }}>read-only</span></div>
            <div className="ss-meta">{auto ? metaLine(auto) : 'No autosave yet'}</div>
          </div>
          <div className="ss-actions">
            <button type="button" className="btn sm" disabled={!auto} onClick={() => confirm.ask('load-auto', doAuto)}>
              {confirm.armed === 'load-auto' ? 'Load? Unsaved progress is lost' : 'Load'}
            </button>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

/* ---------- Activity log ---------- */
const KIND_COLOR: Record<ToastKind, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--accent)' };
const minsAt = (tick: number) => (CONFIG.START_MINS + tick * (24 * 60 / CONFIG.TICKS_PER_DAY)) % (24 * 60);

function ActivityLog({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const rows = [...state.log].reverse();
  return (
    <ModalFrame title="Activity log" sub={`${rows.length} event${rows.length === 1 ? '' : 's'} · newest first`} onClose={onClose} width={680}>
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5, textAlign: 'center', padding: '28px 0' }}>Nothing logged yet — press <span className="kbd">space</span> to start the shift.</div>
      ) : (
        <div className="log-list">
          {rows.map(e => (
            <div key={e.id} className="log-row">
              <span className="lt">{clockLabel(minsAt(e.tick))} D{dayOf(e.tick)}</span>
              <span><b style={{ color: KIND_COLOR[e.kind] }}>{e.title}</b>{e.msg && <> <span className="lm">— {e.msg}</span></>}</span>
            </div>
          ))}
        </div>
      )}
    </ModalFrame>
  );
}

/* ---------- Help ---------- */
const LEGEND: { sev: 'ok' | 'warn' | 'bad' | 'pending' | 'idle'; label: string; desc: string }[] = [
  { sev: 'ok',      label: 'Green',  desc: 'healthy — serving traffic' },
  { sev: 'warn',    label: 'Amber',  desc: 'degrading — stale image, misplaced pods or overload' },
  { sev: 'bad',     label: 'Red',    desc: 'failing — crash loop, nothing ready' },
  { sev: 'pending', label: 'Indigo', desc: 'pending — rolling out or terminating' },
  { sev: 'idle',    label: 'Grey',   desc: 'idle — zero replicas' },
];
const SHORTCUTS: [string, string][] = [
  ['space', 'play / pause the clock'],
  ['1 · 2 · 3', 'Tickets · Cluster · Upgrades'],
  ['esc', 'close any dialog'],
];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalFrame title="How it works" sub="The loop, the status colors and the keys." onClose={onClose} width={720}>
      <IntroSteps />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <div>
          <div className="meter-label" style={{ marginBottom: 10 }}>Status colors</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {LEGEND.map(l => (
              <div key={l.sev} className="flex gap8" style={{ fontSize: 12 }}>
                <LED sev={l.sev} /> <b>{l.label}</b> <span className="muted">{l.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="meter-label" style={{ marginBottom: 10 }}>Keyboard</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex gap8" style={{ fontSize: 12 }}><span className="kbd">{k}</span> <span className="muted">{d}</span></div>
            ))}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

/* ---------- Outcome ---------- */
function OutcomeModal({ outcome, stats, onContinue, onNewGame }: { outcome: NonNullable<Outcome>; stats: Stats; onContinue: () => void; onNewGame: () => void }) {
  const won = outcome.kind === 'won';
  const tiles: [string, string][] = [
    ['Tickets resolved',   String(stats.ticketsResolved)],
    ['Incidents resolved', String(stats.incidentsResolved)],
    ['Days survived',      String(dayOf(outcome.atTick))],
    ['Money earned',       money(stats.moneyEarned)],
    ['Worst SLA',          `${stats.worstSla.toFixed(2)}%`],
    ['Outages survived / felt', `${stats.outagesSurvived} / ${stats.outagesFelt}`],
  ];
  return (
    <>
      <div className="overlay" />
      <div className="modal-wrap">
        <div className="modal" role="dialog" aria-label={won ? 'Campaign complete' : 'Shift over'} style={{ width: 560 }}>
          <div className={`outcome ${outcome.kind}`}>
            <div className="oc-ico"><Icon name={won ? 'trophy' : 'skull'} size={36} /></div>
            <h2>{won ? 'Campaign complete' : 'Shift over'}</h2>
            <p>{outcome.reason}</p>
            <div className="stat-grid">
              {tiles.map(([k, v]) => (
                <div key={k} className="stat-tile"><div className="k">{k}</div><div className="v">{v}</div></div>
              ))}
            </div>
            <div className="flex gap8" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={onContinue}><Icon name="play" size={14} /> Keep playing</button>
              <button type="button" className="btn ghost" onClick={onNewGame}><Icon name="restart" size={14} /> New game</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
