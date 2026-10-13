/* ============================================================
   CLUSTER — tunables. Every simulation number lives here.
   Design-doc defaults are kept; additions are commented.
   ============================================================ */
import type { Hw, NodeTier } from './types';

export const CONFIG = {
  SAVE_VERSION: 1,

  /* clock */
  TICK_MS: 1100,
  TICKS_PER_DAY: 48,            // 30 game-minutes per tick
  START_MINS: 9 * 60,

  /* economy */
  START_BUDGET: 4200,
  POD_COST: 60,                 // $/pod/day
  NODE_COST: { Normal: 120, Large: 190, Special: 320 } as Record<NodeTier, number>,   // Large was 220 (review: marginal value)
  NODE_PROVISION: { Normal: 400, Large: 650, Special: 1150 } as Record<NodeTier, number>, // Large was 750
  NODE_DECOMMISSION_REFUND: 0.5,   // fraction of provision cost refunded (node must be empty)
  PER_REPLICA_CAP: 55,            // req/s per replica
  REVENUE_PER_REQ: 3.2,           // $/day per req/s actually served (new: healthy traffic pays)
  BAILOUT_AMOUNT: 1000,           // emergency funding (new): once per day when budget < 0
  BAILOUT_XP: 20,
  BUILD_COST: 0,                  // manual builds are free; stale incidents pay less instead
  DEBT_FLOOR: -2000,              // below this, the clock to game-over starts
  DEBT_GRACE_TICKS: 96,           // two full days in deep debt → the CFO pulls the plug
  DEADLINE_DECAY_MIN: 0.5,        // reward never decays below 50% after the due date
  DEADLINE_DECAY_PER_DAY: 0.25,   // reward loses 25% per day overdue

  /* nodes */
  HW: ['x86', 'ARM', 'GPU', 'DATA'] as Hw[],
  MAX_TAGS: 3,
  SLOTS: { Normal: 4, Large: 8, Special: 16 } as Record<NodeTier, number>,
  NODE_NAMES: ['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet','kilo','lima','mike','november','oscar','papa'],

  /* services */
  MAX_REPLICAS: 8,
  AUTOSCALE_MAX: 10,
  AUTOSCALE_UP_LOAD: 0.85,
  AUTOSCALE_DOWN_LOAD: 0.30,
  AUTOSCALE_DOWN_TICKS: 8,        // sustained low load before scaling down
  AUTOSCALE_MIN: 2,
  SETTLE_TICKS: 3,
  RESTART_SETTLE_TICKS: 2,
  DEPLOYMENT_CRASH_RECOVERY: 3,   // a Deployment recreates a crashed pod after this many ticks
  LIVENESS_CRASH_RECOVERY: 1,     // with a liveness probe, crash loops clear faster
  STALE_AGE: 6,
  STALE_CHANCE: 0.12,             // per tick once stale-eligible (prototype: 0.18)
  DEMAND_DRIFT: [-2.2, 2.8] as [number, number],   // gentle ramp (~+14 req/s per day); bursts come from sale events
  DEMAND_MIN: 10,
  DEMAND_MAX: 320,                // ×1.3 peak = 416 req/s < 8 replicas × 55

  /* builds */
  BUILD_STEP: 12,                 // % per tick
  BUILD_STEP_FAST: 34,
  CI_EVERY: 14,                   // ticks between CI auto-builds (prototype: 7); only repos with a live service
  REBALANCE_EVERY: 6,

  /* incidents */
  INCIDENT_BASE: 0.16,            // + drama * INCIDENT_DRAMA
  INCIDENT_DRAMA: 0.16,
  INCIDENT_MAX_OPEN: 6,
  INCIDENT_REWARD: 500,
  INCIDENT_REWARD_OVERLOAD: 650,
  INCIDENT_XP: 35,
  INCIDENT_REWARD_STALE: 150,     // self-inflicted (you built the new image) — pays little
  INCIDENT_XP_STALE: 10,
  ON_TIME_XP: 10,                 // bonus XP for resolving a request before its due date
  DAILY_XP_PER_HEALTHY: 4,        // XP each day per service that is Running with all pods ready
  REGRESSION_REWARD: 0,           // fixing what you broke pays nothing (no farm loop)
  REGRESSION_XP: 0,
  REGRESSION_GRACE: 6,            // ticks a resolved ticket may be unmet before a regression is raised
  CRASH_RISK_BASE: 0.25,
  CRASH_RISK_DRAMA: 0.35,
  SELF_HEAL_CHANCE: 0.5,

  /* SLA */
  SLA_MIN: 80,
  SLA_BAD: [0.15, 0.5] as [number, number],
  SLA_WARN: [0.02, 0.12] as [number, number],
  SLA_RECOVER: 0.08,

  /* world events (new) */
  OUTAGE_MIN_GAP: 60,             // ticks between node outages
  OUTAGE_CHANCE: 0.02,            // per tick once gap elapsed and ≥2 nodes
  OUTAGE_DURATION: [5, 9] as [number, number],
  SALE_EVERY: [70, 120] as [number, number],   // ticks between sale announcements
  SALE_LEAD: 24,                  // announced this many ticks ahead
  SALE_DURATION: 20,
  SALE_MULT: 2.2,

  /* procedural tickets (new) */
  PROC_FIRST: 100,                // first procedural ticket may land after the scripted ones
  PROC_GAP: [36, 64] as [number, number],
  PROC_MAX_OPEN: 3,               // max open non-incident tickets
  TICKET_DUE_DAYS: { high: 2, med: 3, low: 4 } as Record<'high' | 'med' | 'low', number>,

  /* traffic curve: multiplier by hour of day (new) */
  HOUR_CURVE: [0.55,0.5,0.5,0.5,0.55,0.6,0.7,0.85,1.0,1.1,1.15,1.2,1.25,1.25,1.3,1.25,1.2,1.15,1.1,1.05,0.95,0.85,0.75,0.65],

  /* ui */
  TOASTS_MAX: 5,
  TOAST_RATE_TICKS: 6,            // at most one automation toast per service per N ticks
  LOG_MAX: 80,                    // activity log entries kept
  AUTOSAVE_EVERY: 12,             // ticks
} as const;

export type Config = typeof CONFIG;
