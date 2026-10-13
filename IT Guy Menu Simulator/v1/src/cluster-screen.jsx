/* ============================================================
   CLUSTER — Infrastructure panel (2nd pass)
   Blind-ops minimal board → Service Dashboard rich board ·
   slot-based node cards with tier + affinity tags
   ============================================================ */

function InfraScreen() {
  const { state, dispatch } = useGame();
  const tab = state.ui.infraTab;
  const hasDash = hasUpgrade(state, 'dashboard');
  const troubled = hasDash ? state.services.filter(s => sevOf(s.status)==='bad').length : 0;

  const tabs = [
    { key:'cluster',  label:'Cluster',  cnt: state.services.length },
    { key:'repos',    label:'Repos',    cnt: state.repos.length },
    { key:'registry', label:'Registry', cnt: latestImages(state).length },
    { key:'ci',       label:'CI',       cnt: hasUpgrade(state,'ci_autobuild') ? '●' : 0 },
  ];

  return (
    <div className="screen">
      <div className="screen-head" style={{ paddingBottom:0, borderBottom:'none' }}>
        <div>
          <h1>Infrastructure</h1>
          <div className="sub">
            {tab==='cluster' && (!hasDash ? 'Limited visibility — you only see what\'s running. Buy the Service Dashboard to reveal live health.'
              : troubled ? <span style={{color:'var(--bad)'}}>{troubled} service{troubled>1?'s':''} need{troubled>1?'':'s'} attention right now.</span>
              : 'All systems nominal. The board is green.')}
            {tab==='repos' && 'Source projects ready to ship. Drag one onto the Registry to build an image.'}
            {tab==='registry' && 'Latest container image per repo, ready to deploy into a service.'}
            {tab==='ci' && 'Build pipelines. Automate the Repo → Registry step.'}
          </div>
        </div>
        {tab==='cluster' && hasDash && (
          <Seg value={state.ui.boardView} onChange={v=>dispatch({type:'BOARD_VIEW',view:v})}
               options={[{value:'table',label:'Board',icon:'backlog'},{value:'grid',label:'Grid',icon:'cluster'},{value:'cards',label:'Cards',icon:'layers'}]} />
        )}
      </div>

      <div className="screen-head" style={{ padding:'14px 26px 0' }}>
        <div className="tabs">
          {tabs.map(tb => (
            <div key={tb.key} className={`tab${tab===tb.key?' active':''}`} onClick={()=>dispatch({type:'INFRA_TAB',tab:tb.key})}>
              {tb.label}{tb.cnt!==0 && <span className="cnt">{tb.cnt}</span>}
              {tb.key==='cluster' && troubled>0 && <LED sev="bad" pulse />}
            </div>
          ))}
        </div>
        {tab==='cluster' && <button className="btn primary sm" onClick={()=>dispatch({type:'FORM_NEW'})}><Icon name="plus" size={15} /> New service</button>}
      </div>

      <div className="screen-body" style={{ paddingTop:18 }}>
        {tab==='cluster' && <ClusterTab />}
        {(tab==='repos'||tab==='registry'||tab==='ci') && <BuildView tab={tab} />}
      </div>
    </div>
  );
}

/* ============================================================
   CLUSTER TAB
   ============================================================ */
function ClusterTab() {
  const { state } = useGame();
  const hasDash = hasUpgrade(state, 'dashboard');
  if (!state.services.length) {
    return (
      <div className="empty-state" style={{ minHeight:360 }}>
        <Icon name="cluster" size={48} className="es-ico" />
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Nothing is running yet</div>
          <div style={{ marginTop:6 }}>Build an image in the Registry, then author your first service.</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <NodesStrip />
      {hasDash ? <BoardSwitch /> : <MinimalBoard />}
    </>
  );
}

/* ---------- nodes: slot capacity + tier + affinity tags ---------- */
function NodesStrip() {
  const { state } = useGame();
  return (
    <div className="nodes-strip">
      {state.nodes.map(n => {
        const used = podsOnNode(state, n.id);
        const over = used > n.slots;
        const placed = state.services.filter(s => s.nodeId === n.id);
        return (
          <div className="node" key={n.id}>
            <div className="node-head">
              <span className="node-name"><Icon name={n.tier==='Large'?'server':'node'} size={14} style={{color:'var(--text-dim)'}} /> {n.name}</span>
              <span className={`pill ${n.tier==='Large'?'accent':''}`} style={{padding:'2px 8px'}}>{n.tier}</span>
            </div>
            <div className="flex" style={{justifyContent:'space-between', marginBottom:9}}>
              <span className="faint mono" style={{fontSize:10.5}}>POD SLOTS</span>
              <span className="mono" style={{fontSize:11.5, color: over?'var(--bad)':used===n.slots?'var(--warn)':'var(--text)'}}>{used} / {n.slots}</span>
            </div>
            <div className="slot-dots big">
              {Array.from({length: Math.max(n.slots, used)}).map((_,i)=>(
                <span key={i} className={`slot${i<used?(i>=n.slots?' over':' used'):''}`} />
              ))}
            </div>
            <div className="flex gap8" style={{marginTop:12, flexWrap:'wrap'}}>
              {n.tags.map(t => <span key={t} className="tagchip"><Icon name="tag" size={9} style={{verticalAlign:-1,opacity:.7}}/> {t}</span>)}
              <span className="faint mono spacer" style={{fontSize:10, textAlign:'right'}}>{placed.length} svc</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   PRE-DASHBOARD: minimal blind-ops board
   ============================================================ */
function MinimalBoard() {
  const { state, dispatch } = useGame();
  return (
    <div className="panel" style={{ overflow:'hidden' }}>
      <div className="panel-head">
        <h3>Workloads</h3>
        <span className="meta flex gap8"><Icon name="eye" size={13} style={{opacity:.5}}/> limited visibility</span>
      </div>
      <div className="minboard">
        {state.services.map(s => {
          const node = state.nodes.find(n=>n.id===s.nodeId);
          return (
            <div key={s.id} className="minrow" onClick={()=>dispatch({type:'FORM_EDIT',id:s.id})}>
              <div className="flex gap12">
                <span className="led idle" />
                <div>
                  <div className="svc-name" style={{fontSize:13.5}}>{s.name}</div>
                  <div className="img faint mono" style={{fontSize:10.5}}>{s.type} · {node?.name}</div>
                </div>
              </div>
              <div className="flex gap16">
                <span className="mono" style={{fontSize:13, color: s.replicas===0?'var(--text-faint)':'var(--text)'}}>{s.replicas} pod{s.replicas===1?'':'s'}</span>
                <Icon name="edit" size={14} className="faint" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="minboard-foot">
        <Icon name="lock" size={13}/>
        <span>Health, restarts and error rates are hidden. You'll hear about problems as <b>incident tickets</b> — or buy the <b style={{color:'var(--accent)'}}>Service Dashboard</b> to see everything live.</span>
        <button className="btn sm" onClick={()=>dispatch({type:'NAV',screen:'tree'})}>Upgrades</button>
      </div>
    </div>
  );
}

/* ============================================================
   POST-DASHBOARD: rich board (table / grid / cards)
   ============================================================ */
function BoardSwitch() {
  const { state } = useGame();
  const v = state.ui.boardView;
  if (v==='grid')  return <BoardGrid />;
  if (v==='cards') return <BoardCards />;
  return <BoardTable />;
}

function rowClass(s){ const sev=sevOf(s.status); return sev==='bad'?'row-bad':sev==='warn'?'row-warn':''; }
function imgTag(state, s){ return state.images.find(i=>i.id===s.imageId)?.tag || '—'; }
function nodeName(state, s){ return state.nodes.find(n=>n.id===s.nodeId)?.name || '—'; }
function readyCls(s){ return s.ready[0]===s.ready[1] && s.replicas>0 ? 'full' : s.ready[0]===0 ? 'none' : 'part'; }

function BoardTable() {
  const { state, dispatch } = useGame();
  return (
    <div className="panel" style={{ overflow:'hidden' }}>
      <div className="panel-head">
        <h3>Workloads</h3>
        <span className="meta flex gap8"><LED sev="ok"/> live · {state.services.length} services</span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table className="board">
          <thead>
            <tr>
              <th style={{minWidth:200}}>Service</th><th>Type</th><th>Ready</th><th>Status</th>
              <th>Restarts</th><th style={{minWidth:120}}>Error rate</th><th>Node</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.services.map(s => (
              <tr key={s.id} className={rowClass(s)} onClick={()=>dispatch({type:'FORM_EDIT',id:s.id})}>
                <td>
                  <div className="svc-name"><LED sev={sevOf(s.status)} pulse={sevOf(s.status)==='bad'} /> {s.name}</div>
                  <div className="img" style={{marginLeft:18}}>{imgTag(state,s)}</div>
                </td>
                <td className="mono faint">{s.type}</td>
                <td><span className={`ready ${readyCls(s)}`}>{s.ready[0]}/{s.ready[1]}</span></td>
                <td><StatusPill status={s.status} /></td>
                <td><span className={`restarts${s.restarts>3?' hot':''}`}>{s.restarts}</span></td>
                <td><ErrorRate rate={s.errorRate} /></td>
                <td className="mono faint">{nodeName(state,s)}</td>
                <td>
                  <div className="row-actions">
                    <button className="cbtn" title="Restart" onClick={(e)=>{e.stopPropagation();dispatch({type:'SERVICE_RESTART',id:s.id});}}><Icon name="restart" size={14} /></button>
                    <button className="cbtn" title="Edit" onClick={(e)=>{e.stopPropagation();dispatch({type:'FORM_EDIT',id:s.id});}}><Icon name="edit" size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoardGrid() {
  const { state, dispatch } = useGame();
  return (
    <div className="heatgrid">
      {state.services.map(s => {
        const sev = sevOf(s.status);
        return (
          <div key={s.id} className={`heatcell ${sev}`} onClick={()=>dispatch({type:'FORM_EDIT',id:s.id})}>
            <div className="hc-top">
              <span className="hc-name">{s.name}</span>
              <LED sev={sev} pulse={sev==='bad'} />
            </div>
            <div className={`hc-ready ready ${readyCls(s)}`}>{s.ready[0]}/{s.ready[1]}</div>
            <div style={{marginTop:8}}><StatusPill status={s.status} /></div>
            <div className="hc-foot">
              <span>↻ {s.restarts}</span>
              <span style={{color: s.errorRate>0.15?'var(--bad)':s.errorRate>0.03?'var(--warn)':'var(--text-dim)'}}>{(s.errorRate*100).toFixed(1)}% err</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCards() {
  const { state, dispatch } = useGame();
  const col = (sev)=> sev==='bad'?'var(--bad)':sev==='warn'?'var(--warn)':sev==='pending'?'var(--pending)':sev==='idle'?'#3a4658':'var(--ok)';
  return (
    <div className="svccards">
      {state.services.map(s => {
        const sev = sevOf(s.status);
        return (
          <div key={s.id} className={`svccard ${sev==='bad'?'bad':''}`} onClick={()=>dispatch({type:'FORM_EDIT',id:s.id})}>
            <div className="sc-bar" style={{ background:col(sev) }} />
            <div className="sc-body">
              <div className="flex" style={{ justifyContent:'space-between', marginBottom:10 }}>
                <div className="svc-name"><LED sev={sev} pulse={sev==='bad'} /> {s.name}</div>
                <div className="row-actions">
                  <button className="cbtn" title="Restart" onClick={(e)=>{e.stopPropagation();dispatch({type:'SERVICE_RESTART',id:s.id});}}><Icon name="restart" size={14} /></button>
                </div>
              </div>
              <div style={{marginBottom:6}}><StatusPill status={s.status} /></div>
              <div className="sc-row"><span className="k">Ready</span><span className={`v ready ${readyCls(s)}`}>{s.ready[0]}/{s.ready[1]}</span></div>
              <div className="sc-row"><span className="k">Image</span><span className="v faint" style={{fontSize:11}}>{imgTag(state,s)}</span></div>
              <div className="sc-row"><span className="k">Restarts</span><span className="v" style={{color:s.restarts>3?'var(--bad)':'inherit'}}>{s.restarts}</span></div>
              <div className="sc-row"><span className="k">Error rate</span><span className="v" style={{flex:'0 0 90px'}}><ErrorRate rate={s.errorRate} /></span></div>
              <div className="sc-row"><span className="k">Node</span><span className="v faint">{nodeName(state,s)}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { InfraScreen, ClusterTab, NodesStrip, MinimalBoard, BoardSwitch, BoardTable, BoardGrid, BoardCards });
