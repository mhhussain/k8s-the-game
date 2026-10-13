/* ============================================================
   TICK — the drift engine. One game half-hour per call.
   Order: clock → tickets land → world events → CI → rebalance →
   per-service lifecycle → incidents → regressions → meters →
   economy → outcome.
   ============================================================ */
import { CONFIG } from './config';
import { makeBugTicket, makeRegressionTicket, proceduralTicket } from './content';
import { ticketMet } from './grader';
import { clamp, dayOf, effectiveDemand, hasUpgrade, isLatest, latestImages, money, pushToast, sevOf, svcCapacity, dailyUpkeep } from './helpers';
import { autoSpread, distinctNodes, misplaced, nodeIsUp, offlinePods, rehomeOffline, totalFree } from './placement';
import { makeRng } from './rng';
import { addLog } from './reducer';
import type { GameState, LogEntry, Service, Ticket, Toast, ToastKind, WorldEvent } from './types';

export function tick(state: GameState): GameState {
  if (state.outcome && !state.endless) return state;
  const rng = makeRng(state.rng);
  const drama = state.settings.drama;
  const c = state.clock;
  const mins = (c.mins + 30) % (24 * 60);
  const nowTick = c.tick + 1;
  let toasts = state.toasts;
  let log = state.log;
  let stats = { ...state.stats };
  let toastStamp = { ...state.toastStamp };
  const say = (kind: ToastKind, title: string, msg: string) => { toasts = pushToast(toasts, kind, title, msg, nowTick); log = addLog(log, nowTick, kind, title, msg); };
  const note = (kind: ToastKind, title: string, msg: string) => { log = addLog(log, nowTick, kind, title, msg); };
  /* per-service rate-limited automation toast */
  const saySvc = (svc: string, kind: ToastKind, title: string, msg: string) => {
    if ((toastStamp[svc] ?? -999) + CONFIG.TOAST_RATE_TICKS > nowTick) { note(kind, title, msg); return; }
    toastStamp[svc] = nowTick; say(kind, title, msg);
  };

  const selfHeal  = hasUpgrade(state, 'self_heal');
  const autoscale = hasUpgrade(state, 'autoscale');
  const ciAuto    = hasUpgrade(state, 'ci_autobuild');
  const rolling   = hasUpgrade(state, 'rolling');
  const rebalance = hasUpgrade(state, 'rebalance');
  const fastBuild = hasUpgrade(state, 'fast_build');

  /* ---- ticket arrival ---- */
  let tickets = state.tickets;
  let pending = state.pending;
  let firstBeat = state.firstBeat;
  let paused = c.paused;
  let seq = { ...state.seq };
  let nextProcTick = state.nextProcTick;
  const landed = pending.filter(p => nowTick >= p.atTick);
  if (landed.length) {
    pending = pending.filter(p => nowTick < p.atTick);
    for (const p of landed) {
      const t: Ticket = { ...p.ticket, createdTick: nowTick, dueTick: p.ticket.dueTick ?? nowTick + CONFIG.TICKS_PER_DAY * CONFIG.TICKET_DUE_DAYS[p.ticket.prio] };
      tickets = [...tickets, t];
      if (t.first) { firstBeat = { id: t.id, title: t.title }; paused = true; }
      else { say('info', 'New ticket', `${t.id} · ${t.title}`); if (state.settings.pauseOnTicket) paused = true; }
    }
  }
  /* procedural requests once the campaign queue is empty */
  if (!pending.length && nowTick >= nextProcTick) {
    const openReq = tickets.filter(t => t.status === 'todo' && t.type !== 'bug').length;
    if (openReq < CONFIG.PROC_MAX_OPEN) {
      const t = proceduralTicket({ ...state, tickets, clock: { ...c, tick: nowTick } }, rng, seq.ticket);
      if (t) {
        seq.ticket += 1;
        tickets = [...tickets, t];
        say('info', 'New ticket', `${t.id} · ${t.title}`);
        if (state.settings.pauseOnTicket) paused = true;
      }
    }
    nextProcTick = nowTick + rng.int(CONFIG.PROC_GAP[0], CONFIG.PROC_GAP[1]);
  }

  /* ---- world events ---- */
  let events: WorldEvent[] = state.events.filter(e => e.endTick > nowTick - 2);
  let nodes = state.nodes.map(n => n.downFor > 0 ? { ...n, downFor: n.downFor - 1 } : n);
  let lastOutageTick = state.lastOutageTick;
  // node outage: tests HA for real
  const upNodes = nodes.filter(nodeIsUp);
  if (state.services.some(s => s.replicas > 0) && nodes.length >= 2 && upNodes.length === nodes.length &&
      nowTick - lastOutageTick >= CONFIG.OUTAGE_MIN_GAP && rng.chance(CONFIG.OUTAGE_CHANCE * (0.6 + drama * 0.8))) {
    const victim = rng.pick(nodes);
    const dur = rng.int(CONFIG.OUTAGE_DURATION[0], CONFIG.OUTAGE_DURATION[1]);
    nodes = nodes.map(n => n.id === victim.id ? { ...n, downFor: dur } : n);
    lastOutageTick = nowTick;
    events = [...events, { id: `ev-${nowTick}`, kind: 'outage', title: `${victim.name} went offline`, startTick: nowTick, endTick: nowTick + dur, nodeId: victim.id, announced: true }];
    say('bad', 'Node outage', `${victim.name} is unreachable. Deployments will re-home; bare Pods on it are down.`);
  }
  for (const n of state.nodes) {
    const now = nodes.find(x => x.id === n.id);
    if (n.downFor === 1 && now && now.downFor === 0) say('ok', 'Node recovered', `${n.name} is back online.`);
  }
  // flash sales: announced a day ahead, hit one service
  const lastSale = [...events].reverse().find(e => e.kind === 'sale');
  const saleDue = !lastSale || nowTick - lastSale.startTick > rng.int(CONFIG.SALE_EVERY[0], CONFIG.SALE_EVERY[1]);
  if (saleDue && state.services.some(s => s.replicas > 0) && nowTick > 40 && rng.chance(0.08)) {
    const victim = rng.pick(state.services.filter(s => s.replicas > 0));
    const start = nowTick + CONFIG.SALE_LEAD;
    events = [...events, { id: `ev-${nowTick}`, kind: 'sale', title: `Flash sale: ${victim.name}`, startTick: start, endTick: start + CONFIG.SALE_DURATION, svc: victim.name, mult: CONFIG.SALE_MULT, announced: true }];
    say('warn', 'Heads-up from Growth', `Flash sale hits ${victim.name} in ~${Math.round(CONFIG.SALE_LEAD / 2)}h — expect ${CONFIG.SALE_MULT}× traffic.`);
  }
  for (const ev of events) {
    if (ev.kind === 'sale' && ev.startTick === nowTick) say('warn', 'Flash sale live', `${ev.svc} is getting ${ev.mult}× traffic.`);
    if (ev.kind === 'sale' && ev.endTick === nowTick) note('info', 'Flash sale over', `${ev.svc} traffic back to normal.`);
  }

  /* ---- CI auto-build (only repos with a live service) ---- */
  let images = state.images;
  if (ciAuto && nowTick % CONFIG.CI_EVERY === 0) {
    const liveRepos = state.repos.filter(r => state.services.some(s => s.name === r.name && s.replicas > 0) && !images.some(i => i.repoId === r.id && i.building));
    if (liveRepos.length) {
      const repo = rng.pick(liveRepos);
      const maxV = Math.max(0, ...images.filter(i => i.repoId === repo.id).map(i => i.version));
      seq.uid += 1;
      images = [...images, { id: `img-${seq.uid.toString(36)}`, repoId: repo.id, version: maxV + 1, tag: `${repo.name}:${maxV + 1}.0.0`,
        digest: 'sha256:' + rng.int(0x1000, 0xffff).toString(16) + '…' + rng.int(0x10, 0xff).toString(16),
        builtTick: nowTick, building: true, progress: 0, fast: fastBuild }];
      note('info', 'CI build', `${repo.name} → v${maxV + 1}`);
    }
  }

  /* ---- rebalance ---- */
  let rebalanceFlash = state.flash.rebalance;
  let services = state.services;
  const baseState: GameState = { ...state, nodes, images, services };
  if (rebalance && nowTick % CONFIG.REBALANCE_EVERY === 0 && services.length) {
    let moved = false;
    services = services.map(s => {
      if (s.replicas === 0) return s;
      const cur = { ...baseState, services };
      const fresh = autoSpread(cur, s.replicas, { affinity: s.affinity, exceptId: s.id });
      const before = misplaced(cur, s) + offlinePods(cur, s);
      const after = misplaced(cur, { ...s, podNodes: fresh }) + offlinePods(cur, { ...s, podNodes: fresh });
      if (after < before || (new Set(fresh).size > distinctNodes(s) && before === 0 && after === 0)) { moved = true; return { ...s, podNodes: fresh }; }
      return s;
    });
    if (moved) { rebalanceFlash = nowTick; saySvc('_rebalance', 'info', 'Auto-rebalance', 'Pods moved to even out the cluster.'); }
  }

  /* ---- Deployments re-home off offline nodes ---- */
  services = services.map(s => {
    if (s.type !== 'Deployment' || s.replicas === 0) return s;
    const cur = { ...baseState, services };
    if (offlinePods(cur, s) === 0) return s;
    const fresh = rehomeOffline(cur, s);
    if (fresh.some((nid, i) => nid !== s.podNodes[i])) { saySvc(s.name, 'info', 'Pods re-homed', `${s.name} moved off the failed node.`); return { ...s, podNodes: fresh }; }
    return s;
  });

  /* ---- per-service lifecycle ---- */
  const simState: GameState = { ...baseState, services, clock: { ...c, tick: nowTick, mins } };
  let revenuePerDay = 0;
  let anyZeroReadyDuringOutage = false;
  const outageActive = nodes.some(n => !nodeIsUp(n));
  services = services.map(s => {
    const ns: Service = { ...s, ready: [s.ready[0], s.ready[1]] };
    if (ns.replicas === 0) { ns.status = 'Idle'; ns.ready = [0, 0]; ns.errorRate = 0; ns.crashFor = 0; return ns; }

    const mis = misplaced(simState, ns);
    const off = offlinePods(simState, ns);
    const maxReady = Math.max(0, ns.replicas - mis - off);
    const demand = effectiveDemand(simState, ns);

    if (ns.settleIn > 0) {
      ns.settleIn -= 1;
      const got = Math.min(ns.ready[0] + Math.ceil(ns.replicas / 2), maxReady);
      ns.ready = [got, ns.replicas]; ns.status = 'Pending';
      // without a readiness probe, half-started pods take traffic and serve errors
      ns.errorRate = ns.readiness ? 0.004 : clamp(ns.errorRate * 0.5 + 0.08, 0, 0.3);
      if (ns.settleIn <= 0) {
        if (maxReady === 0)      { ns.status = 'CrashLoopBackOff'; ns.ready = [0, ns.replicas]; ns.health = 30; ns.errorRate = 0.4; }
        else if (mis + off > 0)  { ns.status = 'Degraded'; ns.ready = [maxReady, ns.replicas]; ns.health = 62; ns.errorRate = 0.12; }
        else                     { ns.status = 'Running'; ns.ready = [ns.replicas, ns.replicas]; ns.health = 100; ns.errorRate = ns.readiness ? 0.002 : 0.01; }
      }
      return ns;
    }

    ns.age += 1;
    if (ns.incidentCooldown > 0) ns.incidentCooldown -= 1;
    ns.demand = clamp(ns.demand + rng.range(CONFIG.DEMAND_DRIFT[0], CONFIG.DEMAND_DRIFT[1]), CONFIG.DEMAND_MIN, CONFIG.DEMAND_MAX);
    let load = demand / Math.max(svcCapacity(ns) * (Math.max(ns.ready[0], 1) / Math.max(ns.replicas, 1)), 1);

    /* autoscaler: respects slots, budget, and the replica cap; scales down on sustained low load */
    if (autoscale && ns.type === 'Deployment') {
      const free = totalFree(simState, null);
      if (load > CONFIG.AUTOSCALE_UP_LOAD && ns.replicas < CONFIG.AUTOSCALE_MAX) {
        if (free <= 0) saySvc(ns.name, 'warn', 'Autoscaler blocked', `${ns.name} needs a replica but the cluster is out of slots.`);
        else if (state.meters.budget < 0) saySvc(ns.name, 'warn', 'Autoscaler blocked', `${ns.name} needs a replica but the budget is negative.`);
        else {
          ns.replicas += 1; ns.podNodes = autoSpread(simState, ns.replicas, { affinity: ns.affinity, exceptId: ns.id });
          ns.ready = [ns.ready[0], ns.replicas]; ns.lowLoadTicks = 0;
          saySvc(ns.name, 'info', 'Autoscaled up', `${ns.name} → ${ns.replicas} replicas`);
          load = demand / svcCapacity(ns);
        }
      } else if (load < CONFIG.AUTOSCALE_DOWN_LOAD && ns.replicas > CONFIG.AUTOSCALE_MIN) {
        ns.lowLoadTicks += 1;
        if (ns.lowLoadTicks >= CONFIG.AUTOSCALE_DOWN_TICKS) {
          ns.replicas -= 1; ns.podNodes = ns.podNodes.slice(0, ns.replicas); ns.ready = [Math.min(ns.ready[0], ns.replicas), ns.replicas]; ns.lowLoadTicks = 0;
          saySvc(ns.name, 'info', 'Autoscaled down', `${ns.name} → ${ns.replicas} replicas (traffic faded)`);
        }
      } else ns.lowLoadTicks = 0;
    }

    /* misplaced / offline pods keep the service unhealthy regardless of load */
    if (maxReady === 0) {
      ns.status = 'CrashLoopBackOff'; ns.ready = [0, ns.replicas];
      ns.errorRate = clamp(ns.errorRate * 0.6 + 0.16, 0.2, 0.9); ns.health = clamp(ns.health - 6, 0, 100);
      if (outageActive && off > 0) anyZeroReadyDuringOutage = true;
      return ns;
    }
    if (mis + off > 0) {
      ns.status = 'Degraded'; ns.ready = [Math.min(ns.ready[0] + 1, maxReady), ns.replicas];
      ns.errorRate = clamp(ns.errorRate * 0.6 + 0.04, 0, 0.9); ns.health = clamp(ns.health - 1, 30, 100);
      revenuePerDay += Math.min(demand, svcCapacity(ns) * ns.ready[0] / ns.replicas) * (1 - ns.errorRate) * CONFIG.REVENUE_PER_REQ;
      return ns;
    }

    /* stale drift */
    const stale = !isLatest(simState, ns);
    if (stale) {
      if (rolling && ns.status === 'Running') {
        const img = images.find(x => x.id === ns.imageId);
        const latest = latestImages(simState).find(i => img && i.repoId === img.repoId);
        if (latest) { ns.imageId = latest.id; saySvc(ns.name, 'ok', 'Rolling update', `${ns.name} → ${latest.tag}`); }
      } else if (ns.status === 'Running' && ns.age > CONFIG.STALE_AGE && rng.chance(CONFIG.STALE_CHANCE)) {
        ns.status = 'Stale';
      }
    }

    let dH = load > 1.1 ? -(load - 1) * 9 : 4;
    if (ns.status === 'Stale') dH -= 1.5;
    ns.health = clamp(ns.health + dH, 0, 100);

    const baseErr = (load > 1 ? (load - 1) * 0.4 : (ns.readiness ? 0.002 : 0.006)) + (ns.status === 'Stale' ? 0.03 : 0);
    ns.errorRate = clamp(ns.errorRate * 0.6 + baseErr * 0.4, 0, 0.95);

    /* crash loops */
    if (ns.status !== 'CrashLoopBackOff') {
      const risk = (1 - ns.health / 100) * (CONFIG.CRASH_RISK_BASE + drama * CONFIG.CRASH_RISK_DRAMA) * (ns.liveness ? 0.7 : 1);
      if (ns.incidentCooldown === 0 && rng.chance(risk * 0.5)) {
        ns.status = 'CrashLoopBackOff'; ns.restarts += rng.int(1, 3);
        ns.ready = [Math.max(0, ns.ready[0] - 1), ns.replicas]; ns.incidentCooldown = 4;
        // Deployments recreate the pod on their own; bare Pods stay dead until restarted or self-healed
        ns.crashFor = ns.type === 'Deployment' ? (ns.liveness ? CONFIG.LIVENESS_CRASH_RECOVERY : CONFIG.DEPLOYMENT_CRASH_RECOVERY) : -1;
      }
    }

    if (ns.status === 'CrashLoopBackOff') {
      const heal = (selfHeal && rng.chance(CONFIG.SELF_HEAL_CHANCE)) || (ns.crashFor === 0);
      if (ns.crashFor > 0) ns.crashFor -= 1;
      if (heal) {
        ns.status = 'Running'; ns.ready = [maxReady, ns.replicas]; ns.health = clamp(ns.health + 25, 0, 100); ns.errorRate = 0.01; ns.crashFor = 0;
        saySvc(ns.name, 'ok', selfHeal ? 'Self-healed' : 'Pod recreated', `${ns.name} recovered${selfHeal ? ' automatically' : ' (Deployment)'}`);
      }
    } else if (ns.status === 'Stale' && ns.health > 55 && load < 0.9 && !stale) {
      ns.status = 'Running';
    } else if (ns.status === 'Degraded' && load < 0.9) {
      ns.status = 'Running';
    } else if (ns.status === 'Running' && load > 1.2 && ns.health < 60) {
      ns.status = 'Degraded';
    }
    if (ns.status === 'Running' && ns.ready[0] < maxReady) ns.ready = [Math.min(ns.ready[0] + 1, maxReady), ns.replicas];

    const served = Math.min(demand, svcCapacity(ns) * (ns.ready[0] / Math.max(ns.replicas, 1))) * (1 - ns.errorRate);
    if (ns.status !== 'CrashLoopBackOff') revenuePerDay += served * CONFIG.REVENUE_PER_REQ;
    return ns;
  });

  /* outage bookkeeping: scored when the node comes back */
  for (const n of state.nodes) {
    if (n.downFor === 1) {
      const felt = anyZeroReadyDuringOutage || services.some(s => s.replicas > 0 && s.ready[0] === 0 && s.podNodes.includes(n.id));
      if (felt) stats.outagesFelt += 1; else { stats.outagesSurvived += 1; say('ok', 'Outage survived', `${n.name} failed and nothing went down. That’s HA.`); }
    }
  }

  /* ---- incidents ---- */
  const curState: GameState = { ...simState, services, tickets };
  const openBugs = tickets.filter(t => t.status === 'todo' && t.type === 'bug').length;
  if (openBugs < CONFIG.INCIDENT_MAX_OPEN) {
    for (const s of services) {
      const troubled = sevOf(s.status) === 'bad' || s.status === 'Stale' || s.errorRate > 0.18;
      if (!troubled) continue;
      if (tickets.some(t => t.type === 'bug' && t.svc === s.name && t.status === 'todo')) continue;
      if (!rng.chance(CONFIG.INCIDENT_BASE + drama * CONFIG.INCIDENT_DRAMA)) continue;
      const overload = effectiveDemand(curState, s) > svcCapacity(s);
      const bug = makeBugTicket(curState, s, seq.bug, overload);
      seq.bug += 1;
      tickets = [...tickets, bug];
      stats.incidentsRaised += 1;
      say('bad', 'New incident', `${bug.id} · ${s.name}`);
    }
  }

  /* ---- regressions: resolved requests are standing SLOs ---- */
  tickets = tickets.map(t => {
    if (t.status !== 'done' || t.type === 'bug' || t.regressed) return t;
    if (t.resolvedTick != null && nowTick - t.resolvedTick < CONFIG.REGRESSION_GRACE) return t;
    if (ticketMet({ ...curState, tickets }, t)) return t;
    if (tickets.some(b => b.type === 'bug' && b.status === 'todo' && b.svc === t.svc)) return t;
    const reg = makeRegressionTicket(curState, t, seq.bug);
    seq.bug += 1;
    tickets = [...tickets, reg];
    say('bad', 'Regression', `${reg.id} · ${t.svc} — “${t.title}” isn’t true anymore`);
    if (state.settings.pauseOnTicket) paused = true;
    return { ...t, regressed: true };
  });
  // un-flag regressions once the regression incident is resolved (so a later break raises a fresh one)
  tickets = tickets.map(t => {
    if (!t.regressed) return t;
    const open = tickets.some(b => b.type === 'bug' && b.status === 'todo' && b.svc === t.svc);
    return open ? t : { ...t, regressed: false, resolvedTick: nowTick };
  });

  /* ---- meters ---- */
  let sla = state.meters.sla;
  const anyBad = services.some(s => sevOf(s.status) === 'bad');
  const anyWarn = services.some(s => sevOf(s.status) === 'warn');
  if (anyBad) sla = clamp(sla - rng.range(CONFIG.SLA_BAD[0], CONFIG.SLA_BAD[1]), CONFIG.SLA_MIN, 100);
  else if (anyWarn) sla = clamp(sla - rng.range(CONFIG.SLA_WARN[0], CONFIG.SLA_WARN[1]), CONFIG.SLA_MIN, 100);
  else sla = clamp(sla + CONFIG.SLA_RECOVER, CONFIG.SLA_MIN, 100);
  stats.worstSla = Math.min(stats.worstSla, sla);

  /* ---- economy ---- */
  const upkeep = dailyUpkeep({ ...state, services, nodes });
  const revenueTick = revenuePerDay / CONFIG.TICKS_PER_DAY;
  let budget = state.meters.budget - upkeep / CONFIG.TICKS_PER_DAY + revenueTick;
  stats.revenueEarned += revenueTick;
  let xp = state.meters.xp;
  // end-of-day: XP for healthy services
  if (nowTick % CONFIG.TICKS_PER_DAY === 0) {
    const healthy = services.filter(s => s.status === 'Running' && s.ready[0] === s.ready[1] && s.replicas > 0).length;
    if (healthy > 0) { xp += healthy * CONFIG.DAILY_XP_PER_HEALTHY; say('ok', `Day ${dayOf(nowTick - 1)} wrapped`, `${healthy} healthy service${healthy === 1 ? '' : 's'} · +${healthy * CONFIG.DAILY_XP_PER_HEALTHY} XP`); }
  }
  if (state.meters.budget >= 0 && budget < 0) say('bad', 'Budget negative', 'Upkeep outran income. Clear a paying ticket, trim pods, or request emergency funding.');

  /* ---- outcome: deep debt ---- */
  let budgetDebtTicks = budget < CONFIG.DEBT_FLOOR ? state.budgetDebtTicks + 1 : 0;
  let outcome = state.outcome;
  if (!outcome && budget < CONFIG.DEBT_FLOOR && state.budgetDebtTicks === 0) say('bad', 'Finance is watching', `Budget below ${money(CONFIG.DEBT_FLOOR)}. Recover within two days or the cluster gets shut down.`);
  if (!outcome && budgetDebtTicks >= CONFIG.DEBT_GRACE_TICKS) {
    outcome = { kind: 'lost', atTick: nowTick, reason: 'Two days in deep debt. Finance pulled the plug on prod-east-1.' };
    paused = true;
  }

  stats.peakServices = Math.max(stats.peakServices, services.length);

  return {
    ...state,
    clock: { ...c, tick: nowTick, mins, paused: paused || (outcome !== null && !state.endless) },
    nodes, images, services, tickets, pending, seq, firstBeat, events,
    meters: { sla, budget, xp },
    toasts, log, toastStamp,
    flash: { bad: anyBad && !state.services.some(s => sevOf(s.status) === 'bad') ? nowTick : state.flash.bad, rebalance: rebalanceFlash },
    stats, outcome, nextProcTick, budgetDebtTicks, lastOutageTick,
    rng: rng.seed(),
  };
}
