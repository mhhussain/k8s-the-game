/* ============================================================
   CLUSTER — Repos / Registry / CI  (drag-to-build pipeline)
   The three columns are one pipeline; the active tab just
   focuses a column. Drag a Repo onto the Registry to build.
   ============================================================ */

function BuildView({ tab }) {
  const { state, dispatch } = useGame();
  const [dragRepo, setDragRepo] = useState(null);
  const [over, setOver] = useState(false);
  const ciOn = hasUpgrade(state, 'ci_autobuild');

  const builtFor = (repoId) => state.images.filter(i => i.repoId === repoId && !i.building);
  const buildingFor = (repoId) => state.images.some(i => i.repoId === repoId && i.building);

  const onDrop = () => {
    if (dragRepo) dispatch({ type:'BUILD_IMAGE', repoId:dragRepo });
    setDragRepo(null); setOver(false);
  };

  return (
    <div className="build-grid">
      {/* ---- REPOS ---- */}
      <div className="build-col" style={tab==='repos'?{outline:'1px solid var(--border-strong)',outlineOffset:8,borderRadius:12}:null}>
        <h3><Icon name="box" size={14} /> Repos</h3>
        <div className="sub">Drag a card onto the Registry →</div>
        <div className="build-list">
          {state.repos.map(r => {
            const built = builtFor(r.id).length>0;
            const building = buildingFor(r.id);
            const ver = Math.max(0, ...builtFor(r.id).map(i=>i.version));
            return (
              <div key={r.id} className={`repo${dragRepo===r.id?' dragging':''}`}
                   draggable onDragStart={()=>setDragRepo(r.id)} onDragEnd={()=>{setDragRepo(null);setOver(false);}}>
                <span className="grip"><Icon name="grip" size={16} /></span>
                <div className="r-top">
                  <span className="langdot" style={{ background:LANGS[r.lang] }} />
                  <span className="r-name">{r.name}</span>
                </div>
                <div className="r-desc">{r.desc}</div>
                <div className="flex gap8" style={{ marginTop:9 }}>
                  <span className="pill" style={{padding:'2px 8px'}}>{r.lang}</span>
                  {building ? <span className="pill accent" style={{padding:'2px 8px'}}>building…</span>
                    : built ? <span className="pill ok" style={{padding:'2px 8px'}}><Icon name="check" size={11} /> v{ver}</span>
                    : <span className="faint mono" style={{fontSize:10.5}}>not built</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- REGISTRY (drop target) ---- */}
      <div className="build-col" style={tab==='registry'?{outline:'1px solid var(--border-strong)',outlineOffset:8,borderRadius:12}:null}>
        <h3><Icon name="layers" size={14} /> Registry</h3>
        <div className="sub">{ciOn ? 'CI is filling this automatically.' : 'Drop a repo here to build its image.'}</div>
        <div className={`dropzone${over?' over':''}`}
             onDragOver={e=>{e.preventDefault();setOver(true);}}
             onDragLeave={()=>setOver(false)}
             onDrop={onDrop}>
          {state.images.length === 0 && (
            <div className="dz-hint">
              <div className="ico"><Icon name="box" size={30} /></div>
              Drag a <b>Repo</b> here to build your first image.
            </div>
          )}
          {over && <div className="dz-hint" style={{color:'var(--accent)'}}><Icon name="bolt" size={22} /><div>Release to build</div></div>}
          {!over && (() => {
            const building = state.images.filter(i => i.building);
            const cards = [...latestImages(state), ...building];
            return cards.map(im => {
            const repo = state.repos.find(r=>r.id===im.repoId);
            return (
              <div key={im.id} className={`image-card${im.building?' image-building':''}`}>
                <span className="langdot" style={{ background:LANGS[repo?.lang]||'#555', width:14,height:14 }} />
                <div style={{ flex:1 }}>
                  <div className="tag">{im.tag}</div>
                  {im.building
                    ? <><div className="buildbar"><i style={{ width:`${im.progress}%` }} /></div></>
                    : <div className="digest">{im.digest} · latest</div>}
                </div>
                {im.building
                  ? <span className="pill accent" style={{padding:'2px 8px'}}>{im.fast?'cached':'building'} {Math.round(im.progress)}%</span>
                  : <button className="btn sm primary" onClick={()=>{ dispatch({type:'FORM_NEW'}); dispatch({type:'FORM_SET',patch:{imageId:im.id}}); }}>
                      <Icon name="plus" size={13} /> Deploy
                    </button>}
              </div>
            );
          }); })()}
        </div>
      </div>

      {/* ---- CI ---- */}
      <div className="build-col" style={tab==='ci'?{outline:'1px solid var(--border-strong)',outlineOffset:8,borderRadius:12}:null}>
        <h3><Icon name="ci" size={14} /> CI</h3>
        <div className="sub">{ciOn ? 'Pipelines are live.' : 'Empty — automate builds with an upgrade.'}</div>
        <div className="build-list">
          {!ciOn ? (
            <div className="dropzone" style={{ borderStyle:'solid' }}>
              <div className="ci-empty">
                <Icon name="ci" size={30} style={{opacity:.4,marginBottom:10}} />
                <div style={{fontSize:12.5, fontWeight:600, color:'var(--text-dim)', marginBottom:6}}>No pipelines yet</div>
                <div style={{fontSize:11.5}}>Right now you build by hand. Unlock <b style={{color:'var(--accent)'}}>Continuous Integration</b> to auto-build every repo.</div>
                <button className="btn sm primary" style={{marginTop:14}} onClick={()=>dispatch({type:'NAV',screen:'tree'})}>Open Upgrades</button>
              </div>
            </div>
          ) : (
            state.repos.map(r => (
              <div key={r.id} className="pipeline">
                <div className="flex" style={{ justifyContent:'space-between' }}>
                  <span className="r-name mono" style={{fontSize:12.5}}>{r.name}</span>
                  <span className="pill ok" style={{padding:'2px 8px'}}><LED sev="ok" /> auto</span>
                </div>
                <div className="pl-steps">
                  <span className="pl-step done">checkout</span>
                  <span className="pl-arrow">→</span>
                  <span className="pl-step done">build</span>
                  <span className="pl-arrow">→</span>
                  <span className="pl-step done">push</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BuildView });
