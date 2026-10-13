/* ============================================================
   CLUSTER — Global HUD + Side navigation + Brand mark
   ============================================================ */
import React from 'react';
import {
  CONFIG, clamp, money, sevOf, hasUpgrade, dailyUpkeep, svcCapacity, effectiveDemand,
  dayOf, clockLabel, upgradeAffordable, type GameState, type Screen,
} from '../engine';
import { useGame } from '../store';
import { Icon, Meter } from './primitives';

export type Modal = 'log' | 'save' | 'settings' | 'help' | null;

/* $/day earned from traffic actually served right now (mirrors the tick's revenue rule) */
export function dailyTraffic(state: GameState): number {
  return state.services.reduce((acc, s) => {
    if (s.replicas === 0 || s.status === 'CrashLoopBackOff') return acc;
    const served = Math.min(effectiveDemand(state, s), svcCapacity(s) * s.ready[0] / Math.max(s.replicas, 1)) * (1 - s.errorRate);
    return acc + served * CONFIG.REVENUE_PER_REQ;
  }, 0);
}

export function HUD({ onOpen }: { onOpen: (m: Modal) => void }) {
  const { state, dispatch } = useGame();
  const { meters, clock } = state;
  const backlog = state.tickets.filter(t => t.status !== 'done').length;
  const bugs    = state.tickets.filter(t => t.status === 'todo' && t.type === 'bug').length;
  const hasDash = hasUpgrade(state, 'dashboard');

  const day = dayOf(clock.tick);
  const upkeep  = dailyUpkeep(state);
  const traffic = dailyTraffic(state);
  const budgetCol  = meters.budget > 2000 ? 'var(--ok)' : meters.budget > 0 ? 'var(--warn)' : 'var(--bad)';
  const backlogCol = backlog <= 2 ? 'var(--ok)' : backlog <= 4 ? 'var(--warn)' : 'var(--bad)';
  const slaCol     = meters.sla >= 99 ? 'var(--ok)' : meters.sla >= 96 ? 'var(--warn)' : 'var(--bad)';
  const flash = state.flash.bad !== null && clock.tick - state.flash.bad <= 1;
  const bailedToday = state.lastBailoutDay === day;

  const tools: { key: Exclude<Modal, null>; icon: string; title: string }[] = [
    { key: 'log',      icon: 'log',      title: 'Activity log' },
    { key: 'save',     icon: 'save',     title: 'Save / load' },
    { key: 'settings', icon: 'settings', title: 'Settings' },
    { key: 'help',     icon: 'help',     title: 'Help' },
  ];

  return (
    <div className="hud">
      <div className="hud-title">
        <b>Cluster</b>
        <span>prod-east-1</span>
      </div>

      <div className="hud-meters">
        {/* Budget — hero meter */}
        <div className={`meter hero${meters.budget < 0 ? ' flash' : ''}`}>
          <div className="meter-head">
            <span className="meter-label"><Icon name="budget" size={13} /> Budget</span>
            <span className="hud-income" title={`Traffic income +${money(traffic)}/day · upkeep −${money(upkeep)}/day · net ${money(traffic - upkeep)}/day`}>
              <span className="up">+{money(traffic)}</span> <span className="down">−{money(upkeep)}/day</span>
            </span>
          </div>
          <div className="meter-val" style={{ color: budgetCol, fontSize: 21 }}>{money(meters.budget)}</div>
          <div className="meter-bar"><i style={{ width: `${clamp(meters.budget / 6000 * 100, 0, 100)}%`, background: budgetCol }} /></div>
          {meters.budget < 0 && (
            <>
              <div className="meter-warn">provisioning locked — clear a ticket</div>
              <div className="hud-bailout">
                <button type="button" className="btn danger" disabled={bailedToday}
                        title={bailedToday ? 'Emergency funding is once per day' : `+${money(CONFIG.BAILOUT_AMOUNT)} · −${CONFIG.BAILOUT_XP} XP · once per day`}
                        onClick={() => dispatch({ type: 'BAILOUT' })}>
                  <Icon name="dollar" size={12} /> Emergency funding
                </button>
              </div>
            </>
          )}
        </div>

        <Meter icon="backlog" label="Open tickets" value={backlog} sub={bugs ? `· ${bugs} incident${bugs > 1 ? 's' : ''}` : 'to work'}
               pct={100 - backlog * 14} color={backlogCol} />

        {hasDash && (
          <Meter icon="sla" label="Uptime / SLA" value={meters.sla.toFixed(2)} sub="%"
                 pct={(meters.sla - 80) / 20 * 100} color={slaCol} flash={flash} />
        )}
      </div>

      {/* XP chip */}
      <div className="clock" style={{ paddingRight: 13 }}>
        <Icon name="bolt" size={14} style={{ color: 'var(--accent)' }} />
        <span className="clock-time" style={{ minWidth: 0, fontSize: 14 }}>{meters.xp} <span className="faint" style={{ fontSize: 11 }}>XP</span></span>
      </div>

      {/* Clock + transport */}
      <div className="clock">
        <div>
          <div className="clock-time">{clockLabel(clock.mins)}</div>
          <div className="clock-day">DAY {String(day).padStart(2, '0')}</div>
        </div>
        <div className="clock-btns">
          <button type="button" className={`cbtn${clock.paused ? ' active' : ''}`} title="Pause (space)"
                  onClick={() => dispatch({ type: 'PAUSE', paused: true })}><Icon name="pause" size={15} /></button>
          <div className="speed-group">
            {([1, 2, 4] as const).map(sp => (
              <button key={sp} type="button" className={`cbtn${!clock.paused && clock.speed === sp ? ' active' : ''}`}
                      onClick={() => dispatch({ type: 'SPEED', speed: sp })}>
                {sp}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tools: log / save / settings / help */}
      <div className="hud-right">
        {tools.map(t => (
          <button key={t.key} type="button" className="icon-btn" title={t.title} aria-label={t.title} onClick={() => onOpen(t.key)}>
            <Icon name={t.icon} size={16} />
          </button>
        ))}
      </div>

      {clock.paused && <div className="paused-banner">⏸ Paused — configure freely · press space to run</div>}
    </div>
  );
}

export function SideNav() {
  const { state, dispatch } = useGame();
  const backlog = state.tickets.filter(t => t.status !== 'done').length;
  const troubled = hasUpgrade(state, 'dashboard') ? state.services.filter(s => sevOf(s.status) === 'bad').length : 0;
  const affordable = state.upgrades.filter(u => upgradeAffordable(state, u)).length;

  const items: { key: Screen; icon: string; label: string; badge: number | null; warn?: boolean }[] = [
    { key: 'tickets', icon: 'tickets', label: 'Tickets',  badge: backlog || null },
    { key: 'infra',   icon: 'cluster', label: 'Cluster',  badge: troubled || null },
    { key: 'tree',    icon: 'tree',    label: 'Upgrades', badge: affordable || null, warn: true },
  ];
  return (
    <div className="sidenav">
      {items.map(it => (
        <button key={it.key} type="button" className={`navbtn${state.ui.screen === it.key ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'NAV', screen: it.key })}>
          <Icon name={it.icon} size={21} />
          <span>{it.label}</span>
          {it.badge ? <span className={`nav-badge${it.warn ? ' warn' : ''}`}>{it.badge}</span> : null}
        </button>
      ))}
      <div className="nav-spacer" />
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand-cell">
      <div className="brand-mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />
          <circle cx="12" cy="12" r="2.4" fill="#fff" stroke="none" />
        </svg>
      </div>
    </div>
  );
}
