/* ============================================================
   CLUSTER — Service Authoring Form (light/playful redesign)
   Replica-only sizing · derived name · Deployment/probes/affinity
   gates · AUTO-SPREAD placement with MANUAL override · upkeep
   ============================================================ */

function LockNote({ children }) {
  return <span className="lock-note"><Icon name="lock" size={11} /> {children}</span>;
}

function ServiceForm() {
  const { state, dispatch } = useGame();
  if (!state.form.open) return null;
  const d = state.form.draft;
  const editing = !!state.form.editingId;
  const set = (patch) => dispatch({ type:'FORM_SET', patch });

  const canDeploy   = hasUpgrade(state, 'deployments');
  const hasDash     = hasUpgrade(state, 'dashboard');
  const hasAffinity = hasUpgrade(state, 'affinity');
  const images = latestImages(state);

  const placed = (d.podNodes || []).slice(0, d.replicas);
  const placedCount = placed.length;
  const unplaced = d.replicas - placedCount;

  // capacity across the cluster (excluding this service's own current pods)
  const freeByNode = {};
  state.nodes.forEach(n => { freeByNode[n.id] = nodeSlots(n) - podsOnNode(state, n.id, state.form.editingId); });
  const totalFree = Object.values(freeByNode).reduce((a,b)=>a+b,0);
  const overCapacity = d.replicas > totalFree;

  // affinity mismatches (schedule-but-fail, doesn't block deploy)
  const misCount = d.affinity ? placed.filter(nid => { const n=state.nodes.find(x=>x.id===nid); return !n || !n.tags.includes(d.affinity); }).length : 0;

  const single = d.replicas === 1;
  const zero = d.replicas === 0;
  const upkeep = d.replicas * POD_COST;
  const cap = d.replicas * 55;
  const manualComplete = d.spread === 'auto' || unplaced === 0;
  const valid = d.imageId && !overCapacity && manualComplete;

  return (
    <>
      <div className="overlay" onClick={()=>dispatch({type:'FORM_CLOSE'})} />
      <div className="slideover">
        <div className="so-head">
          <div>
            <div className="flex gap8" style={{marginBottom:6}}>
              <span className="pill accent" style={{padding:'2px 10px'}}>{editing?'Edit service':'New service'}</span>
              {editing && hasUpgrade(state,'rolling') && <span className="pill ok" style={{padding:'2px 10px'}}><Icon name="rolling" size={11}/> rolling update</span>}
            </div>
            <h2>{d.name || 'Author a workload'}</h2>
            <div className="sub">Configure it while paused, then watch it schedule onto your nodes.</div>
          </div>
          <button className="cbtn" onClick={()=>dispatch({type:'FORM_CLOSE'})}><Icon name="close" size={16} /></button>
        </div>

        <div className="so-body">
          {/* image — drives name 1:1 */}
          <div className="field">
            <label>Image <span className="faint mono" style={{fontWeight:400,fontSize:11}}>· from Registry</span></label>
            {images.length ? (
              <select value={d.imageId} onChange={e=>set({imageId:e.target.value})}>
                <option value="">Select an image…</option>
                {images.map(im => <option key={im.id} value={im.id}>{im.tag}</option>)}
              </select>
            ) : (
              <div className="hint" style={{ color:'var(--warn)' }}>No images built yet — go to Registry and build one first.</div>
            )}
          </div>

          {/* derived service name */}
          <div className="field">
            <label>Service name</label>
            <div className="derived-field">
              <Icon name="box" size={14} style={{color:'var(--text-faint)'}} />
              <span className="mono">{d.name || '—'}</span>
              <span className="derived-tag">derived from image</span>
            </div>
          </div>

          {/* workload type */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Workload type
              {!canDeploy && <LockNote>unlock in Upgrades</LockNote>}
            </label>
            <div className="seg">
              <button className={d.type==='Pod'?'on accent':''} onClick={()=>set({type:'Pod'})}>
                <Icon name="box" size={14}/> Pod
              </button>
              <button className={d.type==='Deployment'?'on accent':''} disabled={!canDeploy}
                      onClick={()=>canDeploy&&set({type:'Deployment'})}
                      style={!canDeploy?{opacity:.5,cursor:'not-allowed'}:null}>
                <Icon name={canDeploy?'deploy':'lock'} size={14}/> Deployment
              </button>
            </div>
            <div className="hint">
              {d.type==='Pod'
                ? 'A single workload. A dead pod stays dead until you restart it — and it can’t be highly available.'
                : 'Managed replicas that recreate a failed pod on another node. Required for high availability.'}
            </div>
          </div>

          <div className="divider" />

          {/* replicas */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Replicas — sizing
              <span className="faint mono" style={{fontWeight:400,fontSize:11}}>{zero?'stopped':single?'single point of failure':`${d.replicas} pods`}</span>
            </label>
            <Slider value={d.replicas} min={0} max={8} onChange={v=>set({replicas:v})}
                    zone={zero?'bad':single?'warn':''} format={v=>`${v}×`} />
            <div className="hint" style={zero?{color:'var(--bad)'}:single?{color:'var(--warn)'}:null}>
              {zero ? '0 replicas — the service is defined but NOT running.'
                : single ? 'One replica = no redundancy. A single failure takes the whole service down.'
                : `${d.replicas} pods share the load and survive individual failures.`}
            </div>
          </div>

          {/* affinity (gated) */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Required hardware
              {!hasAffinity && <LockNote>unlock Node Affinity</LockNote>}
            </label>
            {hasAffinity ? (
              <>
                <div className="seg" style={{flexWrap:'wrap'}}>
                  <button className={!d.affinity?'on':''} onClick={()=>set({affinity:null})}>Any</button>
                  {AFFINITIES.map(a => (
                    <button key={a} className={d.affinity===a?'on accent':''} onClick={()=>set({affinity:a})}>{a}</button>
                  ))}
                </div>
                <div className="hint">A replica that lands on a node without this tag still schedules — but stays unhealthy until you move it or tag the node.</div>
              </>
            ) : (
              <div className="locked-control"><Icon name="lock" size={14}/> Declare a service must run on x86 / ARM / GPU / DATA hardware.</div>
            )}
          </div>

          {/* PLACEMENT — auto-spread / manual override */}
          <div className="field">
            <div className="place-head">
              <label className="flex gap8" style={{margin:0}}><Icon name="pin" size={14} style={{color:'var(--text-dim)'}}/> Placement</label>
              <div className="place-mode">
                <button className={d.spread==='auto'?'on':''} onClick={()=>set({spread:'auto'})}><Icon name="spark" size={12}/> Auto-spread</button>
                <button className={d.spread==='manual'?'on':''} onClick={()=>set({spread:'manual'})}><Icon name="pin" size={12}/> Manual</button>
              </div>
            </div>

            {d.spread==='auto' ? (
              <>
                <div className="place-auto-note">
                  <Icon name="spark" size={15} style={{color:'var(--accent)', flex:'none'}}/>
                  <span>Replicas auto-spread across {new Set(placed).size} node{new Set(placed).size===1?'':'s'} to maximise resilience. Switch to Manual to place pods yourself.</span>
                </div>
                <PlacementView d={d} state={state} editingId={state.form.editingId} />
                <button className="btn ghost sm" style={{marginTop:10}} onClick={()=>dispatch({type:'FORM_RESPREAD'})}><Icon name="shuffle" size={13}/> Re-distribute</button>
              </>
            ) : (
              <>
                <PlacementEditor d={d} state={state} editingId={state.form.editingId} dispatch={dispatch} freeByNode={freeByNode} />
                <div className="flex" style={{ justifyContent:'space-between', marginTop:10 }}>
                  <span className="mono" style={{ fontSize:11.5, whiteSpace:'nowrap', color: unplaced>0?'var(--warn)':'var(--ok)' }}>
                    {unplaced>0 ? `${unplaced} replica${unplaced>1?'s':''} unplaced` : 'all replicas placed'}
                  </span>
                  <button className="btn ghost sm" onClick={()=>dispatch({type:'FORM_RESPREAD'})}><Icon name="spark" size={13}/> Auto-distribute</button>
                </div>
              </>
            )}

            {overCapacity && <div className="place-warn"><Icon name="alert" size={13}/> Cluster is out of slots ({totalFree} free, {d.replicas} needed) — provision another node first.</div>}
            {misCount>0 && !overCapacity && <div className="place-warn"><Icon name="alert" size={13}/> {misCount} replica{misCount>1?'s':''} on a node without <b>&nbsp;{d.affinity}&nbsp;</b> — {editing?'they’ll':'they’ll'} schedule but stay unhealthy (a visible bug).</div>}
          </div>

          <div className="divider" />

          {/* probes (gated) */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Health probes
              {!hasDash && <LockNote>unlock Service Dashboard</LockNote>}
            </label>
            {hasDash ? (
              <div className="panel" style={{ padding:'4px 14px', boxShadow:'none' }}>
                <div className="flex" style={{ justifyContent:'space-between', padding:'11px 0', borderBottom:'1px solid var(--border-soft)' }}>
                  <div><div style={{fontWeight:700,fontSize:12.5}}>Liveness</div><div className="faint" style={{fontSize:11}}>Restart a pod that has hung.</div></div>
                  <Toggle checked={d.liveness} onChange={v=>set({liveness:v})} />
                </div>
                <div className="flex" style={{ justifyContent:'space-between', padding:'11px 0' }}>
                  <div><div style={{fontWeight:700,fontSize:12.5}}>Readiness</div><div className="faint" style={{fontSize:11}}>Hold traffic until the pod is ready.</div></div>
                  <Toggle checked={d.readiness} onChange={v=>set({readiness:v})} />
                </div>
              </div>
            ) : (
              <div className="locked-control"><Icon name="lock" size={14}/> You can’t see pod health yet — probes unlock with the Service Dashboard.</div>
            )}
          </div>
        </div>

        <div className="so-foot">
          <div className="cost">
            upkeep <b>{money(upkeep)}/day</b> · {d.replicas} pod{d.replicas===1?'':'s'}
            {!zero && <> · ~{cap} req/s</>}
          </div>
          <button className="btn ghost" onClick={()=>dispatch({type:'FORM_CLOSE'})}>Cancel</button>
          <button className="btn primary" disabled={!valid} onClick={()=>dispatch({type:'SERVICE_SAVE'})}>
            <Icon name={editing?'check':'bolt'} size={15} /> {editing ? 'Apply changes' : 'Deploy service'}
          </button>
        </div>
      </div>
    </>
  );
}

/* read-only auto view: which node holds how many pods */
function PlacementView({ d, state, editingId }) {
  const placed = (d.podNodes||[]).slice(0,d.replicas);
  const byNode = {};
  placed.forEach(nid => { byNode[nid] = (byNode[nid]||0)+1; });
  return (
    <div className="place-grid" style={{ marginTop:11 }}>
      {state.nodes.map(n => {
        const cnt = byNode[n.id] || 0;
        const mismatch = d.affinity && cnt>0 && !n.tags.includes(d.affinity);
        if (cnt===0) return null;
        return (
          <div key={n.id} className={`place-node${mismatch?' mismatch':''}${n.kind==='special'?' special':''}`}>
            <div className="place-node-top">
              <span className="place-node-name"><Icon name={n.kind==='special'?'cpu':(n.tier==='Large'?'server':'node')} size={13}/> {n.name}</span>
              <span className="mono" style={{fontSize:12, fontWeight:600}}>{cnt} pod{cnt>1?'s':''}</span>
            </div>
            <div className="pn-pods">
              {Array.from({length:cnt}).map((_,i)=><span key={i} className={`led ${mismatch?'bad':'ok'}`} style={{width:8,height:8}} />)}
              {mismatch && <span className="mono" style={{fontSize:10, color:'var(--bad)', marginLeft:4}}>missing {d.affinity}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* manual editor: +/- steppers per node */
function PlacementEditor({ d, state, editingId, dispatch, freeByNode }) {
  const placed = (d.podNodes||[]).slice(0,d.replicas);
  const byNode = {};
  placed.forEach(nid => { byNode[nid] = (byNode[nid]||0)+1; });
  const totalPlaced = placed.length;
  return (
    <div className="place-grid" style={{ marginTop:11 }}>
      {state.nodes.map(n => {
        const cnt = byNode[n.id] || 0;
        const capLeft = freeByNode[n.id] - cnt; // additional headroom
        const mismatch = d.affinity && cnt>0 && !n.tags.includes(d.affinity);
        const canAdd = totalPlaced < d.replicas && capLeft > 0;
        return (
          <div key={n.id} className={`place-node${mismatch?' mismatch':''}${n.kind==='special'?' special':''}`}>
            <div className="place-node-top">
              <span className="place-node-name">
                <Icon name={n.kind==='special'?'cpu':(n.tier==='Large'?'server':'node')} size={13}/> {n.name}
                <span className="faint mono" style={{fontSize:10, marginLeft:2}}>{freeByNode[n.id]} free</span>
                {n.tags.map(t=><span key={t} className="tagchip" style={{padding:'1px 6px',fontSize:9}}>{t}</span>)}
              </span>
              <div className="place-stepper">
                <button className="stp" disabled={cnt<=0} onClick={()=>dispatch({type:'FORM_PLACE', nodeId:n.id, delta:-1})}><Icon name="minus" size={13}/></button>
                <span className="place-count">{cnt}</span>
                <button className="stp" disabled={!canAdd} onClick={()=>dispatch({type:'FORM_PLACE', nodeId:n.id, delta:1})}><Icon name="plus" size={13}/></button>
              </div>
            </div>
            {cnt>0 && (
              <div className="pn-pods">
                {Array.from({length:cnt}).map((_,i)=><span key={i} className={`led ${mismatch?'bad':'ok'}`} style={{width:8,height:8}} />)}
                {mismatch && <span className="mono" style={{fontSize:10, color:'var(--bad)', marginLeft:4}}>missing {d.affinity}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { ServiceForm, PlacementView, PlacementEditor });
