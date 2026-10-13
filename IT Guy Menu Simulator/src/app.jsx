/* ============================================================
   CLUSTER — App shell, router, intro, first-ticket beat, tweaks
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "daylight",
  "boardView": "cards",
  "drama": 0.6
}/*EDITMODE-END*/;

const THEME_LABEL = { daylight:'Daylight', bubblegum:'Bubblegum', voltage:'Voltage' };

function Shell() {
  const { state, dispatch } = useGame();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [intro, setIntro] = useState(() => !localStorage.getItem('cluster_seen_intro_v2'));

  // apply theme
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme || 'daylight';
  }, [t.theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--drama', String(t.drama));
    window.__DRAMA = t.drama;
  }, [t.drama]);
  useEffect(() => { dispatch({ type:'BOARD_VIEW', view:t.boardView }); }, [t.boardView]);

  // keyboard: space pauses/resumes
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        dispatch(state.clock.paused ? { type:'SPEED', speed:state.clock.speed } : { type:'PAUSE', paused:true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.clock.paused, state.clock.speed]);

  const closeIntro = () => { localStorage.setItem('cluster_seen_intro_v2','1'); setIntro(false); };

  return (
    <div className="app">
      <Brand />
      <HUD />
      <SideNav />
      <div className="main">
        {state.ui.screen === 'tickets' && <TicketBoard />}
        {state.ui.screen === 'infra'   && <InfraScreen />}
        {state.ui.screen === 'tree'    && <TechTree />}
      </div>

      <ServiceForm />
      <Toasts />
      {intro && <Intro onClose={closeIntro} dispatch={dispatch} />}
      {!intro && state.firstBeat && <FirstBeat beat={state.firstBeat} dispatch={dispatch} />}

      <TweaksPanel>
        <TweakSection label="Visual direction" />
        <TweakRadio label="Theme" value={t.theme}
          options={['daylight','bubblegum','voltage']}
          onChange={v=>setTweak('theme', v)} />
        <TweakSection label="Status board" />
        <TweakRadio label="Default layout" value={t.boardView}
          options={['cards','grid','table']} onChange={v=>setTweak('boardView', v)} />
        <TweakSection label="Alarm intensity" />
        <TweakSlider label="Drift drama" value={t.drama} min={0} max={1} step={0.1}
          onChange={v=>setTweak('drama', v)} />
      </TweaksPanel>
    </div>
  );
}

/* ---------- first-ticket-lands beat ---------- */
function FirstBeat({ beat, dispatch }) {
  const go = () => { dispatch({ type:'NAV', screen:'tickets' }); dispatch({ type:'CLEAR_BEAT' }); };
  return (
    <>
      <div className="overlay" onClick={()=>dispatch({type:'CLEAR_BEAT'})} />
      <div className="firstbeat">
        <div className="fb-ico"><Icon name="tickets" size={28} /></div>
        <h3>Your first ticket just landed</h3>
        <p><b style={{color:'var(--text)'}}>{beat.title}</b><br/>Work arrives on the board as tickets. Read it, build what it needs, then mark it done — the engine grades your live cluster against the acceptance criteria.</p>
        <div className="flex gap8" style={{ justifyContent:'center' }}>
          <button className="btn primary" style={{ whiteSpace:'nowrap' }} onClick={go}><Icon name="arrow" size={15}/> Open the ticket</button>
          <button className="btn ghost" style={{ whiteSpace:'nowrap' }} onClick={()=>dispatch({type:'CLEAR_BEAT'})}>Later</button>
        </div>
      </div>
    </>
  );
}

/* ---------- Intro: the core loop ---------- */
function Intro({ onClose, dispatch }) {
  const steps = [
    { ico:'tickets', t:'Read a ticket', d:'Work arrives on the board moments after you start. Each lists acceptance criteria — and hints at what they didn’t say.' },
    { ico:'box',     t:'Build an image', d:'Drag a Repo onto the Registry to build a container image.' },
    { ico:'bolt',    t:'Author a service', d:'Pick the image, set replicas, let pods auto-spread across your nodes. Deploy.' },
    { ico:'node',    t:'Grow the cluster', d:'You start with one small node. Provision more — generic (flexible) or special (dense) — and tag them as you go.' },
    { ico:'check',   t:'Get it validated', d:'Hit Mark done — the system grades the live cluster against the criteria, like the High-Availability checklist.' },
    { ico:'tree',    t:'Automate it', d:'Buy the Dashboard, Deployments, Affinity, Auto-Rebalance and more until the cluster runs itself.' },
  ];
  return (
    <>
      <div className="overlay" />
      <div style={{ position:'fixed', inset:0, display:'grid', placeItems:'center', zIndex:95 }}>
        <div className="panel" style={{ width:700, maxWidth:'92vw', boxShadow:'var(--shadow-lg)' }}>
          <div className="panel-head" style={{ padding:'20px 24px' }}>
            <div>
              <h3 style={{ fontSize:19, fontWeight:800 }}>Welcome, Architect.</h3>
              <div className="muted" style={{ fontSize:12.5, marginTop:3 }}>You run the <b className="mono">prod-east-1</b> cluster. No terminal — just menus, forms, and drag-and-drop. You’re starting from a blank slate.</div>
            </div>
            <button className="cbtn" onClick={onClose}><Icon name="close" size={16} /></button>
          </div>
          <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {steps.map((s,i)=>(
              <div key={i} className="flex gap12" style={{ alignItems:'flex-start' }}>
                <div className="u-ico" style={{ margin:0, flex:'none', width:36, height:36, borderRadius:11, display:'grid', placeItems:'center', background:'var(--accent-soft)', color:'var(--accent)' }}><Icon name={s.ico} size={18} /></div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13.5 }}><span className="mono faint" style={{fontSize:11,marginRight:6}}>{i+1}</span>{s.t}</div>
                  <div className="muted" style={{ fontSize:11.5, lineHeight:1.45, marginTop:3 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="so-foot" style={{ borderRadius:'0 0 var(--r-lg) var(--r-lg)' }}>
            <span className="cost">Time is paused. Press <span className="kbd">space</span> to play/pause — your first ticket lands a few seconds in.</span>
            <button className="btn primary" onClick={onClose}><Icon name="arrow" size={15} /> Start the shift</button>
          </div>
        </div>
      </div>
    </>
  );
}

function App() {
  return React.createElement(GameProvider, null, React.createElement(Shell));
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
