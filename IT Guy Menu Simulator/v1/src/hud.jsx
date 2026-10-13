/* ============================================================
   CLUSTER — Global HUD + Side navigation
   ============================================================ */

function HUD() {
  const { state, dispatch } = useGame();
  const { meters, clock } = state;
  const backlog = state.tickets.filter(t => t.status !== 'done').length;
  const bugs    = state.tickets.filter(t => t.status === 'todo' && t.type === 'bug').length;
  const hasDash = hasUpgrade(state, 'dashboard');

  const hh = String(Math.floor(clock.mins/60)).padStart(2,'0');
  const mm = String(clock.mins%60).padStart(2,'0');
  const day = Math.floor(clock.tick/48) + 1;

  const dailyUpkeep = state.services.reduce((a,s)=>a+svcUpkeep(s),0) + state.nodes.reduce((a,n)=>a+nodeUpkeep(n),0);
  const budgetCol = meters.budget > 2000 ? 'var(--ok)' : meters.budget > 0 ? 'var(--warn)' : 'var(--bad)';
  const backlogCol = backlog <= 2 ? 'var(--ok)' : backlog <= 4 ? 'var(--warn)' : 'var(--bad)';
  const slaCol = meters.sla >= 99 ? 'var(--ok)' : meters.sla >= 96 ? 'var(--warn)' : 'var(--bad)';
  const flash = state._flash && (Date.now() - state._flash < 1000);

  return (
    <div className="hud">
      <div className="hud-title">
        <b>Cluster</b>
        <span>prod-east-1</span>
      </div>

      <div className="hud-meters">
        {/* Budget — hero meter */}
        <div className={`meter hero${meters.budget<0?' flash':''}`}>
          <div className="meter-head">
            <span className="meter-label"><Icon name="budget" size={13} /> Budget</span>
            <span className="faint mono" style={{fontSize:10}}>−{money(dailyUpkeep)}/day upkeep</span>
          </div>
          <div className="meter-val" style={{ color:budgetCol, fontSize:21 }}>{money(meters.budget)}</div>
          <div className="meter-bar"><i style={{ width:`${clamp(meters.budget/5200*100,0,100)}%`, background:budgetCol }} /></div>
          {meters.budget < 0 && <div className="meter-warn">provisioning locked — clear a ticket</div>}
        </div>

        <Meter icon="backlog" label="Open tickets" value={backlog} sub={bugs?`· ${bugs} incident${bugs>1?'s':''}`:'to work'}
               pct={100 - backlog*14} color={backlogCol} />

        {hasDash && (
          <Meter icon="sla" label="Uptime / SLA" value={meters.sla.toFixed(2)} sub="%"
                 pct={(meters.sla-80)/20*100} color={slaCol} flash={flash} />
        )}
      </div>

      {/* XP chip */}
      <div className="clock" style={{ paddingRight:13 }}>
        <Icon name="bolt" size={14} style={{ color:'var(--accent)' }} />
        <span className="clock-time" style={{ minWidth:0, fontSize:14 }}>{meters.xp} <span className="faint" style={{fontSize:11}}>XP</span></span>
      </div>

      {/* Clock + transport */}
      <div className="clock">
        <div>
          <div className="clock-time">{hh}:{mm}</div>
          <div className="clock-day">DAY {String(day).padStart(2,'0')}</div>
        </div>
        <div className="clock-btns">
          <button className={`cbtn${clock.paused?' active':''}`} title="Pause (space)"
                  onClick={()=>dispatch({type:'PAUSE', paused:true})}><Icon name="pause" size={15} /></button>
          <div className="speed-group">
            {[1,2,4].map(sp => (
              <button key={sp} className={`cbtn${!clock.paused && clock.speed===sp?' active':''}`}
                      onClick={()=>dispatch({type:'SPEED', speed:sp})}>
                {sp}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {clock.paused && <div className="paused-banner">⏸ Paused — configure freely · press space to run</div>}
    </div>
  );
}

function SideNav() {
  const { state, dispatch } = useGame();
  const backlog = state.tickets.filter(t => t.status !== 'done').length;
  const troubled = hasUpgrade(state,'dashboard') ? state.services.filter(s => sevOf(s.status)==='bad').length : 0;
  const affordable = state.upgrades.filter(u => !u.owned && !u.deferred &&
    state.meters.budget >= u.cost && state.meters.xp >= u.xp &&
    u.requires.every(r => state.upgrades.find(x=>x.id===r)?.owned)).length;

  const items = [
    { key:'tickets', icon:'tickets', label:'Tickets', badge: backlog || null },
    { key:'infra',   icon:'cluster', label:'Cluster', badge: troubled || null, badgeBad:true },
    { key:'tree',    icon:'tree',    label:'Upgrades', badge: affordable || null, warn:true },
  ];
  return (
    <div className="sidenav">
      {items.map(it => (
        <button key={it.key} className={`navbtn${state.ui.screen===it.key?' active':''}`}
                onClick={()=>dispatch({type:'NAV', screen:it.key})}>
          <Icon name={it.icon} size={21} />
          <span>{it.label}</span>
          {it.badge ? <span className={`nav-badge${it.warn?' warn':''}`}>{it.badge}</span> : null}
        </button>
      ))}
      <div className="nav-spacer" />
    </div>
  );
}

function Brand() {
  return (
    <div className="brand-cell">
      <div className="brand-mark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />
          <circle cx="12" cy="12" r="2.4" fill="#fff" stroke="none" />
        </svg>
      </div>
    </div>
  );
}

Object.assign(window, { HUD, SideNav, Brand });
