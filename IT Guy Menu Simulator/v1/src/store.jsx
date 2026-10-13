/* ============================================================
   CLUSTER — simulation store  (2nd pass)
   Replica-only sizing · pod-slot nodes · affinity tags ·
   budget-driven upkeep · blind-ops + Service Dashboard gate ·
   acceptance-criteria grading · bug-ticket generation
   ============================================================ */
const { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } = React;

/* ---------- helpers ---------- */
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 7);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const money = (n) => '$' + Math.round(n).toLocaleString();

const SEV = { Running:'ok', Stale:'warn', Degraded:'warn', Pending:'pending', CrashLoopBackOff:'bad', Terminating:'pending' };
const sevOf = (s) => SEV[s] || 'idle';

/* economy */
const POD_COST  = 60;                       // $/pod/day
const NODE_COST = { Normal: 120, Large: 220 };
const PER_REPLICA_CAP = 55;                 // req/s a single replica absorbs
const TICKS_PER_DAY = 48;

const AFFINITIES = ['x86', 'ARM', 'GPU', 'DATA'];

const svcUpkeep  = (s) => s.replicas * POD_COST;
const nodeUpkeep = (n) => NODE_COST[n.tier] || NODE_COST.Normal;
const svcCapacity = (s) => s.replicas * PER_REPLICA_CAP;
const podsOnNode = (state, nodeId, exceptId) =>
  state.services.filter(s => s.nodeId === nodeId && s.id !== exceptId).reduce((a, s) => a + s.replicas, 0);

/* ---------- seed data ---------- */
const LANGS = { Go:'#39c2d7', Node:'#7bbf4a', Python:'#4f93ff', Rust:'#e08a3c', Java:'#d96b6b' };

function seedState() {
  const nodes = [
    { id:'node-a', name:'node-alpha',   tier:'Normal', slots:4, tags:['x86'] },
    { id:'node-b', name:'node-bravo',   tier:'Normal', slots:4, tags:['ARM'] },
    { id:'node-c', name:'node-charlie', tier:'Large',  slots:8, tags:['x86','DATA'] },
  ];

  const repos = [
    { id:'repo-1', name:'web-storefront',   lang:'Node',   desc:'Customer-facing shop. The money-maker.' },
    { id:'repo-2', name:'checkout-api',     lang:'Go',     desc:'Payments + cart. Hates downtime.' },
    { id:'repo-3', name:'image-resizer',    lang:'Rust',   desc:'Thumbnails on demand. Bursty.' },
    { id:'repo-4', name:'recommend-engine', lang:'Python', desc:'"People also bought…" Spiky traffic.' },
    { id:'repo-5', name:'audit-log',        lang:'Java',   desc:'Compliance write-only firehose.' },
  ];

  const images = [
    { id:'img-1', repoId:'repo-1', version:1, tag:'web-storefront:1.0.0', digest:'sha256:8f1c…a9', builtTick:0 },
    { id:'img-2', repoId:'repo-2', version:1, tag:'checkout-api:1.0.0',   digest:'sha256:2bd0…e1', builtTick:0 },
  ];

  const services = [
    mkService({ name:'web-storefront', imageId:'img-1', type:'Deployment', replicas:3, nodeId:'node-c',
                status:'Running', ready:[3,3], demand:120 }),
    mkService({ name:'checkout-api', imageId:'img-2', type:'Pod', replicas:1, nodeId:'node-a',
                status:'Running', ready:[1,1], demand:40 }),
  ];

  const tickets = [
    { id:'TCK-114', type:'new', requester:'Dana · Growth', avatar:'#7bbf4a', prio:'high', svc:'recommend-engine',
      title:'Stand up the recommendation widget', status:'todo', repo:'repo-4',
      body:'Marketing wants the "people also bought" strip live before the weekend campaign. The recommend-engine repo is ready to ship.',
      hint:'Campaigns hammer it in waves. One copy will fall over — give it room to survive a failure.',
      reward:900, xp:40,
      criteria:[
        { kind:'running',  svc:'recommend-engine', label:'recommend-engine is running' },
        { kind:'ha',       svc:'recommend-engine', label:'High availability — survives a pod/node failure' },
      ] },
    { id:'TCK-115', type:'new', requester:'Priya · Finance', avatar:'#4f93ff', prio:'med', svc:'audit-log',
      title:'Stand up the audit-log service', status:'todo', repo:'repo-5',
      body:'Compliance needs audit-log running by end of quarter. "It barely does anything — just keep it up, and keep the data where the auditors expect it."',
      hint:'"Where the auditors expect it" = it has to live on a DATA node. And it must never be a single point of failure.',
      reward:700, xp:30,
      criteria:[
        { kind:'running',  svc:'audit-log', label:'audit-log is running' },
        { kind:'ha',       svc:'audit-log', label:'High availability — ≥2 replicas, Deployment' },
        { kind:'node_tag', svc:'audit-log', tag:'DATA', label:'Runs on a DATA node' },
      ] },
    { id:'TCK-116', type:'new', requester:'Marcus · Ops', avatar:'#e08a3c', prio:'low', svc:'image-resizer',
      title:'Thumbnails service for sale days', status:'todo', repo:'repo-3',
      body:'Stand up image-resizer so the catalog stops loading broken thumbnails. Sale days get rough.',
      hint:'"Sale days get rough" = expect bursts. Thin on replicas and it will buckle the first busy afternoon.',
      reward:750, xp:50,
      criteria:[
        { kind:'running',  svc:'image-resizer', label:'image-resizer is running' },
        { kind:'replicas', svc:'image-resizer', n:3, label:'Headroom for bursts — ≥3 replicas' },
      ] },
  ];

  const upgrades = [
    /* Build */
    { id:'u-ci1', branch:'Build', name:'Continuous Integration', icon:'ci',
      desc:'Auto-builds every repo into the Registry. Stop dragging.', cost:700, xp:0, requires:[], owned:false, effect:'ci_autobuild' },
    { id:'u-ci2', branch:'Build', name:'Image Caching', icon:'layers',
      desc:'Builds finish ~3× faster.', cost:1000, xp:60, requires:['u-ci1'], owned:false, effect:'fast_build' },

    /* Workload */
    { id:'u-wl1', branch:'Workload', name:'Deployments', icon:'deploy',
      desc:'Unlocks Deployment workloads — a failed pod is recreated on another node.', cost:600, xp:0, requires:[], owned:false, effect:'deployments' },
    { id:'u-wl2', branch:'Workload', name:'Rolling Updates', icon:'rolling',
      desc:'Edit live with zero downtime, and auto-refresh Stale services to the latest build.', cost:1100, xp:80, requires:['u-wl1'], owned:false, effect:'rolling' },

    /* Observability — the key mid arc */
    { id:'u-ob1', branch:'Observability', name:'Service Dashboard', icon:'eye',
      desc:'See live health for every service — status, restarts, error rate — and unlock health probes.', cost:800, xp:0, requires:[], owned:false, effect:'dashboard' },
    { id:'u-ob2', branch:'Observability', name:'Auto-Remediation', icon:'heart',
      desc:'Crashed pods are detected and restarted automatically.', cost:1500, xp:140, requires:['u-ob1'], owned:false, effect:'self_heal' },

    /* Infra */
    { id:'u-if1', branch:'Infra', name:'Provision Node', icon:'node',
      desc:'Add a Normal node (4 pod slots) to the pool.', cost:1100, xp:40, requires:[], owned:false, effect:'add_node' },
    { id:'u-if2', branch:'Infra', name:'Large Node', icon:'server',
      desc:'Add a Large node (8 pod slots) for dense workloads.', cost:1800, xp:120, requires:['u-if1'], owned:false, effect:'add_large_node' },
    { id:'u-if3', branch:'Infra', name:'Node Affinity', icon:'pin',
      desc:'Declare a service\'s required hardware (ARM / x86 / GPU / DATA); it will only schedule on matching nodes.', cost:1600, xp:160, requires:['u-if1'], owned:false, effect:'affinity' },

    /* Scaling / Data (aspirational) */
    { id:'u-sc1', branch:'Scaling', name:'Horizontal Autoscaler', icon:'scale',
      desc:'Adds replicas automatically when a service is overloaded.', cost:2000, xp:200, requires:['u-wl1','u-ob1'], owned:false, effect:'autoscale' },
    { id:'u-sc2', branch:'Scaling', name:'Secrets & Data Tier', icon:'lock',
      desc:'Managed databases, secrets, and backups. [later milestone]', cost:3200, xp:320, requires:['u-sc1'], owned:false, effect:'data', deferred:true },
  ];

  return {
    clock: { tick: 0, paused: true, speed: 1, mins: 9*60 },
    meters: { sla: 99.4, budget: 5200, xp: 60 },
    nodes, repos, images, services, tickets, upgrades,
    toasts: [],
    form: { open:false, editingId:null, draft:null },
    ui: { screen:'tickets', infraTab:'cluster', boardView:'table', selected:null },
    seq: { ticket: 117 },
  };
}

function mkService(o) {
  return {
    id: uid('svc'),
    name:o.name, imageId:o.imageId, type:o.type, replicas:o.replicas,
    liveness: o.liveness||false, readiness: o.readiness||false,
    nodeId:o.nodeId, affinity: o.affinity||null,
    status:o.status || 'Pending',
    ready: o.ready || [0, o.replicas],
    restarts: 0, errorRate: 0.002, health: 100,
    demand: o.demand != null ? o.demand : rnd(30, 80),
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
function gradeCriterion(state, c) {
  const s = findSvc(state, c.svc);
  switch (c.kind) {
    case 'running':  return !!s && s.replicas > 0 && s.status !== 'Pending' && s.status !== 'CrashLoopBackOff' && s.ready[0] > 0;
    case 'replicas': return !!s && s.replicas >= c.n;
    case 'deployment': return !!s && s.type === 'Deployment';
    case 'ha':       return !!s && s.type === 'Deployment' && s.replicas >= 2;
    case 'node_tag': { const n = s && state.nodes.find(nn => nn.id === s.nodeId); return !!n && n.tags.includes(c.tag); }
    case 'latest':   return !!s && isLatest(state, s) && s.status !== 'Stale';
    case 'stable':   return !!s && s.status === 'Running' && s.errorRate < 0.06 && s.ready[0] === s.ready[1] && s.replicas > 0;
    default: return false;
  }
}
function gradeTicket(state, t) { return (t.criteria || []).map(c => ({ ...c, met: gradeCriterion(state, c) })); }
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

    case 'PAUSE':     return { ...state, clock:{ ...state.clock, paused:action.paused } };
    case 'SPEED':     return { ...state, clock:{ ...state.clock, speed:action.speed, paused:false } };

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
      return { ...state, form:{ open:true, editingId:action.id, draft:{ ...s } } };
    }
    case 'FORM_SET': {
      let patch = { ...action.patch };
      // image drives the (derived) service name 1:1
      if (patch.imageId) {
        const img = state.images.find(i => i.id === patch.imageId);
        const repo = img && state.repos.find(r => r.id === img.repoId);
        if (repo) patch.name = repo.name;
      }
      return { ...state, form:{ ...state.form, draft:{ ...state.form.draft, ...patch } } };
    }
    case 'FORM_CLOSE':return { ...state, form:{ open:false, editingId:null, draft:null } };

    case 'SERVICE_SAVE': {
      const d = state.form.draft;
      const rolling = hasUpgrade(state, 'rolling');
      const isNew = !state.form.editingId;
      const prev = isNew ? null : state.services.find(s => s.id === state.form.editingId);
      const addedPods = d.replicas - (prev ? prev.replicas : 0);
      // budget soft-wall: can't add pods while underwater
      if (addedPods > 0 && state.meters.budget < 0) {
        return { ...state, toasts: pushToast(state.toasts, 'bad', 'Budget too low', 'Clear a paying ticket before adding pods.') };
      }
      if (isNew) {
        const ns = mkService({ ...d, status: d.replicas===0?'Idle':'Pending', ready:[0,d.replicas] });
        ns.settleIn = d.replicas===0 ? 0 : 3;
        return { ...state, services:[...state.services, ns], form:{ open:false, editingId:null, draft:null },
          toasts: pushToast(state.toasts, 'info', 'Service scheduled', `${d.name} → ${state.nodes.find(n=>n.id===d.nodeId)?.name}`) };
      }
      const services = state.services.map(s => s.id === state.form.editingId
        ? { ...s, ...d,
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
    case 'SERVICE_SCALE': {
      const services = state.services.map(s => {
        if (s.id !== action.id) return s;
        const r = clamp(s.replicas + action.delta, 0, 10);
        return { ...s, replicas:r, ready:[Math.min(s.ready[0], r), r], status: r===0?'Idle':s.status };
      });
      return { ...state, services };
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
      if (u.effect === 'add_node')       st = { ...st, nodes:[...st.nodes, { id:uid('node'), name:'node-delta',  tier:'Normal', slots:4, tags:[pick(['x86','ARM'])] }] };
      if (u.effect === 'add_large_node') st = { ...st, nodes:[...st.nodes, { id:uid('node'), name:'node-echo',   tier:'Large',  slots:8, tags:['x86','GPU'] }] };
      if (u.effect === 'dashboard')      st = { ...st, toasts: pushToast(st.toasts, 'ok', 'Observability online', 'Live health is now visible on the Cluster board.') };
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
  return { name, imageId: img ? img.id : '', type:'Pod',
    replicas:2, liveness:false, readiness:false, nodeId: state.nodes[0].id, affinity:null };
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
   TICK — drift engine + bug-ticket generation
   ============================================================ */
function tick(state) {
  const drama = window.__DRAMA != null ? window.__DRAMA : 0.6;
  const c = state.clock;
  const mins = (c.mins + 30) % (24*60);
  let toasts = state.toasts;

  const selfHeal   = hasUpgrade(state, 'self_heal');
  const autoscale  = hasUpgrade(state, 'autoscale');
  const ciAuto     = hasUpgrade(state, 'ci_autobuild');
  const rolling    = hasUpgrade(state, 'rolling');

  /* CI auto-build: occasionally ship a new version of a repo that has a running service */
  let images = state.images;
  if (ciAuto && state.clock.tick % 7 === 0) {
    const repo = pick(state.repos);
    if (repo) {
      const maxV = Math.max(0, ...images.filter(i => i.repoId === repo.id).map(i => i.version));
      images = [...images, { id: uid('img'), repoId:repo.id, version:maxV+1, tag:`${repo.name}:${maxV+1}.0.0`,
        digest:'sha256:'+Math.random().toString(16).slice(2,6)+'…', builtTick:state.clock.tick, building:true, progress:0, fast:true }];
    }
  }

  const services = state.services.map(s => {
    let ns = { ...s };

    if (ns.replicas === 0) { ns.status = 'Idle'; ns.ready = [0,0]; ns.errorRate = 0; return ns; }

    // settling Pending → Running
    if (ns.settleIn > 0) {
      ns.settleIn -= 1;
      const got = Math.min(ns.ready[0] + Math.ceil(ns.replicas/2), ns.replicas);
      ns.ready = [got, ns.replicas]; ns.status = 'Pending';
      if (ns.settleIn <= 0) { ns.status = 'Running'; ns.ready = [ns.replicas, ns.replicas]; ns.health = 100; }
      return ns;
    }

    ns.age += 1;
    if (ns.incidentCooldown > 0) ns.incidentCooldown -= 1;

    // demand drifts upward
    ns.demand = clamp(ns.demand + rnd(-3, 5), 10, 400);
    const cap = svcCapacity(ns);
    let load = ns.demand / Math.max(cap, 1);

    // autoscale
    if (autoscale && load > 0.85 && ns.replicas < 10) {
      ns.replicas += 1; ns.ready = [ns.replicas-1, ns.replicas];
      if (state.clock.tick % 3 === 0) toasts = pushToast(toasts, 'info', 'Autoscaled', `${ns.name} → ${ns.replicas} replicas`);
      load = ns.demand / svcCapacity(ns);
    }

    // staleness: a newer image than what's deployed
    const stale = !isLatest(state, ns);
    if (stale) {
      if (rolling && ns.status === 'Running') {
        const latest = latestImages(state).find(i => {
          const img = state.images.find(x => x.id === ns.imageId); return img && i.repoId === img.repoId;
        });
        if (latest) { ns.imageId = latest.id; if (state.clock.tick%4===0) toasts = pushToast(toasts,'ok','Rolling update',`${ns.name} → ${latest.tag}`); }
      } else if (ns.status === 'Running' && ns.age > 6 && Math.random() < 0.18) {
        ns.status = 'Stale';
      }
    }

    // health model
    let dH = load > 1.1 ? -(load - 1) * 9 : 4;
    if (ns.status === 'Stale') dH -= 1.5;
    ns.health = clamp(ns.health + dH, 0, 100);

    // error rate
    const baseErr = (load > 1 ? (load-1)*0.4 : 0.002) + (ns.status==='Stale' ? 0.03 : 0);
    ns.errorRate = clamp(ns.errorRate * 0.6 + baseErr * 0.4, 0, 0.95);

    // incident roll
    const risk = (1 - ns.health/100) * (0.25 + drama*0.35);
    if (ns.incidentCooldown === 0 && Math.random() < risk * 0.5) {
      ns.status = 'CrashLoopBackOff'; ns.restarts += Math.ceil(rnd(1,3));
      ns.ready = [Math.max(0, ns.ready[0]-1), ns.replicas]; ns.incidentCooldown = 4;
    }

    // recovery
    if (ns.status === 'CrashLoopBackOff') {
      if (selfHeal && Math.random() < 0.5) {
        ns.status='Running'; ns.ready=[ns.replicas,ns.replicas]; ns.health=clamp(ns.health+25,0,100); ns.errorRate=0.01;
        if (state.clock.tick%2===0) toasts = pushToast(toasts, 'ok', 'Self-healed', `${ns.name} recovered automatically`);
      }
    } else if (ns.status==='Stale' && ns.health > 55 && load < 0.9 && !stale) {
      ns.status='Running';
    } else if (ns.status==='Degraded' && load < 0.9) {
      ns.status='Running';
    } else if (ns.status==='Running' && load > 1.2 && ns.health < 60) {
      ns.status='Degraded';
    }
    if (ns.status==='Running' && ns.ready[0] < ns.replicas) ns.ready = [Math.min(ns.ready[0]+1, ns.replicas), ns.replicas];
    return ns;
  });

  /* ---- bug-ticket generation (the blind-ops signal) ---- */
  let tickets = state.tickets;
  let seq = state.seq;
  const openCount = tickets.filter(t => t.status === 'todo').length;
  if (openCount < 6) {
    services.forEach(s => {
      const troubled = (sevOf(s.status)==='bad') || (s.status==='Stale') || (s.errorRate > 0.18);
      if (!troubled) return;
      const already = tickets.some(t => t.type==='bug' && t.svc===s.name && t.status==='todo');
      if (already) return;
      if (Math.random() > (0.18 + drama*0.18)) return;
      const overload = s.demand > svcCapacity(s);
      const bug = makeBugTicket(s, seq.ticket, overload);
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
  else sla = clamp(sla + 0.08, 80, 99.99);

  const dailyUpkeep = services.reduce((a,s)=>a + svcUpkeep(s), 0) + state.nodes.reduce((a,n)=>a + nodeUpkeep(n), 0);
  const budget = state.meters.budget - dailyUpkeep / TICKS_PER_DAY;

  return {
    ...state,
    clock: { ...c, tick: c.tick + 1, mins },
    images, services, tickets, seq,
    meters: { ...state.meters, sla, budget },
    toasts,
    _flash: anyBad && !state._wasBad ? Date.now() : state._flash,
    _wasBad: anyBad,
  };
}

function makeBugTicket(s, n, overload) {
  const id = 'BUG-' + n;
  const base = { id, type:'bug', svc:s.name, status:'todo',
    requester:'Monitoring · auto', avatar:'#ff5563', prio: overload?'high':'med',
    reward: overload ? 650 : 500, xp: 35,
    criteria:[ { kind:'stable', svc:s.name, label:`${s.name} healthy again — no errors, all pods ready` } ] };
  if (s.status === 'Stale') {
    return { ...base,
      title:`${s.name} is serving errors`,
      body:`Users report ${s.name} is flaky and returning stale data. It looks out of date.`,
      hint:'It\'s running an old build. Redeploy it on the latest image — or unlock Rolling Updates to keep it fresh automatically.',
      criteria:[ { kind:'latest', svc:s.name, label:`${s.name} on the latest version` }, base.criteria[0] ] };
  }
  if (overload) {
    return { ...base,
      title:`${s.name} is crashing under load`,
      body:`${s.name} keeps falling over. Pages are timing out during busy periods.`,
      hint:'It can\'t keep up with traffic. Add replicas (or unlock the Autoscaler) so it has the capacity to cope.',
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
  LANGS, SEV, sevOf, AFFINITIES, svcUpkeep, nodeUpkeep, svcCapacity, podsOnNode,
  money, clamp, uid, hasUpgrade, latestImages, gradeTicket, ticketMet, POD_COST, NODE_COST });
