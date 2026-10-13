/* ============================================================
   CLUSTER — Service Authoring Form (slide-over)
   Replica-only sizing · derived name · Deployment/probes/affinity
   gates · AUTO-SPREAD placement with MANUAL override · upkeep
   ============================================================ */
import React, { useEffect, useState } from 'react';
import {
  CONFIG, hasUpgrade, latestImages, money, effectiveDemand, freeSlots, totalFree, nodeIsUp,
  type Action, type ClusterNode, type Draft, type GameState, type Hw,
} from '../engine';
import { useGame } from '../store';
import { Icon, Slider, Toggle } from './primitives';

function LockNote({ children }: { children: React.ReactNode }) {
  return <span className="lock-note"><Icon name="lock" size={11} /> {children}</span>;
}

const nodeIcon = (n: ClusterNode) => (n.kind === 'special' ? 'cpu' : n.tier === 'Large' ? 'server' : 'node');

function countByNode(placed: string[]): Record<string, number> {
  const byNode: Record<string, number> = {};
  placed.forEach(nid => { byNode[nid] = (byNode[nid] || 0) + 1; });
  return byNode;
}

function OfflineChip() {
  return <span className="pill bad" style={{ padding: '1px 7px', fontSize: 9.5 }}><Icon name="wifi_off" size={10} /> offline</span>;
}

export function ServiceForm() {
  const { state, dispatch } = useGame();
  const open = state.form.open && !!state.form.draft;
  const editingId = state.form.editingId;
  const [confirmDel, setConfirmDel] = useState(false);

  // Escape closes the form
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dispatch({ type: 'FORM_CLOSE' }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dispatch]);

  // "Confirm remove" arms for 3 seconds, then falls back
  useEffect(() => {
    if (!confirmDel) return;
    const id = window.setTimeout(() => setConfirmDel(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmDel]);

  // reset the arm state whenever the form opens on a different target
  useEffect(() => { setConfirmDel(false); }, [open, editingId]);

  if (!open || !state.form.draft) return null;
  const d: Draft = state.form.draft;
  const editing = !!editingId;
  const prev = editing ? state.services.find(s => s.id === editingId) ?? null : null;
  const set = (patch: Partial<Draft>) => dispatch({ type: 'FORM_SET', patch });

  const canDeploy   = hasUpgrade(state, 'deployments');
  const hasDash     = hasUpgrade(state, 'dashboard');
  const hasAffinity = hasUpgrade(state, 'affinity');
  const images = latestImages(state);

  const placed = d.podNodes.slice(0, d.replicas);
  const placedCount = placed.length;
  const unplaced = d.replicas - placedCount;
  const distinct = new Set(placed).size;

  // capacity across the cluster (excluding this service's own current pods)
  const freeByNode = freeSlots(state, editingId);
  const free = totalFree(state, editingId);
  const overCapacity = d.replicas > free;

  // affinity mismatches (schedule-but-fail, doesn't block deploy)
  const misCount = d.affinity
    ? placed.filter(nid => { const n = state.nodes.find(x => x.id === nid); return !n || !n.tags.includes(d.affinity as Hw); }).length
    : 0;

  const single = d.replicas === 1;
  const zero = d.replicas === 0;
  const upkeep = d.replicas * CONFIG.POD_COST;
  const cap = d.replicas * CONFIG.PER_REPLICA_CAP;
  const manualComplete = d.spread === 'auto' || unplaced === 0;
  const valid = !!d.imageId && !overCapacity && manualComplete;

  // budget check mirrors SERVICE_SAVE
  const addedPods = d.replicas - (prev ? prev.replicas : 0);
  const budgetShort = addedPods > 0 && state.meters.budget < addedPods * CONFIG.POD_COST;

  const demand = editing && hasDash && prev ? Math.round(effectiveDemand(state, prev)) : null;
  const dependedOn = editing && state.tickets.some(t => t.status === 'done' && t.svc === d.name);

  const onRemove = () => {
    if (!editingId) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setConfirmDel(false);
    dispatch({ type: 'SERVICE_DELETE', id: editingId });
  };

  return (
    <>
      <div className="overlay" onClick={() => dispatch({ type: 'FORM_CLOSE' })} />
      <div className="slideover" role="dialog" aria-label={editing ? 'Edit service' : 'New service'}>
        <div className="so-head">
          <div>
            <div className="flex gap8" style={{ marginBottom: 6 }}>
              <span className="pill accent" style={{ padding: '2px 10px' }}>{editing ? 'Edit service' : 'New service'}</span>
              {editing && hasUpgrade(state, 'rolling') && <span className="pill ok" style={{ padding: '2px 10px' }}><Icon name="rolling" size={11} /> rolling update</span>}
            </div>
            <h2>{d.name || 'Author a workload'}</h2>
            <div className="sub">Configure it while paused, then watch it schedule onto your nodes.</div>
          </div>
          <button type="button" className="cbtn" onClick={() => dispatch({ type: 'FORM_CLOSE' })} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>

        <div className="so-body">
          {/* image — drives name 1:1 */}
          <div className="field">
            <label>Image <span className="faint mono" style={{ fontWeight: 400, fontSize: 11 }}>· from Registry</span></label>
            {images.length ? (
              <select value={d.imageId} onChange={e => set({ imageId: e.target.value })}>
                <option value="">Select an image…</option>
                {images.map(im => <option key={im.id} value={im.id}>{im.tag}</option>)}
              </select>
            ) : (
              <div className="hint" style={{ color: 'var(--warn)' }}>No images built yet — go to Registry and build one first.</div>
            )}
          </div>

          {/* derived service name */}
          <div className="field">
            <label>Service name</label>
            <div className="derived-field">
              <Icon name="box" size={14} style={{ color: 'var(--text-faint)' }} />
              <span className="mono">{d.name || '—'}</span>
              <span className="derived-tag">derived from image</span>
            </div>
          </div>

          {/* workload type */}
          <div className="field">
            <label className="flex" style={{ justifyContent: 'space-between' }}>Workload type
              {!canDeploy && <LockNote>unlock in Upgrades</LockNote>}
            </label>
            <div className="seg">
              <button type="button" className={d.type === 'Pod' ? 'on accent' : ''} onClick={() => set({ type: 'Pod' })}>
                <Icon name="box" size={14} /> Pod
              </button>
              <button type="button" className={d.type === 'Deployment' ? 'on accent' : ''} disabled={!canDeploy}
                      onClick={() => canDeploy && set({ type: 'Deployment' })}
                      style={!canDeploy ? { opacity: .5, cursor: 'not-allowed' } : undefined}>
                <Icon name={canDeploy ? 'deploy' : 'lock'} size={14} /> Deployment
              </button>
            </div>
            <div className="hint">
              {d.type === 'Pod'
                ? 'A single workload. A dead pod stays dead until you restart it — and it can’t be highly available.'
                : 'Managed replicas that recreate a failed pod on another node. Required for high availability.'}
            </div>
          </div>

          <div className="divider" />

          {/* replicas */}
          <div className="field">
            <label className="flex" style={{ justifyContent: 'space-between' }}>Replicas — sizing
              <span className="faint mono" style={{ fontWeight: 400, fontSize: 11 }}>{zero ? 'stopped' : single ? 'single point of failure' : `${d.replicas} pods`}</span>
            </label>
            <Slider value={d.replicas} min={0} max={CONFIG.MAX_REPLICAS} onChange={v => set({ replicas: v })}
                    zone={zero ? 'bad' : single ? 'warn' : ''} format={v => `${v}×`} />
            <div className="hint" style={zero ? { color: 'var(--bad)' } : single ? { color: 'var(--warn)' } : undefined}>
              {zero ? '0 replicas — the service is defined but NOT running.'
                : single ? 'One replica = no redundancy. A single failure takes the whole service down.'
                : `${d.replicas} pods share the load and survive individual failures.`}
            </div>
            {budgetShort && (
              <div className="hint" style={{ color: 'var(--bad)' }}>
                <Icon name="alert" size={11} /> Budget too low for {addedPods} more pod{addedPods === 1 ? '' : 's'}
                <span className="faint mono" style={{ marginLeft: 6 }}>({money(addedPods * CONFIG.POD_COST)} needed · {money(state.meters.budget)} available)</span>
              </div>
            )}
          </div>

          {/* affinity (gated) */}
          <div className="field">
            <label className="flex" style={{ justifyContent: 'space-between' }}>Required hardware
              {!hasAffinity && <LockNote>unlock Node Affinity</LockNote>}
            </label>
            {hasAffinity ? (
              <>
                <div className="seg" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className={!d.affinity ? 'on' : ''} onClick={() => set({ affinity: null })}>Any</button>
                  {CONFIG.HW.map(a => (
                    <button key={a} type="button" className={d.affinity === a ? 'on accent' : ''} onClick={() => set({ affinity: a })}>{a}</button>
                  ))}
                </div>
                <div className="hint">A replica that lands on a node without this tag still schedules — but stays unhealthy until you move it or tag the node.</div>
              </>
            ) : (
              <div className="locked-control"><Icon name="lock" size={14} /> Declare a service must run on x86 / ARM / GPU / DATA hardware.</div>
            )}
          </div>

          {/* PLACEMENT — auto-spread / manual override */}
          <div className="field">
            <div className="place-head">
              <label className="flex gap8" style={{ margin: 0 }}><Icon name="pin" size={14} style={{ color: 'var(--text-dim)' }} /> Placement</label>
              <div className="place-mode">
                <button type="button" className={d.spread === 'auto' ? 'on' : ''} onClick={() => set({ spread: 'auto' })}><Icon name="spark" size={12} /> Auto-spread</button>
                <button type="button" className={d.spread === 'manual' ? 'on' : ''} onClick={() => set({ spread: 'manual' })}><Icon name="pin" size={12} /> Manual</button>
              </div>
            </div>

            {d.spread === 'auto' ? (
              <>
                <div className="place-auto-note">
                  <Icon name="spark" size={15} style={{ color: 'var(--accent)', flex: 'none' }} />
                  <span>Replicas auto-spread across {distinct} node{distinct === 1 ? '' : 's'} to maximise resilience. Switch to Manual to place pods yourself.</span>
                </div>
                <PlacementView d={d} state={state} />
                <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'FORM_RESPREAD' })}><Icon name="shuffle" size={13} /> Re-distribute</button>
              </>
            ) : (
              <>
                <PlacementEditor d={d} state={state} dispatch={dispatch} freeByNode={freeByNode} />
                <div className="flex" style={{ justifyContent: 'space-between', marginTop: 10 }}>
                  <span className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap', color: unplaced > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                    {unplaced > 0 ? `${unplaced} replica${unplaced > 1 ? 's' : ''} unplaced` : 'all replicas placed'}
                  </span>
                  <button type="button" className="btn ghost sm" onClick={() => dispatch({ type: 'FORM_RESPREAD' })}><Icon name="spark" size={13} /> Auto-distribute</button>
                </div>
              </>
            )}

            {overCapacity && <div className="place-warn"><Icon name="alert" size={13} /> Cluster is out of slots ({free} free, {d.replicas} needed) — provision another node first.</div>}
            {misCount > 0 && !overCapacity && <div className="place-warn"><Icon name="alert" size={13} /> {misCount} replica{misCount > 1 ? 's' : ''} on a node without <b>&nbsp;{d.affinity}&nbsp;</b> — they’ll schedule but stay unhealthy (a visible bug).</div>}
          </div>

          <div className="divider" />

          {/* probes (gated) */}
          <div className="field">
            <label className="flex" style={{ justifyContent: 'space-between' }}>Health probes
              {!hasDash && <LockNote>unlock Service Dashboard</LockNote>}
            </label>
            {hasDash ? (
              <div className="panel" style={{ padding: '4px 14px', boxShadow: 'none' }}>
                <div className="flex" style={{ justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>Liveness</div><div className="faint" style={{ fontSize: 11 }}>Restart a pod that has hung.</div></div>
                  <Toggle checked={d.liveness} onChange={v => set({ liveness: v })} />
                </div>
                <div className="flex" style={{ justifyContent: 'space-between', padding: '11px 0' }}>
                  <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>Readiness</div><div className="faint" style={{ fontSize: 11 }}>Hold traffic until the pod is ready.</div></div>
                  <Toggle checked={d.readiness} onChange={v => set({ readiness: v })} />
                </div>
              </div>
            ) : (
              <div className="locked-control"><Icon name="lock" size={14} /> You can’t see pod health yet — probes unlock with the Service Dashboard.</div>
            )}
          </div>

          {/* remove (editing only) */}
          {editing && (
            <>
              <div className="divider" />
              <div className="field">
                <label className="flex" style={{ justifyContent: 'space-between' }}>Danger zone</label>
                <div className="flex gap8" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn ghost danger sm" onClick={onRemove}>
                    <Icon name="trash" size={13} /> {confirmDel ? 'Confirm remove' : 'Remove service'}
                  </button>
                  {confirmDel && <span className="faint mono" style={{ fontSize: 11 }}>click again to confirm · pods are torn down immediately</span>}
                </div>
                {dependedOn && (
                  <div className="hint" style={{ color: 'var(--warn)' }}>
                    <Icon name="alert" size={11} /> A resolved ticket depends on this — removing it will raise a regression.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="so-foot">
          <div className="cost">
            upkeep <b>{money(upkeep)}/day</b> · {d.replicas} pod{d.replicas === 1 ? '' : 's'}
            {!zero && <> · ~{cap} req/s</>}
            {demand != null && <> · demand ~{demand} req/s</>}
          </div>
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'FORM_CLOSE' })}>Cancel</button>
          <button type="button" className="btn primary" disabled={!valid} onClick={() => dispatch({ type: 'SERVICE_SAVE' })}>
            <Icon name={editing ? 'check' : 'bolt'} size={15} /> {editing ? 'Apply changes' : 'Deploy service'}
          </button>
        </div>
      </div>
    </>
  );
}

/* read-only auto view: which node holds how many pods */
function PlacementView({ d, state }: { d: Draft; state: GameState }) {
  const placed = d.podNodes.slice(0, d.replicas);
  const byNode = countByNode(placed);
  return (
    <div className="place-grid" style={{ marginTop: 11 }}>
      {state.nodes.map(n => {
        const cnt = byNode[n.id] || 0;
        if (cnt === 0) return null;
        const mismatch = !!d.affinity && cnt > 0 && !n.tags.includes(d.affinity);
        const down = !nodeIsUp(n);
        return (
          <div key={n.id} className={`place-node${mismatch ? ' mismatch' : ''}${n.kind === 'special' ? ' special' : ''}`}>
            <div className="place-node-top">
              <span className="place-node-name">
                <Icon name={nodeIcon(n)} size={13} /> {n.name}
                {down && <OfflineChip />}
              </span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{cnt} pod{cnt > 1 ? 's' : ''}</span>
            </div>
            <div className="pn-pods">
              {Array.from({ length: cnt }).map((_, i) => <span key={i} className={`led ${mismatch || down ? 'bad' : 'ok'}`} style={{ width: 8, height: 8 }} />)}
              {mismatch && <span className="mono" style={{ fontSize: 10, color: 'var(--bad)', marginLeft: 4 }}>missing {d.affinity}</span>}
              {down && !mismatch && <span className="mono" style={{ fontSize: 10, color: 'var(--bad)', marginLeft: 4 }}>node offline</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* manual editor: +/- steppers per node */
function PlacementEditor({ d, state, dispatch, freeByNode }: { d: Draft; state: GameState; dispatch: React.Dispatch<Action>; freeByNode: Record<string, number> }) {
  const placed = d.podNodes.slice(0, d.replicas);
  const byNode = countByNode(placed);
  const totalPlaced = placed.length;
  return (
    <div className="place-grid" style={{ marginTop: 11 }}>
      {state.nodes.map(n => {
        const cnt = byNode[n.id] || 0;
        const freeHere = freeByNode[n.id] ?? 0;
        const capLeft = freeHere - cnt; // additional headroom
        const mismatch = !!d.affinity && cnt > 0 && !n.tags.includes(d.affinity);
        const down = !nodeIsUp(n);
        const canAdd = !down && totalPlaced < d.replicas && capLeft > 0;
        return (
          <div key={n.id} className={`place-node${mismatch ? ' mismatch' : ''}${n.kind === 'special' ? ' special' : ''}`}>
            <div className="place-node-top">
              <span className="place-node-name">
                <Icon name={nodeIcon(n)} size={13} /> {n.name}
                <span className="faint mono" style={{ fontSize: 10, marginLeft: 2 }}>{freeHere} free</span>
                {n.tags.map(t => <span key={t} className="tagchip" style={{ padding: '1px 6px', fontSize: 9 }}>{t}</span>)}
                {down && <OfflineChip />}
              </span>
              <div className="place-stepper">
                <button type="button" className="stp" disabled={cnt <= 0} onClick={() => dispatch({ type: 'FORM_PLACE', nodeId: n.id, delta: -1 })} aria-label={`Remove a pod from ${n.name}`}><Icon name="minus" size={13} /></button>
                <span className="place-count">{cnt}</span>
                <button type="button" className="stp" disabled={!canAdd} onClick={() => dispatch({ type: 'FORM_PLACE', nodeId: n.id, delta: 1 })} aria-label={`Add a pod to ${n.name}`}
                        title={down ? 'Node is offline' : undefined}><Icon name="plus" size={13} /></button>
              </div>
            </div>
            {cnt > 0 && (
              <div className="pn-pods">
                {Array.from({ length: cnt }).map((_, i) => <span key={i} className={`led ${mismatch || down ? 'bad' : 'ok'}`} style={{ width: 8, height: 8 }} />)}
                {mismatch && <span className="mono" style={{ fontSize: 10, color: 'var(--bad)', marginLeft: 4 }}>missing {d.affinity}</span>}
                {down && !mismatch && <span className="mono" style={{ fontSize: 10, color: 'var(--bad)', marginLeft: 4 }}>node offline</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
