/* ============================================================
   CLUSTER — App shell, router, intro, tweaks
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#4f93ff",
  "boardView": "table",
  "drama": 0.6,
  "tone": "witty"
}/*EDITMODE-END*/;

function Shell() {
  const { state, dispatch } = useGame();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [intro, setIntro] = useState(() => !localStorage.getItem('cluster_seen_intro'));

  // apply visual tweaks
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-glow', `color-mix(in srgb, ${t.accent} 30%, transparent)`);
    r.setProperty('--accent-dim', `color-mix(in srgb, ${t.accent} 55%, #0d1117)`);
  }, [t.accent]);
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

  const closeIntro = () => { localStorage.setItem('cluster_seen_intro','1'); setIntro(false); };

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

      <TweaksPanel>
        <TweakSection label="Status board" />
        <TweakRadio label="Default layout" value={t.boardView}
          options={['table','grid','cards']} onChange={v=>setTweak('boardView', v)} />
        <TweakSection label="Alarm intensity" />
        <TweakSlider label="Drift drama" value={t.drama} min={0} max={1} step={0.1}
          onChange={v=>setTweak('drama', v)} />
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent}
          options={['#4f93ff','#39c2d7','#28d17c','#7c8cff','#e08a3c']}
          onChange={v=>setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

/* ---------- Intro: the core loop ---------- */
function Intro({ onClose, dispatch }) {
  const steps = [
    { ico:'tickets', t:'Read a ticket', d:'Work arrives on the board. Each lists acceptance criteria — and hints at what they didn\'t say.' },
    { ico:'box',     t:'Build an image', d:'Drag a Repo onto the Registry to build a container.' },
    { ico:'bolt',    t:'Author a service', d:'Pick the image, set replicas, choose a node. Deploy.' },
    { ico:'check',   t:'Get it validated', d:'Hit Mark done — the system grades the live cluster against the criteria.' },
    { ico:'alert',   t:'Respond to incidents', d:'You\'re flying semi-blind. Trouble arrives as bug tickets — fix and resolve them.' },
    { ico:'tree',    t:'Automate it', d:'Buy the Service Dashboard, Deployments, CI, nodes & affinity until the cluster runs itself.' },
  ];
  return (
    <>
      <div className="overlay" />
      <div style={{ position:'fixed', inset:0, display:'grid', placeItems:'center', zIndex:95 }}>
        <div className="panel" style={{ width:680, maxWidth:'92vw', boxShadow:'var(--shadow-lg)' }}>
          <div className="panel-head" style={{ padding:'18px 22px' }}>
            <div>
              <h3 style={{ fontSize:18 }}>Welcome, Architect.</h3>
              <div className="muted" style={{ fontSize:12.5, marginTop:3 }}>You run the <b className="mono">prod-east-1</b> cluster. No terminal — just menus, forms, and drag-and-drop.</div>
            </div>
            <button className="cbtn" onClick={onClose}><Icon name="close" size={16} /></button>
          </div>
          <div style={{ padding:'18px 22px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {steps.map((s,i)=>(
              <div key={i} className="flex gap12" style={{ alignItems:'flex-start' }}>
                <div className="u-ico" style={{ margin:0, flex:'none', width:34, height:34 }}><Icon name={s.ico} size={18} /></div>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}><span className="mono faint" style={{fontSize:11,marginRight:6}}>{i+1}</span>{s.t}</div>
                  <div className="muted" style={{ fontSize:11.5, lineHeight:1.45, marginTop:2 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="so-foot" style={{ borderRadius:'0 0 12px 12px' }}>
            <span className="cost">Time is paused. Press <span className="kbd">space</span> to play/pause anytime.</span>
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
