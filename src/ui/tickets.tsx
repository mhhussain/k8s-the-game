/* ============================================================
   CLUSTER — Ticket Board
   Two columns (Open / Resolved) · ticket types (new / bug / change) ·
   live acceptance-criteria checklist · validation + rejection ·
   soft deadlines (due chips, decayed rewards) · regression hints
   ============================================================ */
import React, { useEffect, useState } from 'react';
import {
  CONFIG, effectiveReward, findSvc, gradeTicket, money,
  type GradedCriterion, type Priority, type Ticket, type TicketType,
} from '../engine';
import { useGame } from '../store';
import { Avatar, Icon, LED } from './primitives';

const PRIO: Record<Priority, { c: string; l: string; rank: number }> = {
  high: { c: 'var(--bad)',    l: 'High',   rank: 0 },
  med:  { c: 'var(--warn)',   l: 'Medium', rank: 1 },
  low:  { c: 'var(--accent)', l: 'Low',    rank: 2 },
};
const TYPE: Record<TicketType, { label: string; icon: string; color: string; cls: string }> = {
  new:    { label: 'New service', icon: 'plus',  color: 'var(--accent)',  cls: '' },
  bug:    { label: 'Incident',    icon: 'alert', color: 'var(--bad)',     cls: '' },
  change: { label: 'Change',      icon: 'edit',  color: 'var(--pending)', cls: ' change' },
};

const isRegression = (t: Ticket) => t.type === 'bug' && t.title.startsWith('Regression:');

/* ---------- due dates (48 ticks/day, 30 game-minutes per tick) ---------- */
interface Due { label: string; cls: string; late: boolean }
function dueInfo(t: Ticket, tick: number): Due | null {
  if (t.type === 'bug' || t.dueTick === undefined) return null;
  const perDay = CONFIG.TICKS_PER_DAY;
  const perHour = perDay / 24;
  const rem = t.dueTick - tick;
  const late = rem < 0;
  const abs = Math.abs(rem);
  const d = Math.floor(abs / perDay);
  const h = Math.floor((abs % perDay) / perHour);
  const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : '<1h';
  if (late) return { label: `overdue ${span}`, cls: 'due-chip late', late: true };
  const soon = rem < perDay;
  return { label: `due in ${span}`, cls: `due-chip${soon ? ' soon' : ''}`, late: false };
}

function TypeBadge({ t }: { t: Ticket }) {
  const ty = TYPE[t.type];
  return (
    <span className={`type-badge${ty.cls}`} style={{ color: ty.color, borderColor: ty.color }}>
      <Icon name={ty.icon} size={11} /> {ty.label}
    </span>
  );
}

function RegressionPill() {
  return <span className="pill bad" style={{ padding: '1px 7px', fontSize: 10 }}>regression</span>;
}

/* ---------- board ---------- */
export function TicketBoard() {
  const { state, dispatch } = useGame();
  const [open, setOpenLocal] = useState<string | null>(null);
  // an external request (first-ticket beat, toasts) can ask the board to open a ticket
  useEffect(() => {
    if (state.ui.openTicket) { setOpenLocal(state.ui.openTicket); dispatch({ type: 'OPEN_TICKET', id: null }); }
  }, [state.ui.openTicket, dispatch]);
  const setOpen = setOpenLocal;
  const cols: { key: Ticket['status']; title: string; sev: 'pending' | 'ok' }[] = [
    { key: 'todo', title: 'Open',     sev: 'pending' },
    { key: 'done', title: 'Resolved', sev: 'ok' },
  ];
  const openCount = state.tickets.filter(t => t.status === 'todo').length;
  const bugCount = state.tickets.filter(t => t.status === 'todo' && t.type === 'bug').length;

  const sorted = (key: Ticket['status']): Ticket[] => {
    const list = state.tickets.filter(t => t.status === key);
    if (key === 'todo') {
      return list.sort((a, b) =>
        (a.type === 'bug' ? 0 : 1) - (b.type === 'bug' ? 0 : 1)
        || PRIO[a.prio].rank - PRIO[b.prio].rank
        || a.createdTick - b.createdTick);
    }
    return list.sort((a, b) => (b.resolvedTick ?? 0) - (a.resolvedTick ?? 0));
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Ticket Board</h1>
          <div className="sub">Work the cluster, then resolve a ticket — the system grades it against its acceptance criteria.</div>
        </div>
        <div className="flex gap8">
          {bugCount > 0 && <span className="pill bad"><Icon name="alert" size={13} /> {bugCount} incident{bugCount > 1 ? 's' : ''}</span>}
          <span className="pill"><Icon name="backlog" size={13} /> {openCount} open</span>
        </div>
      </div>

      <div className="screen-body">
        <div className="kanban two">
          {cols.map(col => {
            const list = sorted(col.key);
            return (
              <div key={col.key} className="kcol">
                <div className="kcol-head">
                  <span className="t"><LED sev={col.sev} /> {col.title}</span>
                  <span className="faint mono" style={{ fontSize: 11 }}>{list.length}</span>
                </div>
                <div className="kcol-list">
                  {list.map(t => <TicketCard key={t.id} t={t} onOpen={() => setOpen(t.id)} />)}
                  {!list.length && (
                    <div className="faint" style={{ textAlign: 'center', padding: '28px 8px', fontSize: 12 }}>
                      {col.key === 'done' ? 'Nothing resolved yet.' : 'All clear. Enjoy it while it lasts.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && <TicketDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------- card ---------- */
function TicketCard({ t, onOpen }: { t: Ticket; onOpen: () => void }) {
  const { state } = useGame();
  const graded = gradeTicket(state, t);
  const metN = graded.filter(c => c.met).length;
  const allMet = t.status === 'todo' && metN === graded.length;
  const due = t.status === 'todo' ? dueInfo(t, state.clock.tick) : null;
  return (
    <div className={`ticket${t.type === 'bug' ? ' bug' : ''}`} onClick={onOpen}>
      <span className="prio-bar" style={{ background: PRIO[t.prio].c }} />
      <div className="tk-top">
        <span className="flex gap8">
          <TypeBadge t={t} />
          {isRegression(t) && <RegressionPill />}
          <span className="tk-id">{t.id}</span>
        </span>
        <span className="flex gap8">
          {due && <span className={due.cls}>{due.label}</span>}
          {allMet && <span className="pill ok" style={{ padding: '1px 7px', fontSize: 10 }}><Icon name="check" size={11} /> ready</span>}
        </span>
      </div>
      <div className="tk-title">{t.title}</div>
      <div className="flex" style={{ justifyContent: 'space-between' }}>
        <div className="tk-req"><Avatar color={t.avatar} name={t.requester} /> {t.requester}</div>
        {t.status === 'todo' && <span className="crit-count mono">{metN}/{graded.length}</span>}
      </div>
    </div>
  );
}

/* ---------- criteria rows ---------- */
function CritBox({ met, size = 13 }: { met: boolean; size?: number }) {
  return <span className="crit-box">{met ? <Icon name="check" size={size} /> : <Icon name="close" size={size - 1} />}</span>;
}

function CritRow({ c, shake }: { c: GradedCriterion; shake: boolean }) {
  const flash = !c.met && shake ? ' unmet-flash' : '';
  if (c.subs) {
    return (
      <div className={`crit-group${c.met ? ' met' : ''}${flash}`}>
        <div className={`crit${c.met ? ' met' : ''}`}>
          <CritBox met={c.met} />
          <span className="crit-label">{c.label}</span>
        </div>
        <div className="crit-subs">
          {c.subs.map((s, j) => (
            <div key={j} className={`crit-sub${s.met ? ' met' : ''}`}>
              <span className="cs-box">{s.met ? <Icon name="check" size={11} /> : <Icon name="close" size={10} />}</span>
              {s.label}
              {!s.met && s.hint && <span className="cs-hint">{s.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={`crit${c.met ? ' met' : ''}${flash}`}>
      <CritBox met={c.met} />
      <span className="crit-label">{c.label}</span>
    </div>
  );
}

/* ---------- detail slide-over ---------- */
function TicketDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const [shake, setShake] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const t = state.tickets.find(x => x.id === id);
  if (!t) return null;
  const graded = gradeTicket(state, t);
  const metN = graded.filter(c => c.met).length;
  const allMet = metN === graded.length;
  const tick = state.clock.tick;
  const due = t.status === 'todo' ? dueInfo(t, tick) : null;
  const reward = effectiveReward(t, tick, CONFIG.TICKS_PER_DAY, CONFIG.DEADLINE_DECAY_PER_DAY, CONFIG.DEADLINE_DECAY_MIN);
  const decayed = t.status === 'todo' && reward < t.reward;
  const regressedNow = t.status === 'done' && !allMet;
  const serviceMissing = t.type === 'new' && !findSvc(state, t.svc);

  const resolve = () => {
    if (!allMet) { setShake(true); window.setTimeout(() => setShake(false), 500); }
    dispatch({ type: 'TICKET_RESOLVE', id: t.id });
    if (allMet) onClose();
  };
  const goBuild = () => {
    dispatch({ type: 'NAV', screen: 'infra' });
    dispatch({ type: 'INFRA_TAB', tab: serviceMissing ? 'repos' : 'cluster' });
    onClose();
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="slideover">
        <div className="so-head">
          <div>
            <div className="flex gap8" style={{ marginBottom: 6 }}>
              <TypeBadge t={t} />
              {isRegression(t) && <RegressionPill />}
              <span className="tk-id mono">{t.id}</span>
              <span className="pill" style={{ color: PRIO[t.prio].c, borderColor: PRIO[t.prio].c, padding: '1px 8px' }}>{PRIO[t.prio].l}</span>
              {due && <span className={due.cls}>{due.label}</span>}
            </div>
            <h2>{t.title}</h2>
            <div className="sub flex gap8" style={{ marginTop: 6 }}><Avatar color={t.avatar} name={t.requester} /> {t.requester}</div>
          </div>
          <button type="button" className="cbtn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        <div className="so-body">
          <div className="field">
            <label>The request</label>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>{t.body}</p>
          </div>

          {t.hint && (
            <div className="readbetween">
              <Icon name="alert" size={16} style={{ color: 'var(--warn)', marginTop: 1, flex: 'none' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3, color: 'var(--warn)' }}>Reading between the lines</div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{t.hint}</div>
              </div>
            </div>
          )}

          {/* live acceptance criteria checklist */}
          <div className={`field${shake ? ' shake' : ''}`} style={{ marginTop: 18 }}>
            <label className="flex" style={{ justifyContent: 'space-between' }}>
              Acceptance criteria
              <span className="mono faint" style={{ fontWeight: 400, fontSize: 11 }}>{metN}/{graded.length} met</span>
            </label>
            <div className="crit-list">
              {graded.map((c, i) => <CritRow key={i} c={c} shake={shake} />)}
            </div>
            {t.status === 'done' && !regressedNow && (
              <div className="hint" style={{ color: 'var(--ok)' }}><Icon name="check" size={12} style={{ verticalAlign: -1 }} /> Resolved — paid out {money(t.paidAmount ?? t.reward)}.</div>
            )}
            {regressedNow && (
              <div className="hint" style={{ color: 'var(--warn)' }}><Icon name="alert" size={12} style={{ verticalAlign: -1 }} /> Regressed — a resolved ticket is expected to stay true.</div>
            )}
          </div>

          <div className="divider" />
          <div className="flex gap16" style={{ fontSize: 12.5 }}>
            <div>
              <div className="faint mono" style={{ fontSize: 10.5, letterSpacing: '.05em' }}>REWARD</div>
              <b className="mono" style={{ color: 'var(--ok)', fontSize: 15 }}>+{money(t.status === 'done' ? t.reward : reward)}</b>
              {decayed && <div className="mono" style={{ fontSize: 10.5, color: 'var(--bad)' }}>late — reduced</div>}
            </div>
            <div>
              <div className="faint mono" style={{ fontSize: 10.5, letterSpacing: '.05em' }}>XP</div>
              <b className="mono" style={{ color: 'var(--accent)', fontSize: 15 }}>+{t.xp}</b>
            </div>
          </div>
        </div>

        <div className="so-foot">
          <span className="cost">
            {t.status === 'done' ? 'This ticket is resolved.'
              : allMet ? <span style={{ color: 'var(--ok)' }}>All criteria met — ready to resolve.</span>
              : 'Meet every criterion, then resolve.'}
          </span>
          {t.status === 'todo' && (
            <button type="button" className="btn ghost" onClick={goBuild}>{t.type === 'bug' ? 'Open cluster' : 'Go build'}</button>
          )}
          {t.status === 'todo'
            ? <button type="button" className={`btn ${allMet ? 'primary' : ''}`} onClick={resolve} style={!allMet ? { opacity: .75 } : undefined}>
                <Icon name="check" size={15} /> Mark done
              </button>
            : <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'TICKET_REOPEN', id: t.id })}>Re-open</button>}
        </div>
      </div>
    </>
  );
}
