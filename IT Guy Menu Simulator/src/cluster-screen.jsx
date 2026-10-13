/* ============================================================
   CLUSTER — Infrastructure panel (light/playful redesign)
   Inviting empty state · node cards (generic w/ inline tag
   editor + special 16-slot) · provisioning · cards-default
   workloads view with per-pod placement · rebalance pulse
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
            {tab==='cluster' && (!hasDash ? 'Limited visibility — you only see what’s running. Buy the Service Dashboard to reveal live health.'
              : troubled ? <span style={{color:'var(--bad)'}}>{troubled} service{troubled>1?'s':''} need{troubled>1?'':'s'} attention right now.</span>
              : 'All systems nominal. The board is green.')}
            {tab==='repos' && 'Source projects ready to ship. Drag one onto the Registry to build an image.'}
            {tab==='registry' && 'Latest container image per repo, ready to deploy into a service.'}
            {tab==='ci' && 'Build pipelines. Automate the Repo → Registry step.'}
          </div>
        </div>
      </div>

      <div className="screen-head" style={{ padding:'14px 28px 0' }}>
        <div className="tabs">
          {tabs.map(tb => (
            <div key={tb.key} className={`tab${tab===tb.key?' active':''}`} onClick={()=>dispatch({type:'INFRA_TAB',tab:tb.key})}>
              {tb.label}{tb.cnt!==0 && <span className="cnt">{tb.cnt}</span>}
              {tb.key==='cluster' && troubled>0 && <LED sev="bad" pulse />}
            </div>
          ))}
        </div>
        {tab==='cluster' && state.services.length>0 && <button className="btn primary sm" onClick={()=>dispatch({type:'FORM_NEW'})}><Icon name="plus" size={15} /> New service</button>}
      </div>

      <div className="screen-body" style={{ paddingTop:20 }}>
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
  const { state, dispatch } = useGame();
  const hasDash = hasUpgrade(state, 'dashboard');
  const reb = state._rebalanceFlash && (Date.now() - state._rebalanceFlash < 1100);

  return (
    <>
      <SectionLabel ico="cluster" title="Nodes" extra={hasUpgrade(state,'rebalance') ? <span className="pill accent" style={{padding:'2px 9px'}}><Icon name="balance" size={12}/> auto-rebalance on</span> : null} />
      <NodesStrip rebalancing={reb} />
      <AddNodeControl />

      {state.services.length === 0 ? (
        <ClusterEmpty />
      ) : (
        <>
          <div className="view-toolbar" style={{ marginTop:28 }}>
            <SectionLabel ico="layers" title="Workloads" noMargin />
            {hasDash && (
              <Seg value={state.ui.boardView} onChange={v=>dispatch({type:'BOARD_VIEW',view:v})}
                   options={[{value:'cards',label:'Cards',icon:'layers'},{value:'grid',label:'Grid',icon:'cluster'},{value:'table',label:'Table',icon:'backlog'}]} />
            )}
          </div>
          {hasDash ? <BoardSwitch /> : <MinimalBoard />}
        </>
      )}
    </>
  );
}

function SectionLabel({ ico, title, extra, noMargin }) {
  return (
    <div className="flex" style={{ justifyContent:'space-between', marginBottom: noMargin?0:14 }}>
      <span className="flex gap8" style={{ fontSize:12, fontWeight:800, letterSpacing:'.04em', textTransform:'uppercase', color:'var(--text-dim)' }}>
        <Icon name={ico} size={15} style={{opacity:.7}} /> {title}
      </span>
      {extra}
    </div>
  );
}

function ClusterEmpty() {
  const { state, dispatch } = useGame();
  const haveImage = latestImages(state).length > 0;
  return (
    <div className="cluster-empty fadein" style={{ marginTop:24 }}>
      <div className="ce-ico"><Icon name="cluster" size={34} /></div>
      <h2>Your cluster is empty — and quiet</h2>
      <p>Nothing is running yet. {haveImage
        ? 'You’ve got an image in the Registry — author your first service to put it on a node.'
        : 'A work ticket will land in a moment. When it does: build an image in the Registry, then author a service from it.'}</p>
      <div className="flex gap8">
        {haveImage
          ? <button className="btn primary" onClick={()=>dispatch({type:'FORM_NEW'})}><Icon name="bolt" size={15}/> Author a service</button>
          : <button className="btn primary" onClick={()=>{dispatch({type:'INFRA_TAB',tab:'repos'});}}><Icon name="box" size={15}/> Go to Repos</button>}
        <button className="btn ghost" onClick={()=>dispatch({type:'NAV',screen:'tickets'})}>View tickets</button>
      </div>
    </div>
  );
}

/* ============================================================
   NODES — generic (editable tags) vs special (16-slot, locked)
   ============================================================ */
function NodesStrip({ rebalancing }) {
  const { state } = useGame();
  return (
    <div className="nodes-strip">
      {state.nodes.map(n => <NodeCard key={n.id} node={n} rebalancing={rebalancing} />)}
    </div>
  );
}

function failedPodsOnNode(state, node) {
  let f = 0;
  state.services.forEach(s => {
    if (!s.affinity || node.tags.includes(s.affinity)) return;
    (s.podNodes||[]).slice(0,s.replicas).forEach(nid => { if (nid===node.id) f++; });
  });
  return f;
}

function NodeCard({ node, rebalancing }) {
  const { state, dispatch } = useGame();
  const [adding, setAdding] = useState(false);
  const used = podsOnNode(state, node.id);
  const failed = failedPodsOnNode(state, node);
  const healthy = used - failed;
  const over = used > node.slots;
  const total = Math.max(node.slots, used);
  const placed = state.services.filter(s => (s.podNodes||[]).slice(0,s.replicas).includes(node.id));
  const availTags = HW.filter(t => !node.tags.includes(t));

  return (
    <div className={`node${node.kind==='special'?' special':''}${over?' over':''}${rebalancing?' rebalancing':''}`}>
      <div className="node-head">
        <span className="node-name">
          <span className="node-ico"><Icon name={node.kind==='special'?'cpu':(node.tier==='Large'?'server':'node')} size={15} /></span>
          {node.name}
        </span>
        <div className="node-kind">
          <span className="node-tier">{node.kind==='special' ? node.hw : node.tier} · {node.slots}</span>
        </div>
      </div>

      <div className="slot-line">
        <span className="lbl">Pod slots</span>
        <span className="cnt" style={{ color: over?'var(--bad)':used===node.slots?'var(--warn)':'var(--text)' }}>{used} / {node.slots}</span>
      </div>
      <div className="slot-dots big">
        {Array.from({length: total}).map((_,i)=>{
          let cls = '';
          if (i < failed) cls = ' failed';
          else if (i < used) cls = i >= node.slots ? ' over' : ' used';
          return <span key={i} className={`slot${cls}`} />;
        })}
      </div>

      {/* tags: generic = editable, special = locked */}
      <div className="node-tags">
        {node.kind==='special' ? (
          <span className="tagchip locked"><Icon name="lock" size={9} style={{verticalAlign:-1,opacity:.85}}/> {node.hw}</span>
        ) : (
          <>
            {node.tags.map(t => (
              <span key={t} className="tagchip on">
                {t}
                <span className="x" title="Remove tag" onClick={()=>dispatch({type:'NODE_REMOVE_TAG', id:node.id, tag:t})}><Icon name="close" size={9}/></span>
              </span>
            ))}
            {!adding && node.tags.length < 3 && (
              <button className="tag-add" title="Add a tag" onClick={()=>setAdding(true)}><Icon name="plus" size={12}/></button>
            )}
            {adding && (
              <div className="tag-menu">
                {availTags.map(t => (
                  <button key={t} onClick={()=>{ dispatch({type:'NODE_ADD_TAG', id:node.id, tag:t}); setAdding(false); }}>{t}</button>
                ))}
                <button onClick={()=>setAdding(false)} style={{color:'var(--text-faint)'}}>cancel</button>
              </div>
            )}
            {node.tags.length===0 && !adding && <span className="faint mono" style={{fontSize:10}}>untagged · anything schedules</span>}
          </>
        )}
      </div>

      <div className="node-foot">
        <div className="pods">
          {placed.length ? placed.map(s => {
            const cnt = (s.podNodes||[]).slice(0,s.replicas).filter(nid=>nid===node.id).length;
            const bad = s.affinity && !node.tags.includes(s.affinity);
            return <span key={s.id} className="podchip"><span className={`led ${bad?'bad':'ok'}`} />{s.name.split('-')[0]} ×{cnt}</span>;
          }) : <span className="empty-pods">no pods</span>}
        </div>
        <span className="faint mono" style={{fontSize:10}}>{node.kind==='special'?'special':'generic'}</span>
      </div>
    </div>
  );
}

/* ---------- provisioning ---------- */
function AddNodeControl() {
  const { state, dispatch } = useGame();
  const open = state.ui.addNode;
  const canLarge = hasUpgrade(state, 'large_nodes');
  const canSpecial = hasUpgrade(state, 'special_nodes');
  const budget = state.meters.budget;

  if (!open) {
    return (
      <button className="btn ghost" style={{ marginTop:4 }} onClick={()=>dispatch({type:'TOGGLE_ADDNODE', open:true})}>
        <Icon name="plus" size={15} /> Provision a node
      </button>
    );
  }
  const opt = (kind, tier, hw, label, slots, cost, locked, lockMsg) => (
    <button key={kind+'-'+(hw||tier)} className="place-node" disabled={locked || budget<cost}
      style={{ textAlign:'left', cursor: (locked||budget<cost)?'not-allowed':'pointer', opacity:(locked)?.55:1 }}
      onClick={()=>!locked && budget>=cost && dispatch({type:'PROVISION_NODE', kind, tier, hw})}>
      <div className="place-node-top">
        <span className="place-node-name"><Icon name={kind==='special'?'cpu':(tier==='Large'?'server':'node')} size={14} style={{color:'var(--text-dim)'}}/> {label}</span>
        <span className="node-tier">{slots} slots</span>
      </div>
      <div className="flex" style={{ justifyContent:'space-between', marginTop:9 }}>
        <span className="faint" style={{ fontSize:11 }}>{kind==='special'?`Locked to ${hw} · dense`:'Flexible · editable tags'}</span>
        <span className="mono" style={{ fontSize:11.5, fontWeight:600, color: budget>=cost?'var(--ok)':'var(--bad)' }}>{money(cost)}</span>
      </div>
      {locked && <div className="place-warn" style={{marginTop:8}}><Icon name="lock" size={12}/> {lockMsg}</div>}
    </button>
  );

  return (
    <div className="panel fadein" style={{ marginTop:8, padding:16 }}>
      <div className="flex" style={{ justifyContent:'space-between', marginBottom:13 }}>
        <span style={{ fontWeight:700, fontSize:13.5 }}>Provision a node</span>
        <button className="cbtn" onClick={()=>dispatch({type:'TOGGLE_ADDNODE', open:false})}><Icon name="close" size={15}/></button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10, marginBottom:14 }}>
        {opt('generic','Normal',null,'Generic · Normal',4, NODE_PROVISION.Normal, false)}
        {opt('generic','Large', null,'Generic · Large', 8, NODE_PROVISION.Large, !canLarge, 'Unlock “Large Nodes” in Upgrades')}
      </div>
      <div className="flex gap8" style={{ marginBottom:10, fontSize:11.5, color:'var(--text-dim)', fontWeight:600 }}>
        <Icon name="cpu" size={13} style={{opacity:.7}}/> Special hardware — 16 slots, locked to one type {!canSpecial && <span className="lock-note"><Icon name="lock" size={11}/> unlock Specialized Hardware</span>}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10 }}>
        {HW.map(hw => opt('special',null,hw,`${hw} node`,16, NODE_PROVISION.Special, !canSpecial, 'Unlock Specialized Hardware'))}
      </div>
    </div>
  );
}

/* ============================================================
   PRE-DASHBOARD: minimal blind-ops board (cards)
   ============================================================ */
function MinimalBoard() {
  const { state, dispatch } = useGame();
  return (
    <>
      <div className="svccards">
        {state.services.map(s => {
          const nodes = [...new Set((s.podNodes||[]).slice(0,s.replicas))].map(id=>state.nodes.find(n=>n.id===id)?.name).filter(Boolean);
          return (
            <div key={s.id} className="svccard" onClick={()=>dispatch({type:'FORM_EDIT',id:s.id})}>
              <div className="sc-bar" style={{ background:'var(--text-faint)' }} />
              <div className="sc-body">
                <div className="sc-head">
                  <div>
                    <div className="sc-name"><span className="led idle" /> {s.name}</div>
                    <div className="sc-sub">{s.type} · {s.replicas} pod{s.replicas===1?'':'s'}</div>
                  </div>
                  <Icon name="edit" size={15} className="faint" />
                </div>
                <div className="sc-podrow">
                  {nodes.map((nm,i)=><span key={i} className="podchip"><span className="led idle"/>{nm}</span>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel" style={{ marginTop:14, overflow:'hidden' }}>
        <div className="minboard-foot">
          <Icon name="lock" size={13}/>
          <span>Health, restarts and error rates are hidden. You’ll hear about problems as <b>incident tickets</b> — or buy the <b style={{color:'var(--accent)'}}>Service Dashboard</b> to see everything live.</span>
          <button className="btn sm" onClick={()=>dispatch({type:'NAV',screen:'tree'})}>Upgrades</button>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   POST-DASHBOARD: rich board (cards / grid / table)
   ============================================================ */
function BoardSwitch() {
  const { state } = useGame();
  const v = state.ui.boardView;
  if (v==='grid')  return <BoardGrid />;
  if (v==='table') return <BoardTable />;
  return <BoardCards />;
}

function rowClass(s){ const sev=sevOf(s.status); return sev==='bad'?'row-bad':sev==='warn'?'row-warn':''; }
function imgTag(state, s){ return state.images.find(i=>i.id===s.imageId)?.tag || '—'; }
function readyCls(s){ return s.ready[0]===s.ready[1] && s.replicas>0 ? 'full' : s.ready[0]===0 ? 'none' : 'part'; }
function sevColor(sev){ return sev==='bad'?'var(--bad)':sev==='warn'?'var(--warn)':sev==='pending'?'var(--pending)':sev==='idle'?'var(--text-faint)':'var(--ok)'; }

/* per-pod chips showing node placement + health */
function PodPlacement({ s }) {
  const { state } = useGame();
  const placed = (s.podNodes||[]).slice(0,s.replicas);
  const byNode = {};
  placed.forEach(nid => { byNode[nid] = (byNode[nid]||0)+1; });
  return (
    <div className="sc-podrow">
      {Object.entries(byNode).map(([nid,cnt]) => {
        const node = state.nodes.find(n=>n.id===nid);
        const bad = s.affinity && node && !node.tags.includes(s.affinity);
        return <span key={nid} className="podchip"><span className={`led ${bad?'bad':(s.status==='Pending'?'pending':'ok')}`} />{node?node.name:'—'} ×{cnt}</span>;
      })}
      {!placed.length && <span className="empty-pods">no pods scheduled</span>}
    </div>
  );
}

function BoardCards() {
  const { state, dispatch } = useGame();
  return (
    <div className="svccards">
      {state.services.map(s => {
        const sev = sevOf(s.status);
        const mis = misplaced(state, s);
        return (
          <div key={s.id} className={`svccard ${sev==='bad'?'bad':''}`} onClick={()=>dispatch({type:'FORM_EDIT',id:s.id})}>
            <div className="sc-bar" style={{ background:sevColor(sev) }} />
            <div className="sc-body">
              <div className="sc-head">
                <div>
                  <div className="sc-name"><LED sev={sev} pulse={sev==='bad'} /> {s.name}</div>
                  <div className="sc-sub">{s.type} · {imgTag(state,s)}</div>
                </div>
                <div className="row-actions">
                  <button className="cbtn" title="Restart" onClick={(e)=>{e.stopPropagation();dispatch({type:'SERVICE_RESTART',id:s.id});}}><Icon name="restart" size={14} /></button>
                  <button className="cbtn" title="Edit" onClick={(e)=>{e.stopPropagation();dispatch({type:'FORM_EDIT',id:s.id});}}><Icon name="edit" size={14} /></button>
                </div>
              </div>
              <div style={{marginBottom:2}}><StatusPill status={s.status} /></div>
              {mis>0 && <div className="place-warn" style={{marginTop:9}}><Icon name="alert" size={12}/> {mis} pod{mis>1?'s':''} on wrong hardware — needs <b>{s.affinity}</b></div>}
              <div className="sc-metrics">
                <div className="sc-metric"><div className="k">Ready</div><div className="v"><span className={`ready ${readyCls(s)}`}>{s.ready[0]}/{s.ready[1]}</span></div></div>
                <div className="sc-metric"><div className="k">Restarts</div><div className="v" style={{color:s.restarts>3?'var(--bad)':'inherit'}}>{s.restarts}</div></div>
                <div className="sc-metric"><div className="k">Error rate</div><div className="v"><ErrorRate rate={s.errorRate} /></div></div>
                <div className="sc-metric"><div className="k">Spread</div><div className="v">{distinctNodes(s)} node{distinctNodes(s)===1?'':'s'}</div></div>
              </div>
              <PodPlacement s={s} />
            </div>
          </div>
        );
      })}
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
              <span>{distinctNodes(s)} node{distinctNodes(s)===1?'':'s'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
              <th>Restarts</th><th style={{minWidth:120}}>Error rate</th><th>Placement</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.services.map(s => {
              const nodes = [...new Set((s.podNodes||[]).slice(0,s.replicas))];
              const mis = misplaced(state, s);
              return (
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
                  <td className="mono faint" style={{whiteSpace:'nowrap'}}>{nodes.length} node{nodes.length===1?'':'s'}{mis>0 && <span style={{color:'var(--bad)'}}> · {mis}✗</span>}</td>
                  <td>
                    <div className="row-actions">
                      <button className="cbtn" title="Restart" onClick={(e)=>{e.stopPropagation();dispatch({type:'SERVICE_RESTART',id:s.id});}}><Icon name="restart" size={14} /></button>
                      <button className="cbtn" title="Edit" onClick={(e)=>{e.stopPropagation();dispatch({type:'FORM_EDIT',id:s.id});}}><Icon name="edit" size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { InfraScreen, ClusterTab, NodesStrip, NodeCard, AddNodeControl, MinimalBoard, BoardSwitch, BoardCards, BoardGrid, BoardTable, PodPlacement });
