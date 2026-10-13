/* ============================================================
   CLUSTER — Ticket Board (2nd pass)
   Two columns (Open / Resolved) · ticket types (new / bug) ·
   live acceptance-criteria checklist · validation + rejection
   ============================================================ */

const PRIO = { high:{c:'var(--bad)',l:'High'}, med:{c:'var(--warn)',l:'Medium'}, low:{c:'var(--accent)',l:'Low'} };
const TYPE = {
  new: { label:'New service', icon:'plus',  color:'var(--accent)' },
  bug: { label:'Incident',    icon:'alert', color:'var(--bad)' },
};

function TicketBoard() {
  const { state } = useGame();
  const [open, setOpen] = useState(null);
  const cols = [
    { key:'todo', title:'Open',     sev:'pending' },
    { key:'done', title:'Resolved', sev:'ok' },
  ];
  const openCount = state.tickets.filter(t=>t.status==='todo').length;
  const bugCount = state.tickets.filter(t=>t.status==='todo'&&t.type==='bug').length;

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Ticket Board</h1>
          <div className="sub">Work the cluster, then resolve a ticket — the system grades it against its acceptance criteria.</div>
        </div>
        <div className="flex gap8">
          {bugCount>0 && <span className="pill bad"><Icon name="alert" size={13}/> {bugCount} incident{bugCount>1?'s':''}</span>}
          <span className="pill"><Icon name="backlog" size={13} /> {openCount} open</span>
        </div>
      </div>

      <div className="screen-body">
        <div className="kanban two">
          {cols.map(col => {
            const list = state.tickets.filter(t => t.status === col.key);
            return (
              <div key={col.key} className="kcol">
                <div className="kcol-head">
                  <span className="t"><LED sev={col.sev} /> {col.title}</span>
                  <span className="faint mono" style={{fontSize:11}}>{list.length}</span>
                </div>
                <div className="kcol-list">
                  {list.map(t => <TicketCard key={t.id} t={t} onOpen={()=>setOpen(t.id)} />)}
                  {!list.length && (
                    <div className="faint" style={{ textAlign:'center', padding:'28px 8px', fontSize:12 }}>
                      {col.key==='done' ? 'Nothing resolved yet.' : 'All clear. Enjoy it while it lasts.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && <TicketDetail id={open} onClose={()=>setOpen(null)} />}
    </div>
  );
}

function TicketCard({ t, onOpen }) {
  const { state } = useGame();
  const ty = TYPE[t.type];
  const graded = gradeTicket(state, t);
  const metN = graded.filter(c=>c.met).length;
  const allMet = t.status==='todo' && metN === graded.length;
  return (
    <div className={`ticket${t.type==='bug'?' bug':''}`} onClick={onOpen}>
      <span className="prio-bar" style={{ background:PRIO[t.prio].c }} />
      <div className="tk-top">
        <span className="flex gap8">
          <span className="type-badge" style={{ color:ty.color, borderColor:ty.color }}>
            <Icon name={ty.icon} size={11}/> {ty.label}
          </span>
          <span className="tk-id">{t.id}</span>
        </span>
        {allMet && <span className="pill ok" style={{padding:'1px 7px',fontSize:10}}><Icon name="check" size={11}/> ready</span>}
      </div>
      <div className="tk-title">{t.title}</div>
      <div className="flex" style={{justifyContent:'space-between'}}>
        <div className="tk-req"><Avatar color={t.avatar} name={t.requester} /> {t.requester}</div>
        {t.status==='todo' && <span className="crit-count mono">{metN}/{graded.length}</span>}
      </div>
    </div>
  );
}

function TicketDetail({ id, onClose }) {
  const { state, dispatch } = useGame();
  const [shake, setShake] = useState(false);
  const t = state.tickets.find(x => x.id === id);
  if (!t) return null;
  const ty = TYPE[t.type];
  const graded = gradeTicket(state, t);
  const allMet = graded.every(c => c.met);

  const resolve = () => {
    if (!allMet) { setShake(true); setTimeout(()=>setShake(false), 500); }
    dispatch({ type:'TICKET_RESOLVE', id:t.id });
    if (allMet) onClose();
  };
  const goBuild = () => { dispatch({type:'NAV', screen:'infra'}); dispatch({type:'INFRA_TAB', tab: t.type==='bug'?'cluster':'repos'}); onClose(); };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="slideover">
        <div className="so-head">
          <div>
            <div className="flex gap8" style={{marginBottom:6}}>
              <span className="type-badge" style={{ color:ty.color, borderColor:ty.color }}><Icon name={ty.icon} size={11}/> {ty.label}</span>
              <span className="tk-id mono">{t.id}</span>
              <span className="pill" style={{ color:PRIO[t.prio].c, borderColor:PRIO[t.prio].c, padding:'1px 8px' }}>{PRIO[t.prio].l}</span>
            </div>
            <h2>{t.title}</h2>
            <div className="sub flex gap8" style={{marginTop:6}}><Avatar color={t.avatar} name={t.requester} /> {t.requester}</div>
          </div>
          <button className="cbtn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        <div className="so-body">
          <div className="field">
            <label>The request</label>
            <p className="muted" style={{ margin:0, lineHeight:1.6 }}>{t.body}</p>
          </div>

          {t.hint && (
            <div className="readbetween">
              <Icon name="alert" size={16} style={{ color:'var(--warn)', marginTop:1, flex:'none' }} />
              <div>
                <div style={{ fontWeight:600, fontSize:12, marginBottom:3, color:'var(--warn)' }}>Reading between the lines</div>
                <div className="muted" style={{ fontSize:12.5, lineHeight:1.5 }}>{t.hint}</div>
              </div>
            </div>
          )}

          {/* live acceptance criteria checklist */}
          <div className={`field${shake?' shake':''}`} style={{marginTop:18}}>
            <label className="flex" style={{justifyContent:'space-between'}}>
              Acceptance criteria
              <span className="mono faint" style={{fontWeight:400,fontSize:11}}>{graded.filter(c=>c.met).length}/{graded.length} met</span>
            </label>
            <div className="crit-list">
              {graded.map((c,i) => (
                c.subs ? (
                  <div key={i} className={`crit-group${c.met?' met':''}${(!c.met&&shake)?' unmet-flash':''}`}>
                    <div className={`crit${c.met?' met':''}`}>
                      <span className="crit-box">{c.met ? <Icon name="check" size={13}/> : <Icon name="close" size={12}/>}</span>
                      <span className="crit-label">{c.label}</span>
                    </div>
                    <div className="crit-subs">
                      {c.subs.map((s,j) => (
                        <div key={j} className={`crit-sub${s.met?' met':''}`}>
                          <span className="cs-box">{s.met ? <Icon name="check" size={11}/> : <Icon name="close" size={10}/>}</span>
                          {s.label}
                          {!s.met && s.hint && <span className="cs-hint">{s.hint}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={i} className={`crit${c.met?' met':''}${(!c.met&&shake)?' unmet-flash':''}`}>
                    <span className="crit-box">{c.met ? <Icon name="check" size={13}/> : <Icon name="close" size={12}/>}</span>
                    <span className="crit-label">{c.label}</span>
                  </div>
                )
              ))}
            </div>
            {t.status==='done' && <div className="hint" style={{color:'var(--ok)'}}><Icon name="check" size={12} style={{verticalAlign:-1}}/> Resolved — paid out {money(t.reward)}.</div>}
          </div>

          <div className="divider" />
          <div className="flex gap16" style={{ fontSize:12.5 }}>
            <div><div className="faint mono" style={{fontSize:10.5,letterSpacing:'.05em'}}>REWARD</div><b className="mono" style={{color:'var(--ok)',fontSize:15}}>+{money(t.reward)}</b></div>
            <div><div className="faint mono" style={{fontSize:10.5,letterSpacing:'.05em'}}>XP</div><b className="mono" style={{color:'var(--accent)',fontSize:15}}>+{t.xp}</b></div>
          </div>
        </div>

        <div className="so-foot">
          <span className="cost">
            {t.status==='done' ? 'This ticket is resolved.'
              : allMet ? <span style={{color:'var(--ok)'}}>All criteria met — ready to resolve.</span>
              : 'Meet every criterion, then resolve.'}
          </span>
          {t.status==='todo' && <button className="btn ghost" onClick={goBuild}>{t.type==='bug'?'Open cluster':'Go build'}</button>}
          {t.status==='todo'
            ? <button className={`btn ${allMet?'primary':''}`} onClick={resolve} style={!allMet?{opacity:.75}:null}>
                <Icon name="check" size={15} /> Mark done
              </button>
            : <button className="btn ghost" onClick={()=>dispatch({type:'TICKET_REOPEN', id:t.id})}>Re-open</button>}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TicketBoard });
