/* ============================================================
   CLUSTER — simulation store  (light/playful redesign)
   Blank-slate start · staggered tickets · generic vs special
   nodes w/ editable tags · per-replica auto-spread placement ·
   config-time HA · affinity schedule-but-fail · Auto Rebalance
   ============================================================ */
const { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } = React;

/* ---------- helpers ---------- */
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 7);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const money = (n) => '$' + Math.round(n).toLocaleString();

const SEV = { Running:'ok', Stale:'warn', Degraded:'warn', Pending:'pending', CrashLoopBackOff:'bad', Terminating:'pending', Idle:'idle' };
const sevOf = (s) => SEV[s] || 'idle';

/* economy */
const POD_COST  = 60;                       // $/pod/day
const NODE_COST = { Normal: 120, Large: 220, Special: 320 };   // $/day upkeep
const NODE_PROVISION = { Normal: 400, Large: 750, Special: 1150 }; // one-time
const PER_REPLICA_CAP = 55;
const TICKS_PER_DAY = 48;

const HW = ['x86', 'ARM', 'GPU', 'DATA'];   // tags / special node types
const AFFINITIES = HW;
const GREEK = ['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet'];

const svcUpkeep  = (s) => s.replicas * POD_COST;
const nodeUpkeep = (n) => NODE_COST[n.kind==='special' ? 'Special' : n.tier] || NODE_COST.Normal;
const nodeSlots  = (n) => n.slots;
const svcCapacity = (s) => s.replicas * PER_REPLICA_CAP;

/* pods placed on a node, across all services (except one) */
function podsOnNode(state, nodeId, exceptId) {
  let n = 0;
  state.services.forEach(s => {
    if (s.id === exceptId) return;
    (s.podNodes || []).slice(0, s.replicas).forEach(nid => { if (nid === nodeId) n++; });
  });
  return n;
}
/* how many of a service's pods are misplaced (affinity tag absent on their node) */
function misplaced(state, s) {
  if (!s.affinity) return 0;
  return (s.podNodes || []).slice(0, s.replicas).filter(nid => {
    const n = state.nodes.find(x => x.id === nid);
    return !n || !n.tags.includes(s.affinity);
  }).length;
}
/* is a single pod (by node) healthy for this service? */
function podHealthy(state, s, nodeId) {
  if (!s.affinity) return true;
  const n = state.nodes.find(x => x.id === nodeId);
  return !!(n && n.tags.includes(s.affinity));
}
function distinctNodes(s) { return new Set((s.podNodes || []).slice(0, s.replicas)).size; }

/* ---------- auto-spread placement ----------
   Spread replicas across nodes that have free slots, one-per-node first
   (maximising distinct-node spread for HA), preferring affinity matches.
   Overflow onto non-matching nodes is allowed → those pods schedule-but-fail. */
function autoSpread(state, count, { affinity = null, exceptId = null } = {}) {
  const cap = {};
  state.nodes.forEach(n => { cap[n.id] = nodeSlots(n) - podsOnNode(state, n.id, exceptId); });
  const order = [...state.nodes].sort((a, b) => {
    const am = affinity ? (a.tags.includes(affinity) ? 0 : 1) : 0;
    const bm = affinity ? (b.tags.includes(affinity) ? 0 : 1) : 0;
    if (am !== bm) return am - bm;            // matching nodes first
    return cap[b.id] - cap[a.id];             // then most-free first
  });
  const out = [];
  // round-robin, one pod per node per pass, only onto nodes with remaining cap
  let guard = 0;
  while (out.length < count && guard < count * (order.length + 2)) {
    let placedThisPass = false;
    for (const n of order) {
      if (out.length >= count) break;
      if (cap[n.id] > 0) { out.push(n.id); cap[n.id]--; placedThisPass = true; }
    }
    if (!placedThisPass) break;               // every node full
    guard++;
  }
  // if still short (cluster full), pile remaining onto the most-free node anyway
  while (out.length < count) {
    const n = order[0] || state.nodes[0];
    out.push(n ? n.id : null);
  }
  return out;
}
/* manual: keep existing assignment but resize to `count` */
function resizePlacement(state, podNodes, count, fallbackNodeId) {
  const out = (podNodes || []).slice(0, count);
  while (out.length < count) out.push(fallbackNodeId || (state.nodes[0] && state.nodes[0].id));
  return out;
}

/* ---------- seed data (BLANK SLATE) ---------- */
const LANGS = { Go:'#1AA6C0', Node:'#5BA641', Python:'#4C6EF5', Rust:'#D2742B', Java:'#C85B5B' };

function seedState() {
  // exactly ONE generic, untagged, Normal node — nothing running
  const nodes = [
    { id:'node-alpha', name:'node-alpha', kind:'generic', tier:'Normal', slots:4, tags:[] },
  ];

  const repos = [
    { id:'repo-1', name:'web-storefront',   lang:'Node',   desc:'Customer-facing shop. The money-maker.' },
    { id:'repo-2', name:'checkout-api',     lang:'Go',     desc:'Payments + cart. Hates downtime.' },
    { id:'repo-3', name:'image-resizer',    lang:'Rust',   desc:'Thumbnails on demand. Bursty.' },
    { id:'repo-4', name:'recommend-engine', lang:'Python', desc:'"People also bought…" Spiky traffic.' },
    { id:'repo-5', name:'audit-log',        lang:'Java',   desc:'Compliance write-only firehose.' },
  ];

  const images = [];      // nothing built yet
  const services = [];    // nothing running yet

  /* staggered incoming tickets — the first lands a few seconds after start */
  const pending = [
    { atTick: 3,  first:true, ticket: tkNew('TCK-101', 'Priya · Finance', '#4C6EF5', 'med', 'web-storefront', 'repo-1',
        'Get web-storefront live',
        'Get the storefront running so the team has something to point at. Nothing fancy yet — just make it serve.',
        'Build the image first (drag the repo onto the Registry), then deploy a service from it.',
        700, 30,
        [{ kind:'running', svc:'web-storefront', label:'web-storefront is running' }]) },
    { atTick: 26, ticket: tkNew('TCK-102', 'Dana · Growth', '#5BA641', 'high', 'recommend-engine', 'repo-4',
        'Make the recommendation engine highly available',
        'Marketing’s "people also bought" strip goes live for the weekend campaign. It cannot blink — it needs to survive a node going down.',
        'High availability is config-checkable now: a Deployment with ≥2 replicas spread over ≥2 nodes. You’ll need to provision a second node — and unlock Deployments.',
        1100, 60,
        [ { kind:'running', svc:'recommend-engine', label:'recommend-engine is running' },
          { kind:'ha',      svc:'recommend-engine', label:'High availability' } ]) },
    { atTick: 60, ticket: tkNew('TCK-103', 'Marcus · Compliance', '#D2742B', 'med', 'audit-log', 'repo-5',
        'Stand up audit-log on DATA hardware',
        'Compliance needs audit-log running and keeping data "where the auditors expect it" — on a DATA node. And it must never be a single point of failure.',
        '"Where the auditors expect it" = a DATA-tagged node. Tag one of your generic nodes DATA (or provision a special DATA node), and keep it highly available.',
        950, 50,
        [ { kind:'running', svc:'audit-log', label:'audit-log is running' },
          { kind:'ha',      svc:'audit-log', label:'High availability' },
          { kind:'node_tag', svc:'audit-log', tag:'DATA', label:'Every replica on a DATA node' } ]) },
    { atTick: 96, ticket: tkNew('TCK-104', 'Sam · Ops', '#C85B5B', 'low', 'image-resizer', 'repo-3',
        'Thumbnails service for sale days',
        'Stand up image-resizer so the catalog stops loading broken thumbnails. Sale days get rough — expect bursts.',
        '"Sale days get rough" = give it headroom. Thin on replicas and it buckles the first busy afternoon.',
        800, 50,
        [ { kind:'running',  svc:'image-resizer', label:'image-resizer is running' },
          { kind:'replicas', svc:'image-resizer', n:3, label:'Headroom for bursts — ≥3 replicas' } ]) },
  ];

  const upgrades = [
    /* Build */
    { id:'u-ci1', branch:'Build', name:'Continuous Integration', icon:'ci',
      desc:'Auto-builds every repo into the Registry. Stop dragging.', cost:700, xp:0, requires:[], owned:false, effect:'ci_autobuild' },
    { id:'u-ci2', branch:'Build', name:'Image Caching', icon:'layers',
      desc:'Builds finish ~3× faster.', cost:1000, xp:60, requires:['u-ci1'], owned:false, effect:'fast_build' },

    /* Workload */
    { id:'u-wl1', branch:'Workload', name:'Deployments', icon:'deploy',
      desc:'Unlocks Deployment workloads — a failed pod is recreated on another node. Required for high availability.', cost:600, xp:0, requires:[], owned:false, effect:'deployments' },
    { id:'u-wl2', branch:'Workload', name:'Rolling Updates', icon:'rolling',
      desc:'Edit live with zero downtime, and auto-refresh Stale services to the latest build.', cost:1100, xp:80, requires:['u-wl1'], owned:false, effect:'rolling' },

    /* Observability */
    { id:'u-ob1', branch:'Observability', name:'Service Dashboard', icon:'eye',
      desc:'See live health for every service — status, restarts, error rate — and unlock health probes.', cost:800, xp:0, requires:[], owned:false, effect:'dashboard' },
    { id:'u-ob2', branch:'Observability', name:'Auto-Remediation', icon:'heart',
      desc:'Crashed pods are detected and restarted automatically.', cost:1500, xp:140, requires:['u-ob1'], owned:false, effect:'self_heal' },

    /* Infra */
    { id:'u-if1', branch:'Infra', name:'Large Nodes', icon:'server',
      desc:'Provision Large generic nodes (8 pod slots) for denser, flexible capacity.', cost:900, xp:40, requires:[], owned:false, effect:'large_nodes' },
    { id:'u-if2', branch:'Infra', name:'Specialized Hardware', icon:'cpu',
      desc:'Provision special nodes — x86 / ARM / GPU / DATA — each 16 slots and locked to one type. The way to get density.', cost:1500, xp:110, requires:['u-if1'], owned:false, effect:'special_nodes' },
    { id:'u-if3', branch:'Infra', name:'Node Affinity', icon:'pin',
      desc:'Declare a service’s required hardware. A replica that lands on a node without the tag still schedules — but fails to go live.', cost:1400, xp:120, requires:['u-if1'], owned:false, effect:'affinity' },
    { id:'u-if4', branch:'Infra', name:'Automatic Rebalance', icon:'balance',
      desc:'The scheduler quietly moves pods between nodes to even out utilization — and re-homes pods off overfull or wrong-tag nodes.', cost:2100, xp:200, requires:['u-if2'], owned:false, effect:'rebalance' },

    /* Scaling */
    { id:'u-sc1', branch:'Scaling', name:'Horizontal Autoscaler', icon:'scale',
      desc:'Adds replicas automatically when a service is overloaded.', cost:2000, xp:200, requires:['u-wl1','u-ob1'], owned:false, effect:'autoscale' },
    { id:'u-sc2', branch:'Scaling', name:'Secrets & Data Tier', icon:'lock',
      desc:'Managed databases, secrets, and backups. [later milestone]', cost:3200, xp:320, requires:['u-sc1'], owned:false, effect:'data', deferred:true },
  ];

  return {
    clock: { tick: 0, paused: true, speed: 1, mins: 9*60 },
    meters: { sla: 100, budget: 4200, xp: 0 },
    nodes, repos, images, services, tickets: [], pending, upgrades,
    toasts: [],
    form: { open:false, editingId:null, draft:null },
    ui: { screen:'tickets', infraTab:'cluster', boardView:'cards', selected:null, addNode:false },
    seq: { ticket: 105 },
    firstBeat: null,
  };
}

function tkNew(id, requester, avatar, prio, svc, repo, title, body, hint, reward, xp, criteria) {
  return { id, type:'new', requester, avatar, prio, svc, repo, title, body, hint, reward, xp, criteria, status:'todo' };
}

function mkService(o) {
  const replicas = o.replicas;
  return {
    id: o.id || uid('svc'),
    name:o.name, imageId:o.imageId, type:o.type, replicas,
    liveness: o.liveness||false, readiness: o.readiness||false,
    affinity: o.affinity||null,
    spread: o.spread || 'auto',
    podNodes: o.podNodes || [],
    status:o.status || 'Pending',
    ready: o.ready || [0, replicas],
    restarts: 0, errorRate: 0.002, health: 100,
    demand: o.demand != null ? o.demand : rnd(30, 70),
    age: 0, settleIn: o.status === 'Running' ? 0 : 3,
    incidentCooldown: 0,
  };
}

/* ============================================================
   ACCEPTANCE-CRITERIA GRADER
   ============================================================ */
function findSvc(state, name) { return state.services.find(s => s.name === name); }
function isLatest(state, s) {
  const imgs = state.images.filter(i => !i.building);
  const img = imgs.find(i => i.id === s.imageId);
  if (!img) return false;
  const maxV = Math.max(...imgs.filter(i => i.repoId === img.repoId).map(i => i.version));
  return img.version >= maxV;
}
/* HA sub-checks (config-time, concrete) */
function haSubs(state, s) {
  const placed = s ? (s.podNodes || []).slice(0, s.replicas) : [];
  const distinct = new Set(placed).size;
  const oneNode = state.nodes.length < 2;
  return [
    { label:'Deployment workload',               met: !!s && s.type === 'Deployment' },
    { label:'≥2 replicas',                   met: !!s && s.replicas >= 2 },
    { label:'Replicas spread across ≥2 nodes', met: distinct >= 2,
      hint: (distinct < 2 && oneNode) ? 'needs another node' : null },
  ];
}
function gradeCriterion(state, c) {
  const s = findSvc(state, c.svc);
  switch (c.kind) {
    case 'running':  return !!s && s.replicas > 0 && s.status !== 'Pending' && s.status !== 'CrashLoopBackOff' && s.ready[0] > 0;
    case 'replicas': return !!s && s.replicas >= c.n;
    case 'deployment': return !!s && s.type === 'Deployment';
    case 'ha':       return haSubs(state, s).every(x => x.met);
    case 'node_tag': {
      if (!s) return false;
      const placed = (s.podNodes || []).slice(0, s.replicas);
      if (!placed.length) return false;
      return placed.every(nid => { const n = state.nodes.find(nn => nn.id === nid); return n && n.tags.includes(c.tag); });
    }
    case 'latest':   return !!s && isLatest(state, s) && s.status !== 'Stale';
    case 'stable':   return !!s && s.status === 'Running' && s.errorRate < 0.06 && s.ready[0] === s.ready[1] && s.replicas > 0 && misplaced(state, s) === 0;
    default: return false;
  }
}
function gradeTicket(state, t) {
  return (t.criteria || []).map(c => {
    const met = gradeCriterion(state, c);
    if (c.kind === 'ha') return { ...c, met, subs: haSubs(state, findSvc(state, c.svc)) };
    return { ...c, met };
  });
}
function ticketMet(state, t) { return (t.criteria || []).every(c => gradeCriterion(state, c)); }

/* ============================================================
   REDUCER
   ============================================================ */
function reducer(state, action) {
  switch (action.type) {

    case 'NAV':       return { ...state, ui:{ ...state.ui, screen:action.screen } };
    case 'INFRA_TAB': return { ...state, ui:{ ...state.ui, infraTab:action.tab } };
    case 'BOARD_VIEW':return { ...state, ui:{ ...state.ui, boardView:action.view } };
    case 'SELECT':    return { ...state, ui:{ ...state.ui, selected:action.id } };
    case 'CLEAR_BEAT':return { ...state, firstBeat:null };

    case 'PAUSE':     return { ...state, clock:{ ...state.clock, paused:action.paused } };
    case 'SPEED':     return { ...state, clock:{ ...state.clock, speed:action.speed, paused:false } };

    /* ---- nodes: provisioning + editable tags ---- */
    case 'TOGGLE_ADDNODE': return { ...state, ui:{ ...state.ui, addNode: action.open != null ? action.open : !state.ui.addNode } };
    case 'PROVISION_NODE': {
      const { kind, tier, hw } = action;
      const cost = NODE_PROVISION[kind==='special'?'Special':tier] || NODE_PROVISION.Normal;
      if (state.meters.budget < cost) {
        return { ...state, toasts: pushToast(state.toasts, 'warn', 'Not enough budget', `Provisioning needs ${money(cost)}.`) };
      }
      const name = 'node-' + (GREEK[state.nodes.length] || ('n'+(state.nodes.length+1)));
      const node = kind === 'special'
        ? { id:uid('node'), name, kind:'special', tier:'Special', slots:16, tags:[hw], hw }
        : { id:uid('node'), name, kind:'generic', tier, slots: tier==='Large'?8:4, tags:[] };
      return { ...state, nodes:[...state.nodes, node],
        ui:{ ...state.ui, addNode:false },
        meters:{ ...state.meters, budget: state.meters.budget - cost },
        toasts: pushToast(state.toasts, 'ok', 'Node provisioned', `${name} · ${kind==='special'?hw+' · 16 slots':tier+' · '+(tier==='Large'?8:4)+' slots'}`) };
    }
    case 'NODE_ADD_TAG': {
      const nodes = state.nodes.map(n => (n.id===action.id && n.kind==='generic' && !n.tags.includes(action.tag) && n.tags.length<3)
        ? { ...n, tags:[...n.tags, action.tag] } : n);
      return { ...state, nodes };
    }
    case 'NODE_REMOVE_TAG': {
      const nodes = state.nodes.map(n => (n.id===action.id && n.kind==='generic')
        ? { ...n, tags:n.tags.filter(t=>t!==action.tag) } : n);
      return { ...state, nodes };
    }

    /* ---- tickets ---- */
    case 'TICKET_RESOLVE': {
      const t = state.tickets.find(x => x.id === action.id);
      if (!t || t.status === 'done') return state;
      if (!ticketMet(state, t)) {
        return { ...state, toasts: pushToast(state.toasts, 'warn', 'Not yet', `${t.id} — acceptance criteria not met`) };
      }
      const tickets = state.tickets.map(x => x.id === action.id ? { ...x, status:'done' } : x);
      return { ...state, tickets,
        meters:{ ...state.meters, budget: state.meters.budget + t.reward, xp: state.meters.xp + t.xp },
        toasts: pushToast(state.toasts, 'ok', t.type==='bug'?'Incident resolved':'Ticket resolved', `${t.id} closed · +${money(t.reward)} · +${t.xp} XP`) };
    }
    case 'TICKET_REOPEN':
      return { ...state, tickets: state.tickets.map(x => x.id === action.id ? { ...x, status:'todo' } : x) };

    /* ---- registry / build ---- */
    case 'BUILD_IMAGE': {
      const repo = state.repos.find(r => r.id === action.repoId);
      if (!repo) return state;
      const fast = hasUpgrade(state, 'fast_build');
      const maxV = Math.max(0, ...state.images.filter(i => i.repoId === repo.id).map(i => i.version));
      const version = maxV + 1;
      const img = { id: uid('img'), repoId:repo.id, version, tag:`${repo.name}:${version}.0.0`,
        digest:'sha256:'+Math.random().toString(16).slice(2,6)+'…'+Math.random().toString(16).slice(2,4),
        builtTick: state.clock.tick, building:true, progress:0, fast };
      return { ...state, images:[...state.images, img],
        toasts: pushToast(state.toasts, 'info', 'Build started', `${repo.name} → v${version} (${fast?'cached':'cold'} build)`) };
    }
    case 'BUILD_TICK': {
      let any = false;
      const images = state.images.map(im => {
        if (!im.building) return im;
        any = true;
        const progress = im.progress + (im.fast ? 34 : 12);
        return progress >= 100 ? { ...im, building:false, progress:100 } : { ...im, progress };
      });
      if (!any) return state;
      const finished = images.filter((im,i) => state.images[i].building && !im.building);
      let toasts = state.toasts;
      finished.forEach(im => { toasts = pushToast(toasts, 'ok', 'Image built', im.tag); });
      return { ...state, images, toasts };
    }

    /* ---- service form ---- */
    case 'FORM_NEW':  return { ...state, form:{ open:true, editingId:null, draft: blankDraft(state) } };
    case 'FORM_EDIT': {
      const s = state.services.find(x => x.id === action.id);
      return { ...state, form:{ open:true, editingId:action.id, draft:{ ...s, podNodes:[...(s.podNodes||[])] } } };
    }
    case 'FORM_SET': {
      let patch = { ...action.patch };
      const cur = state.form.draft;
      if (patch.imageId) {
        const img = state.images.find(i => i.id === patch.imageId);
        const repo = img && state.repos.find(r => r.id === img.repoId);
        if (repo) patch.name = repo.name;
      }
      let next = { ...cur, ...patch };
      // recompute placement when sizing/affinity/spread change in auto mode
      const sizingChanged = ('replicas' in patch) || ('affinity' in patch) || ('spread' in patch);
      if (next.spread === 'auto' && (sizingChanged || !next.podNodes || next.podNodes.length !== next.replicas)) {
        next.podNodes = autoSpread(state, next.replicas, { affinity: next.affinity, exceptId: state.form.editingId });
      }
      if (next.spread === 'manual' && (('replicas' in patch))) {
        next.podNodes = resizePlacement(state, next.podNodes, next.replicas, state.nodes[0] && state.nodes[0].id);
      }
      return { ...state, form:{ ...state.form, draft: next } };
    }
    case 'FORM_PLACE': {
      // manual placement: add/remove one pod on a node (delta)
      const d = state.form.draft;
      let pn = [...(d.podNodes || [])];
      if (action.delta > 0) {
        if (pn.length < d.replicas) pn.push(action.nodeId);
      } else {
        const idx = pn.lastIndexOf(action.nodeId);
        if (idx >= 0) pn.splice(idx, 1);
      }
      return { ...state, form:{ ...state.form, draft:{ ...d, podNodes: pn } } };
    }
    case 'FORM_RESPREAD': {
      const d = state.form.draft;
      return { ...state, form:{ ...state.form, draft:{ ...d, podNodes: autoSpread(state, d.replicas, { affinity:d.affinity, exceptId:state.form.editingId }) } } };
    }
    case 'FORM_CLOSE':return { ...state, form:{ open:false, editingId:null, draft:null } };

    case 'SERVICE_SAVE': {
      const d = state.form.draft;
      const rolling = hasUpgrade(state, 'rolling');
      const isNew = !state.form.editingId;
      const prev = isNew ? null : state.services.find(s => s.id === state.form.editingId);
      const addedPods = d.replicas - (prev ? prev.replicas : 0);
      if (addedPods > 0 && state.meters.budget < 0) {
        return { ...state, toasts: pushToast(state.toasts, 'bad', 'Budget too low', 'Clear a paying ticket before adding pods.') };
      }
      let podNodes = (d.podNodes && d.podNodes.length === d.replicas)
        ? d.podNodes : autoSpread(state, d.replicas, { affinity:d.affinity, exceptId:state.form.editingId });
      if (isNew) {
        const ns = mkService({ ...d, podNodes, status: d.replicas===0?'Idle':'Pending', ready:[0,d.replicas] });
        ns.settleIn = d.replicas===0 ? 0 : 3;
        return { ...state, services:[...state.services, ns], form:{ open:false, editingId:null, draft:null },
          ui:{ ...state.ui, screen: state.ui.screen==='tickets' ? 'infra' : state.ui.screen, infraTab:'cluster' },
          toasts: pushToast(state.toasts, 'info', 'Service scheduled', `${d.name} → ${new Set(podNodes).size} node${new Set(podNodes).size>1?'s':''}`) };
      }
      const services = state.services.map(s => s.id === state.form.editingId
        ? { ...s, ...d, podNodes,
            status: rolling ? (d.replicas===0?'Idle':s.status==='Idle'?'Pending':s.status) : (d.replicas===0?'Idle':'Pending'),
            ready: rolling ? [Math.min(s.ready[0], d.replicas), d.replicas] : [0, d.replicas],
            settleIn: rolling ? 0 : (d.replicas===0?0:3) }
        : s);
      return { ...state, services, form:{ open:false, editingId:null, draft:null },
        toasts: pushToast(state.toasts, rolling?'ok':'info', rolling?'Rolling update':'Redeploying', `${d.name} · ${rolling?'zero downtime':'pods restarting'}`) };
    }
    case 'SERVICE_DELETE':
      return { ...state, services: state.services.filter(s => s.id !== action.id),
        ui:{ ...state.ui, selected:null },
        toasts: pushToast(state.toasts, 'warn', 'Service removed', action.name) };

    case 'SERVICE_RESTART': {
      const services = state.services.map(s => s.id===action.id
        ? { ...s, status: s.replicas===0?'Idle':'Pending', ready:[0,s.replicas], settleIn:2, errorRate:0.002, health:100, age:0 } : s);
      return { ...state, services, toasts: pushToast(state.toasts, 'info', 'Manual restart', 'Rolling pods…') };
    }

    /* ---- upgrades ---- */
    case 'BUY_UPGRADE': {
      const u = state.upgrades.find(x => x.id === action.id);
      if (!u || u.owned || u.deferred) return state;
      if (state.meters.budget < u.cost || state.meters.xp < u.xp) return state;
      const upgrades = state.upgrades.map(x => x.id===action.id ? { ...x, owned:true } : x);
      let st = { ...state, upgrades,
        meters:{ ...state.meters, budget: state.meters.budget - u.cost, xp: state.meters.xp - u.xp },
        toasts: pushToast(state.toasts, 'ok', 'Upgrade unlocked', u.name) };
      if (u.effect === 'dashboard') st = { ...st, toasts: pushToast(st.toasts, 'ok', 'Observability online', 'Live health is now visible on the Cluster board.') };
      return st;
    }

    case 'DISMISS_TOAST': return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    case 'TICK': return tick(state);
    default: return state;
  }
}

/* ---------- derived / helpers ---------- */
function hasUpgrade(state, effect) { return state.upgrades.some(u => u.owned && u.effect === effect); }
function blankDraft(state) {
  const img = latestImages(state)[0];
  let name = '';
  if (img) { const repo = state.repos.find(r => r.id === img.repoId); name = repo ? repo.name : ''; }
  const replicas = 2;
  const podNodes = autoSpread(state, replicas, { affinity:null });
  return { name, imageId: img ? img.id : '', type:'Pod',
    replicas, liveness:false, readiness:false, affinity:null, spread:'auto', podNodes };
}
function latestImages(state) {
  const byRepo = {};
  state.images.filter(i => !i.building).forEach(i => {
    if (!byRepo[i.repoId] || i.version > byRepo[i.repoId].version) byRepo[i.repoId] = i;
  });
  return Object.values(byRepo);
}
function pushToast(toasts, kind, title, msg) {
  return [...toasts.slice(-4), { id: uid('t'), kind, title, msg, at: Date.now() }];
}

/* ============================================================
   TICK — drift engine + ticket arrival + rebalance
   ============================================================ */
function tick(state) {
  const drama = window.__DRAMA != null ? window.__DRAMA : 0.6;
  const c = state.clock;
  const mins = (c.mins + 30) % (24*60);
  const nowTick = c.tick + 1;
  let toasts = state.toasts;

  const selfHeal   = hasUpgrade(state, 'self_heal');
  const autoscale  = hasUpgrade(state, 'autoscale');
  const ciAuto     = hasUpgrade(state, 'ci_autobuild');
  const rolling    = hasUpgrade(state, 'rolling');
  const rebalance  = hasUpgrade(state, 'rebalance');

  /* ---- ticket arrival from the pending queue ---- */
  let tickets = state.tickets;
  let pending = state.pending;
  let firstBeat = state.firstBeat;
  const landed = pending.filter(p => nowTick >= p.atTick);
  if (landed.length) {
    pending = pending.filter(p => nowTick < p.atTick);
    landed.forEach(p => {
      tickets = [...tickets, p.ticket];
      if (p.first) firstBeat = { id:p.ticket.id, title:p.ticket.title };
      else toasts = pushToast(toasts, 'info', 'New ticket', `${p.ticket.id} · ${p.ticket.title}`);
    });
  }

  /* CI auto-build */
  let images = state.images;
  if (ciAuto && nowTick % 7 === 0 && state.services.length) {
    const repo = pick(state.repos);
    if (repo) {
      const maxV = Math.max(0, ...images.filter(i => i.repoId === repo.id).map(i => i.version));
      images = [...images, { id: uid('img'), repoId:repo.id, version:maxV+1, tag:`${repo.name}:${maxV+1}.0.0`,
        digest:'sha256:'+Math.random().toString(16).slice(2,6)+'…', builtTick:nowTick, building:true, progress:0, fast:true }];
    }
  }

  /* ---- rebalance: re-home pods every few ticks ---- */
  let rebalanceFlash = state._rebalanceFlash;
  let nodes = state.nodes;
  let services = state.services;
  if (rebalance && nowTick % 6 === 0 && services.length) {
    let moved = false;
    services = services.map(s => {
      if (s.replicas === 0) return s;
      const fresh = autoSpread({ ...state, services }, s.replicas, { affinity:s.affinity, exceptId:s.id });
      // only adopt if it reduces misplacement or improves spread
      const before = misplaced({ ...state }, s);
      const afterMis = s.affinity ? fresh.filter(nid => { const n=state.nodes.find(x=>x.id===nid); return !n||!n.tags.includes(s.affinity); }).length : 0;
      if (afterMis < before || (new Set(fresh).size > distinctNodes(s) && before===0 && afterMis===0)) {
        moved = true; return { ...s, podNodes: fresh };
      }
      return s;
    });
    if (moved) { rebalanceFlash = Date.now(); if (nowTick % 12 === 0) toasts = pushToast(toasts, 'info', 'Auto-rebalance', 'Pods moved to even out the cluster.'); }
  }

  services = services.map(s => {
    let ns = { ...s };
    if (ns.replicas === 0) { ns.status = 'Idle'; ns.ready = [0,0]; ns.errorRate = 0; return ns; }

    const mis = misplaced(state, ns);
    const maxReady = Math.max(0, ns.replicas - mis);

    if (ns.settleIn > 0) {
      ns.settleIn -= 1;
      const got = Math.min(ns.ready[0] + Math.ceil(ns.replicas/2), maxReady);
      ns.ready = [got, ns.replicas]; ns.status = 'Pending';
      if (ns.settleIn <= 0) {
        if (mis >= ns.replicas) { ns.status='CrashLoopBackOff'; ns.ready=[0,ns.replicas]; ns.health=30; ns.errorRate=0.4; }
        else if (mis > 0)       { ns.status='Degraded'; ns.ready=[maxReady,ns.replicas]; ns.health=62; ns.errorRate=0.12; }
        else                    { ns.status='Running'; ns.ready=[ns.replicas,ns.replicas]; ns.health=100; }
      }
      return ns;
    }

    ns.age += 1;
    if (ns.incidentCooldown > 0) ns.incidentCooldown -= 1;

    ns.demand = clamp(ns.demand + rnd(-3, 5), 10, 400);
    const cap = svcCapacity(ns);
    let load = ns.demand / Math.max(cap, 1);

    if (autoscale && load > 0.85 && ns.replicas < 10) {
      ns.replicas += 1; ns.podNodes = autoSpread(state, ns.replicas, { affinity:ns.affinity, exceptId:ns.id });
      ns.ready = [ns.ready[0], ns.replicas];
      if (nowTick % 3 === 0) toasts = pushToast(toasts, 'info', 'Autoscaled', `${ns.name} → ${ns.replicas} replicas`);
      load = ns.demand / svcCapacity(ns);
    }

    /* affinity mismatch keeps the service unhealthy regardless of load */
    if (mis >= ns.replicas) {
      ns.status = 'CrashLoopBackOff'; ns.ready = [0, ns.replicas]; ns.errorRate = clamp(ns.errorRate*0.6+0.4*0.4, .2, .9); ns.health = clamp(ns.health-6,0,100);
      return ns;
    }
    if (mis > 0) {
      ns.status = 'Degraded'; ns.ready = [Math.min(ns.ready[0], maxReady), ns.replicas];
      if (ns.ready[0] < maxReady) ns.ready = [Math.min(ns.ready[0]+1, maxReady), ns.replicas];
      ns.errorRate = clamp(ns.errorRate*0.6 + 0.10*0.4, 0, .9); ns.health = clamp(ns.health-1, 30, 100);
      return ns;
    }

    const stale = !isLatest(state, ns);
    if (stale) {
      if (rolling && ns.status === 'Running') {
        const latest = latestImages(state).find(i => {
          const img = state.images.find(x => x.id === ns.imageId); return img && i.repoId === img.repoId;
        });
        if (latest) { ns.imageId = latest.id; if (nowTick%4===0) toasts = pushToast(toasts,'ok','Rolling update',`${ns.name} → ${latest.tag}`); }
      } else if (ns.status === 'Running' && ns.age > 6 && Math.random() < 0.18) {
        ns.status = 'Stale';
      }
    }

    let dH = load > 1.1 ? -(load - 1) * 9 : 4;
    if (ns.status === 'Stale') dH -= 1.5;
    ns.health = clamp(ns.health + dH, 0, 100);

    const baseErr = (load > 1 ? (load-1)*0.4 : 0.002) + (ns.status==='Stale' ? 0.03 : 0);
    ns.errorRate = clamp(ns.errorRate * 0.6 + baseErr * 0.4, 0, 0.95);

    const risk = (1 - ns.health/100) * (0.25 + drama*0.35);
    if (ns.incidentCooldown === 0 && Math.random() < risk * 0.5) {
      ns.status = 'CrashLoopBackOff'; ns.restarts += Math.ceil(rnd(1,3));
      ns.ready = [Math.max(0, ns.ready[0]-1), ns.replicas]; ns.incidentCooldown = 4;
    }

    if (ns.status === 'CrashLoopBackOff') {
      if (selfHeal && Math.random() < 0.5) {
        ns.status='Running'; ns.ready=[maxReady,ns.replicas]; ns.health=clamp(ns.health+25,0,100); ns.errorRate=0.01;
        if (nowTick%2===0) toasts = pushToast(toasts, 'ok', 'Self-healed', `${ns.name} recovered automatically`);
      }
    } else if (ns.status==='Stale' && ns.health > 55 && load < 0.9 && !stale) {
      ns.status='Running';
    } else if (ns.status==='Degraded' && load < 0.9) {
      ns.status='Running';
    } else if (ns.status==='Running' && load > 1.2 && ns.health < 60) {
      ns.status='Degraded';
    }
    if (ns.status==='Running' && ns.ready[0] < maxReady) ns.ready = [Math.min(ns.ready[0]+1, maxReady), ns.replicas];
    return ns;
  });

  /* ---- bug-ticket generation ---- */
  let seq = state.seq;
  const openCount = tickets.filter(t => t.status === 'todo').length;
  if (openCount < 6) {
    services.forEach(s => {
      const troubled = (sevOf(s.status)==='bad') || (s.status==='Stale') || (s.errorRate > 0.18);
      if (!troubled) return;
      const already = tickets.some(t => t.type==='bug' && t.svc===s.name && t.status==='todo');
      if (already) return;
      if (Math.random() > (0.16 + drama*0.16)) return;
      const overload = s.demand > svcCapacity(s);
      const bug = makeBugTicket(state, s, seq.ticket, overload);
      tickets = [...tickets, bug];
      seq = { ...seq, ticket: seq.ticket + 1 };
      toasts = pushToast(toasts, 'bad', 'New incident', `${bug.id} · ${s.name}`);
    });
  }

  // ---- meters ----
  let sla = state.meters.sla;
  const anyBad = services.some(s => sevOf(s.status)==='bad');
  const anyWarn = services.some(s => sevOf(s.status)==='warn');
  if (anyBad) sla = clamp(sla - rnd(0.15, 0.5), 80, 100);
  else if (anyWarn) sla = clamp(sla - rnd(0.02, 0.12), 80, 100);
  else sla = clamp(sla + 0.08, 80, 100);

  const dailyUpkeep = services.reduce((a,s)=>a + svcUpkeep(s), 0) + nodes.reduce((a,n)=>a + nodeUpkeep(n), 0);
  const budget = state.meters.budget - dailyUpkeep / TICKS_PER_DAY;

  return {
    ...state,
    clock: { ...c, tick: nowTick, mins },
    images, services, tickets, pending, seq, firstBeat,
    meters: { ...state.meters, sla, budget },
    toasts,
    _flash: anyBad && !state._wasBad ? Date.now() : state._flash,
    _wasBad: anyBad,
    _rebalanceFlash: rebalanceFlash,
  };
}

function makeBugTicket(state, s, n, overload) {
  const id = 'BUG-' + n;
  const mis = misplaced(state, s);
  const base = { id, type:'bug', svc:s.name, status:'todo',
    requester:'Monitoring · auto', avatar:'#DC3F32', prio: overload?'high':'med',
    reward: overload ? 650 : 500, xp: 35,
    criteria:[ { kind:'stable', svc:s.name, label:`${s.name} healthy again — no errors, all pods ready` } ] };
  if (mis > 0) {
    return { ...base,
      title:`${s.name} has pods that won’t go live`,
      body:`${s.name} requires ${s.affinity} hardware, but ${mis} replica${mis>1?'s are':' is'} scheduled on a node without that tag. The pod${mis>1?'s are':' is'} placed but stuck unhealthy.`,
      hint:`Tag a node ${s.affinity} (generic nodes are editable), provision a ${s.affinity} node, or re-place the replicas onto matching nodes.` };
  }
  if (s.status === 'Stale') {
    return { ...base,
      title:`${s.name} is serving errors`,
      body:`Users report ${s.name} is flaky and returning stale data. It looks out of date.`,
      hint:'It’s running an old build. Redeploy it on the latest image — or unlock Rolling Updates to keep it fresh automatically.',
      criteria:[ { kind:'latest', svc:s.name, label:`${s.name} on the latest version` }, base.criteria[0] ] };
  }
  if (overload) {
    return { ...base,
      title:`${s.name} is crashing under load`,
      body:`${s.name} keeps falling over. Pages are timing out during busy periods.`,
      hint:'It can’t keep up with traffic. Add replicas (or unlock the Autoscaler) so it has the capacity to cope.',
      criteria:[ { kind:'replicas', svc:s.name, n: s.replicas+1, label:`More capacity — ≥${s.replicas+1} replicas` }, base.criteria[0] ] };
  }
  return { ...base,
    title:`${s.name} pod keeps dying`,
    body:`${s.name} is in a crash loop and restarting repeatedly. Get it stable.`,
    hint:'Restart it to clear the loop. If it keeps happening, it needs more redundancy — or Auto-Remediation to self-heal.' };
}

/* ============================================================
   CONTEXT
   ============================================================ */
const GameCtx = createContext(null);
function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, seedState);
  useEffect(() => {
    if (state.clock.paused) return;
    const interval = 1100 / state.clock.speed;
    const id = setInterval(() => { dispatch({ type:'TICK' }); dispatch({ type:'BUILD_TICK' }); }, interval);
    return () => clearInterval(id);
  }, [state.clock.paused, state.clock.speed]);
  return React.createElement(GameCtx.Provider, { value:{ state, dispatch } }, children);
}
function useGame() { return useContext(GameCtx); }

Object.assign(window, { GameProvider, useGame, GameCtx,
  LANGS, SEV, sevOf, HW, AFFINITIES, svcUpkeep, nodeUpkeep, nodeSlots, svcCapacity, podsOnNode,
  misplaced, podHealthy, distinctNodes, autoSpread, haSubs,
  money, clamp, uid, hasUpgrade, latestImages, gradeTicket, ticketMet,
  POD_COST, NODE_COST, NODE_PROVISION, GREEK });
