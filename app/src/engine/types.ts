/* ============================================================
   CLUSTER — engine types
   Pure data. No React, no DOM. Everything the save file stores.
   ============================================================ */

export type Sev = 'ok' | 'warn' | 'bad' | 'pending' | 'idle';
export type ServiceStatus =
  | 'Running' | 'Stale' | 'Degraded' | 'Pending' | 'CrashLoopBackOff' | 'Terminating' | 'Idle';

export type Hw = 'x86' | 'ARM' | 'GPU' | 'DATA';
export type NodeKind = 'generic' | 'special';
export type NodeTier = 'Normal' | 'Large' | 'Special';
export type WorkloadType = 'Pod' | 'Deployment';
export type Spread = 'auto' | 'manual';
export type Priority = 'high' | 'med' | 'low';
export type TicketType = 'new' | 'bug' | 'change';
export type TicketStatus = 'todo' | 'done';
export type Screen = 'tickets' | 'infra' | 'tree';
export type InfraTab = 'cluster' | 'repos' | 'registry' | 'ci';
export type BoardView = 'cards' | 'grid' | 'table';
export type Theme = 'daylight' | 'bubblegum' | 'voltage';
export type ToastKind = 'ok' | 'warn' | 'bad' | 'info';

export interface Lang { name: string; color: string }

export interface ClusterNode {
  id: string;
  name: string;
  kind: NodeKind;
  tier: NodeTier;
  slots: number;
  tags: Hw[];
  hw?: Hw;              // special nodes: locked hardware type
  downFor: number;      // >0 while the node is offline (outage event); ticks remaining
  provisionedTick: number;
}

export interface Repo { id: string; name: string; lang: string; desc: string }

export interface Image {
  id: string;
  repoId: string;
  version: number;
  tag: string;
  digest: string;
  builtTick: number;
  building: boolean;
  progress: number;     // 0..100
  fast: boolean;        // built with Image Caching
}

export interface Service {
  id: string;
  name: string;
  imageId: string;
  type: WorkloadType;
  replicas: number;
  liveness: boolean;
  readiness: boolean;
  affinity: Hw | null;
  spread: Spread;
  podNodes: string[];   // node id per replica (length == replicas once saved)
  status: ServiceStatus;
  ready: [number, number];
  restarts: number;
  errorRate: number;    // 0..1
  health: number;       // 0..100
  demand: number;       // base req/s before time-of-day multiplier
  age: number;
  settleIn: number;
  incidentCooldown: number;
  crashFor: number;     // ticks remaining in a crash loop (Deployments self-recover)
  lowLoadTicks: number; // for autoscaler scale-down
  createdTick: number;
}

export type CriterionKind = 'running' | 'replicas' | 'deployment' | 'ha' | 'node_tag' | 'latest' | 'stable' | 'probes' | 'spread';

export interface Criterion {
  kind: CriterionKind;
  svc: string;
  label: string;
  n?: number;           // replicas / spread
  tag?: Hw;             // node_tag
}

export interface SubCheck { label: string; met: boolean; hint?: string | null }
export interface GradedCriterion extends Criterion { met: boolean; subs?: SubCheck[] }

export interface Ticket {
  id: string;
  type: TicketType;
  requester: string;
  avatar: string;       // color
  prio: Priority;
  svc: string;          // service name the ticket concerns
  repo?: string;
  title: string;
  body: string;
  hint: string;
  reward: number;
  xp: number;
  criteria: Criterion[];
  status: TicketStatus;
  createdTick: number;
  dueTick?: number;     // soft deadline: reward decays after this
  resolvedTick?: number;
  paid: boolean;        // reward already paid (re-open/resolve never pays twice)
  regressed?: boolean;  // a regression incident has already been raised for this ticket
  first?: boolean;      // triggers the first-ticket beat
}

export interface PendingTicket { atTick: number; ticket: Ticket }

export type UpgradeEffect =
  | 'ci_autobuild' | 'fast_build' | 'deployments' | 'rolling' | 'dashboard' | 'self_heal'
  | 'large_nodes' | 'special_nodes' | 'affinity' | 'rebalance' | 'autoscale' | 'data_tier';

export type Branch = 'Build' | 'Workload' | 'Observability' | 'Infra' | 'Scaling';

export interface Upgrade {
  id: string;
  branch: Branch;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  xp: number;
  requires: string[];
  owned: boolean;
  effect: UpgradeEffect;
  final?: boolean;      // buying it completes the campaign
}

export interface Toast { id: string; kind: ToastKind; title: string; msg: string; at: number }

export interface Draft {
  name: string;
  imageId: string;
  type: WorkloadType;
  replicas: number;
  liveness: boolean;
  readiness: boolean;
  affinity: Hw | null;
  spread: Spread;
  podNodes: string[];
}

export interface FormState { open: boolean; editingId: string | null; draft: Draft | null }

export type EventKind = 'sale' | 'outage' | 'traffic_dip';
export interface WorldEvent {
  id: string;
  kind: EventKind;
  title: string;
  startTick: number;
  endTick: number;
  svc?: string;         // sale: which service is hit
  nodeId?: string;      // outage: which node
  mult?: number;        // demand multiplier
  announced: boolean;
}

export interface LogEntry { id: number; tick: number; kind: ToastKind; title: string; msg: string }

export interface Stats {
  ticketsResolved: number;
  incidentsResolved: number;
  incidentsRaised: number;
  moneyEarned: number;
  moneySpent: number;
  nodesProvisioned: number;
  imagesBuilt: number;
  peakServices: number;
  worstSla: number;
  outagesSurvived: number;   // node outage where no service hit 0 ready
  outagesFelt: number;
  bailouts: number;
  revenueEarned: number;
}

export type Outcome = null | { kind: 'won' | 'lost'; atTick: number; reason: string };

export interface GameState {
  version: number;                // save-format version
  clock: { tick: number; paused: boolean; speed: 1 | 2 | 4; mins: number };
  meters: { sla: number; budget: number; xp: number };
  nodes: ClusterNode[];
  repos: Repo[];
  images: Image[];
  services: Service[];
  tickets: Ticket[];
  pending: PendingTicket[];
  upgrades: Upgrade[];
  events: WorldEvent[];
  toasts: Toast[];
  form: FormState;
  ui: { screen: Screen; infraTab: InfraTab; boardView: BoardView; addNode: boolean };
  seq: { ticket: number; uid: number; bug: number };
  rng: number;                    // RNG seed, advanced every tick
  firstBeat: null | { id: string; title: string };
  flash: { bad: number | null; rebalance: number | null };  // tick stamps for UI pulses
  stats: Stats;
  outcome: Outcome;
  endless: boolean;               // keep playing after the campaign ends
  nextProcTick: number;           // when the next procedural ticket may land
  budgetDebtTicks: number;        // consecutive ticks below the debt floor
  lastOutageTick: number;
  settings: { drama: number; pauseOnTicket: boolean };
  log: LogEntry[];
  lastBailoutDay: number;
  toastStamp: Record<string, number>;   // service name → last automation toast tick
}

/* ---------- actions ---------- */
export type Action =
  | { type: 'NAV'; screen: Screen }
  | { type: 'INFRA_TAB'; tab: InfraTab }
  | { type: 'BOARD_VIEW'; view: BoardView }
  | { type: 'CLEAR_BEAT' }
  | { type: 'PAUSE'; paused: boolean }
  | { type: 'SPEED'; speed: 1 | 2 | 4 }
  | { type: 'TOGGLE_ADDNODE'; open?: boolean }
  | { type: 'PROVISION_NODE'; kind: NodeKind; tier?: NodeTier; hw?: Hw }
  | { type: 'DECOMMISSION_NODE'; id: string }
  | { type: 'NODE_ADD_TAG'; id: string; tag: Hw }
  | { type: 'NODE_REMOVE_TAG'; id: string; tag: Hw }
  | { type: 'TICKET_RESOLVE'; id: string }
  | { type: 'TICKET_REOPEN'; id: string }
  | { type: 'BUILD_IMAGE'; repoId: string }
  | { type: 'BUILD_TICK' }
  | { type: 'FORM_NEW'; imageId?: string }
  | { type: 'FORM_EDIT'; id: string }
  | { type: 'FORM_SET'; patch: Partial<Draft> }
  | { type: 'FORM_PLACE'; nodeId: string; delta: 1 | -1 }
  | { type: 'FORM_RESPREAD' }
  | { type: 'FORM_CLOSE' }
  | { type: 'SERVICE_SAVE' }
  | { type: 'SERVICE_DELETE'; id: string }
  | { type: 'SERVICE_RESTART'; id: string }
  | { type: 'BUY_UPGRADE'; id: string }
  | { type: 'DISMISS_TOAST'; id: string }
  | { type: 'TOAST'; kind: ToastKind; title: string; msg: string }
  | { type: 'TICK' }
  | { type: 'SET_DRAMA'; drama: number }
  | { type: 'SET_PAUSE_ON_TICKET'; on: boolean }
  | { type: 'BAILOUT' }
  | { type: 'CONTINUE_ENDLESS' }
  | { type: 'LOAD_STATE'; state: GameState }
  | { type: 'NEW_GAME'; seed?: number };
