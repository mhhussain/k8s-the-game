/* ============================================================
   CLUSTER — Service Authoring Form (2nd pass)
   Replica-only sizing · derived name · locked Deployment/
   probes/affinity · node placement with tags · upkeep footer
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

  const node = state.nodes.find(n => n.id === d.nodeId);
  const used = node ? podsOnNode(state, node.id, state.form.editingId) : 0;
  const slotsLeft = node ? node.slots - used : 0;
  const overSlots = d.replicas > slotsLeft;
  const affinityMismatch = hasAffinity && d.affinity && node && !node.tags.includes(d.affinity);

  const single = d.replicas === 1;
  const zero = d.replicas === 0;
  const upkeep = d.replicas * POD_COST;
  const cap = d.replicas * 55;
  const valid = d.imageId && !overSlots && !affinityMismatch;

  return (
    <>
      <div className="overlay" onClick={()=>dispatch({type:'FORM_CLOSE'})} />
      <div className="slideover">
        <div className="so-head">
          <div>
            <div className="flex gap8" style={{marginBottom:5}}>
              <span className="pill accent" style={{padding:'2px 9px'}}>{editing?'Edit service':'New service'}</span>
              {editing && hasUpgrade(state,'rolling') && <span className="pill ok" style={{padding:'2px 9px'}}><Icon name="rolling" size={11}/> rolling update</span>}
            </div>
            <h2>{d.name || 'Author a workload'}</h2>
            <div className="sub">Configure it while paused, then watch it schedule onto a node.</div>
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
            <div className="hint">The service <b>is</b> the repo — name maps 1:1, so there's never a mismatch.</div>
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
                ? 'A single pod on one node. If it dies, it stays dead until you restart it — and it never spreads across nodes.'
                : 'Managed replicas that recreate a failed pod on another node. Survives a node loss.'}
            </div>
          </div>

          <div className="divider" />

          {/* replicas — the single sizing dial */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Replicas — sizing
              <span className="faint mono" style={{fontWeight:400,fontSize:11}}>{zero?'stopped':single?'single point of failure':`${d.replicas} pods`}</span>
            </label>
            <Slider value={d.replicas} min={0} max={8} onChange={v=>set({replicas:v})}
                    zone={zero?'bad':single?'warn':''} format={v=>`${v}×`} />
            <div className="hint" style={zero?{color:'var(--bad)'}:single?{color:'var(--warn)'}:null}>
              {zero ? '0 replicas — the service is defined but NOT running. A dead pod will not be recreated.'
                : single ? 'One replica = no redundancy. A single failure takes the whole service down.'
                : `${d.replicas} pods share the load and survive individual failures. Costs more.`}
            </div>
          </div>

          {/* placement */}
          <div className="field">
            <label className="flex gap8"><Icon name="pin" size={14} style={{color:'var(--text-dim)'}}/> Placement — node</label>
            <div className="node-picker">
              {state.nodes.map(n => {
                const u = podsOnNode(state, n.id, state.form.editingId);
                const free = n.slots - u;
                const fits = d.replicas <= free;
                const affOk = !hasAffinity || !d.affinity || n.tags.includes(d.affinity);
                const sel = d.nodeId === n.id;
                return (
                  <button key={n.id} className={`node-opt${sel?' sel':''}${(!fits||!affOk)?' bad':''}`} onClick={()=>set({nodeId:n.id})}>
                    <div className="flex" style={{justifyContent:'space-between',width:'100%'}}>
                      <span className="mono" style={{fontWeight:600,fontSize:12.5,whiteSpace:'nowrap'}}>{n.name}</span>
                      <span className={`pill ${n.tier==='Large'?'accent':''}`} style={{padding:'1px 7px',fontSize:10}}>{n.tier}</span>
                    </div>
                    <div className="flex gap8" style={{marginTop:7,width:'100%'}}>
                      <SlotMini used={u} total={n.slots} add={sel?d.replicas:0} />
                      <span className="faint mono" style={{fontSize:10}}>{free}/{n.slots} free</span>
                    </div>
                    <div className="flex gap8" style={{marginTop:7,flexWrap:'wrap'}}>
                      {n.tags.map(t => <span key={t} className={`tagchip${d.affinity===t?' on':''}`}>{t}</span>)}
                    </div>
                  </button>
                );
              })}
            </div>
            {overSlots && <div className="hint" style={{color:'var(--bad)'}}>⚠ {node?.name} only has {slotsLeft} free slot{slotsLeft===1?'':'s'} — reduce replicas or pick a bigger node.</div>}
          </div>

          {/* affinity (locked until upgrade) */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Required hardware affinity
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
                {affinityMismatch && <div className="hint" style={{color:'var(--bad)'}}>⚠ {node?.name} doesn't advertise <b>{d.affinity}</b> — this service can't schedule there.</div>}
              </>
            ) : (
              <div className="locked-control"><Icon name="lock" size={14}/> Declare a service must run on ARM / x86 / GPU / DATA hardware.</div>
            )}
          </div>

          <div className="divider" />

          {/* probes (locked until dashboard) */}
          <div className="field">
            <label className="flex" style={{justifyContent:'space-between'}}>Health probes
              {!hasDash && <LockNote>unlock Service Dashboard</LockNote>}
            </label>
            {hasDash ? (
              <div className="panel" style={{ padding:'4px 14px' }}>
                <div className="flex" style={{ justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border-soft)' }}>
                  <div><div style={{fontWeight:600,fontSize:12.5}}>Liveness</div><div className="faint" style={{fontSize:11}}>Restart a pod that has hung.</div></div>
                  <Toggle checked={d.liveness} onChange={v=>set({liveness:v})} />
                </div>
                <div className="flex" style={{ justifyContent:'space-between', padding:'10px 0' }}>
                  <div><div style={{fontWeight:600,fontSize:12.5}}>Readiness</div><div className="faint" style={{fontSize:11}}>Hold traffic until the pod is ready.</div></div>
                  <Toggle checked={d.readiness} onChange={v=>set({readiness:v})} />
                </div>
              </div>
            ) : (
              <div className="locked-control"><Icon name="lock" size={14}/> You can't see pod health yet — probes unlock with the Service Dashboard.</div>
            )}
          </div>
        </div>

        <div className="so-foot">
          <div className="cost">
            upkeep <b>{money(upkeep)}/day</b> · {d.replicas} pod{d.replicas===1?'':'s'}
            {!zero && <> · ~{cap} req/s</>}
            {single && <span style={{color:'var(--warn)',marginLeft:8}}>· no redundancy</span>}
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

/* compact slot meter used in node picker */
function SlotMini({ used, total, add=0 }) {
  return (
    <div className="slot-dots" style={{margin:0,flex:1}}>
      {Array.from({length: total}).map((_,i) => {
        const isUsed = i < used;
        const isAdd  = i >= used && i < used + add;
        return <span key={i} className={`slot${isUsed?' used':isAdd?' adding':''}${i>=total?' over':''}`} style={{width:13,height:13}} />;
      })}
      {add > Math.max(0,total-used) && Array.from({length: add-(total-used)}).map((_,i)=>(
        <span key={'o'+i} className="slot over" style={{width:13,height:13}} />
      ))}
    </div>
  );
}

Object.assign(window, { ServiceForm, SlotMini });
