/* ============================================================
   CLUSTER — Tech Tree (spendable upgrades)
   ============================================================ */

const BRANCHES = [
  { key:'Build',         label:'Build',         color:'#39c2d7' },
  { key:'Workload',      label:'Workload',      color:'#4f93ff' },
  { key:'Observability', label:'Observability', color:'#28d17c' },
  { key:'Infra',         label:'Infra',         color:'#ffb02e' },
  { key:'Scaling',       label:'Scaling',       color:'#7c8cff' },
];

function TechTree() {
  const { state, dispatch } = useGame();
  const { budget, xp } = state.meters;
  const owns = (id) => state.upgrades.find(u=>u.id===id)?.owned;
  const reqMet = (u) => u.requires.every(r => owns(r));
  const affordable = (u) => !u.owned && !u.deferred && reqMet(u) && budget>=u.cost && xp>=u.xp;

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Upgrades</h1>
          <div className="sub">Spend budget and XP to automate the grind — from hand-builds to a self-healing cluster.</div>
        </div>
        <div className="flex gap12">
          <span className="pill ok"><Icon name="budget" size={13} /> {money(budget)}</span>
          <span className="pill accent"><Icon name="bolt" size={13} /> {xp} XP</span>
        </div>
      </div>

      <div className="screen-body">
        <div className="tree-wrap">
          {BRANCHES.map(b => {
            const ups = state.upgrades.filter(u => u.branch === b.key);
            return (
              <div className="tree-col" key={b.key}>
                <div className="tree-col-head">
                  <span className="led" style={{ background:b.color, boxShadow:`0 0 8px ${b.color}` }} />
                  {b.label}
                </div>
                {ups.map((u, i) => {
                  const lit = u.owned || (i>0 && owns(ups[i-1].id));
                  return (
                    <React.Fragment key={u.id}>
                      {i>0 && <div className={`tree-link${owns(ups[i-1].id)?' lit':''}`} />}
                      <UpgradeCard u={u} state={state}
                        owned={u.owned} affordable={affordable(u)} reqMet={reqMet(u)}
                        onBuy={()=>dispatch({type:'BUY_UPGRADE', id:u.id})} branchColor={b.color} />
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UpgradeCard({ u, owned, affordable, reqMet, onBuy, branchColor, state }) {
  const locked = !reqMet || u.deferred;
  const cls = owned ? 'owned' : affordable ? 'affordable' : locked ? 'locked' : '';
  const { budget, xp } = state.meters;
  return (
    <div className={`upgrade ${cls}`} onClick={()=> affordable && onBuy()} style={{ cursor: affordable?'pointer':'default' }}>
      <div className="u-ico" style={ owned?null:{ color: affordable?branchColor:'var(--text-faint)' } }>
        <Icon name={u.icon} size={20} />
      </div>
      <div className="u-name">{u.name} {owned && <Icon name="check" size={13} style={{color:'var(--ok)'}} />}</div>
      <div className="u-desc">{u.desc}</div>
      {owned ? (
        <div className="u-cost"><span className="pill ok" style={{padding:'2px 9px'}}>Active</span></div>
      ) : u.deferred ? (
        <div className="u-cost"><span className="pill" style={{padding:'2px 9px'}}>Later milestone</span></div>
      ) : (
        <div className="u-cost">
          <span style={{ color: budget>=u.cost?'var(--ok)':'var(--bad)' }}><Icon name="budget" size={13} style={{verticalAlign:-2}} /> {money(u.cost)}</span>
          {u.xp>0 && <span style={{ color: xp>=u.xp?'var(--accent)':'var(--bad)' }}><Icon name="bolt" size={12} style={{verticalAlign:-1}} /> {u.xp}</span>}
          {!reqMet && <span className="faint" style={{fontSize:10.5}}><Icon name="lock" size={11} style={{verticalAlign:-1}} /> locked</span>}
          {affordable && <span className="spacer" />}
          {affordable && <Icon name="arrow" size={15} style={{color:branchColor}} />}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { TechTree });
