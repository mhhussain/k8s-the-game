/* ============================================================
   Promotional material, in the app:
   · TitleScreen — animated attract screen shown on every launch
   · PressKit    — fact sheet, copy, features, screenshots, art
   ============================================================ */
import React, { useEffect, useState } from 'react';
import { CONFIG, money } from '../engine';
import { useGame } from '../store';
import { Icon } from './primitives';
import { ModalFrame } from './modal';
import {
  GAME_TITLE, TAGLINE, SUBLINE, VERSION, LogoMark, Wordmark,
  markSvg, wordmarkSvg, socialCardSvg, svgDataUri, downloadText, downloadSvgAsPng,
} from './brand';
import shotBoard from '../assets/promo/shot-board.jpg';
import shotCluster from '../assets/promo/shot-cluster.jpg';
import shotForm from '../assets/promo/shot-form.jpg';
import shotTree from '../assets/promo/shot-tree.jpg';

export const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: 'tickets', title: 'Read between the lines', body: '“It cannot blink.” “Where the auditors expect it.” Stakeholders speak vibes; you translate them into replicas, nodes and tags.' },
  { icon: 'box',     title: 'Build, deploy, scale',    body: 'Drag a repo onto the Registry, author a service, spread pods across nodes. No YAML. No terminal. Just menus.' },
  { icon: 'check',   title: 'Graded on the live cluster', body: 'Mark a ticket done and the engine checks the real state. Resolve it, then break it, and the regression comes back for you.' },
  { icon: 'wifi_off',title: 'Chaos that teaches',      body: 'Nodes go dark. Flash sales triple traffic. Bare Pods stay dead; Deployments heal. High availability is earned, not assumed.' },
  { icon: 'tree',    title: 'Automate the grind',      body: 'A 12-upgrade tech tree: CI, Rolling Updates, Dashboards, Affinity, Autoscaling, Auto-Rebalance. Make prod run itself.' },
  { icon: 'save',    title: 'Yours to keep',           body: 'Runs in any browser, no account, no server. Autosave, three slots, and JSON export to carry a run between machines.' },
];

export const SHOTS = [
  { src: shotBoard,   caption: 'The ticket board: vague asks, concrete acceptance criteria.' },
  { src: shotCluster, caption: 'Infrastructure: nodes, pod slots, live health once you buy the dashboard.' },
  { src: shotForm,    caption: 'Author a service: replicas, workload type, placement. No YAML.' },
  { src: shotTree,    caption: 'The upgrade tree: automate your way out of the pager.' },
];

export const COPY = {
  short: `${GAME_TITLE} is a cozy-chaotic management sim where you run a production cluster with no terminal: work tickets, ship services, survive outages, automate everything.`,
  long: `You are the new architect of prod-east-1, and you start with one small node and an empty registry. Stakeholders file tickets in their own dialect (“it cannot blink”, “sale days get rough”), and every one of them is graded against the live state of your cluster. Build images, author services, spread replicas across nodes, tag hardware and keep the budget above water while flash sales spike traffic and nodes drop offline. Bare Pods die and stay dead; Deployments heal. Spend what you earn on a tech tree that automates the grind, from CI and rolling updates to autoscaling and self-healing, until the cluster finally runs itself. Everything happens in menus, forms and drag-and-drop. It runs entirely in your browser, with autosave and portable save files.`,
  social: [
    `I just survived a node outage without a single pod going down. No terminal. Just vibes and replicas. ${GAME_TITLE} 🎮`,
    `“It cannot blink.” → Deployment, ≥2 replicas, spread across ≥2 nodes. ${GAME_TITLE} teaches the job by making you do it.`,
    `Tickets in. Uptime out. ${GAME_TITLE}: a free browser sim about running prod. No YAML was harmed.`,
  ],
};

const FACTS: [string, string][] = [
  ['Title', GAME_TITLE],
  ['Genre', 'Management sim · light puzzle'],
  ['Platform', 'Any modern browser (desktop)'],
  ['Price', 'Free'],
  ['Session', '30–45 min to finish the campaign, endless after'],
  ['Saves', 'Autosave · 3 slots · JSON export'],
  ['Install', 'None. One HTML file, no server'],
  ['Version', VERSION],
];

/* ============================================================
   TITLE SCREEN
   ============================================================ */
export function TitleScreen({ onPlay, onNewGame, onLoad, onHelp, onPress }: {
  onPlay: () => void; onNewGame: () => void; onLoad: () => void; onHelp: () => void; onPress: () => void;
}) {
  const { state } = useGame();
  const [feat, setFeat] = useState(0);
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => { const id = window.setInterval(() => setFeat(f => (f + 1) % FEATURES.length), 3600); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (!confirmNew) return; const id = window.setTimeout(() => setConfirmNew(false), 3500); return () => window.clearTimeout(id); }, [confirmNew]);

  const inProgress = state.clock.tick > 0 || state.services.length > 0;
  const day = Math.floor(state.clock.tick / CONFIG.TICKS_PER_DAY) + 1;
  const f = FEATURES[feat];

  return (
    <div className="title-screen" role="dialog" aria-label={GAME_TITLE}>
      <ClusterBackdrop />
      <div className="ts-inner">
        <div className="ts-left">
          <LogoMark size={76} radius={22} className="ts-mark" />
          <Wordmark size="xl" />
          <p className="ts-tagline">{TAGLINE} <span>{SUBLINE}</span></p>
          <p className="ts-blurb">Work tickets, build images, deploy services, survive outages and buy automation until <b className="mono">prod-east-1</b> runs itself. All menus. Zero YAML.</p>

          <div className="ts-actions">
            {inProgress ? (
              <>
                <button type="button" className="btn primary ts-big" onClick={onPlay} autoFocus>
                  <Icon name="play" size={16} /> Continue <span className="ts-meta">Day {day} · {money(state.meters.budget)}</span>
                </button>
                <button type="button" className={`btn ${confirmNew ? 'danger' : 'ghost'}`} onClick={() => confirmNew ? onNewGame() : setConfirmNew(true)}>
                  <Icon name="plus" size={15} /> {confirmNew ? 'Overwrite current run?' : 'New game'}
                </button>
              </>
            ) : (
              <button type="button" className="btn primary ts-big" onClick={onNewGame} autoFocus>
                <Icon name="play" size={16} /> Play
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onLoad}><Icon name="upload" size={15} /> Load save</button>
          </div>
          <div className="ts-links">
            <button type="button" onClick={onHelp}><Icon name="help" size={14} /> How to play</button>
            <button type="button" onClick={onPress}><Icon name="spark" size={14} /> Press kit</button>
            <a href="./privacy.html" target="_blank" rel="noreferrer">Mobile privacy</a>
            <a href="./support.html" target="_blank" rel="noreferrer">Support</a>
          </div>
        </div>

        <div className="ts-right">
          <div className="ts-reel" key={feat}>
            <div className="ts-reel-ico"><Icon name={f.icon} size={26} /></div>
            <div className="ts-reel-k">Feature {feat + 1} / {FEATURES.length}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
          <div className="ts-dots">
            {FEATURES.map((_, i) => <button type="button" key={i} aria-label={`Feature ${i + 1}`} className={i === feat ? 'on' : ''} onClick={() => setFeat(i)} />)}
          </div>
        </div>
      </div>
      <div className="ts-foot">
        <span>v{VERSION} · runs entirely in your browser</span>
        <span>A fan-made game. Not affiliated with or endorsed by the CNCF or The Linux Foundation.</span>
      </div>
    </div>
  );
}

/* decorative animated cluster: node cards whose LEDs drift between states */
function ClusterBackdrop() {
  const sevs = ['ok', 'ok', 'ok', 'warn', 'ok', 'bad', 'ok', 'pending', 'ok', 'ok', 'ok', 'warn', 'ok', 'ok', 'pending', 'ok', 'ok', 'bad'];
  return (
    <div className="ts-backdrop" aria-hidden="true">
      {sevs.map((s, i) => (
        <div key={i} className="ts-node" style={{ animationDelay: `${(i * 0.37) % 4}s` }}>
          <span className="ts-node-bar" />
          <span className={`led ${s}`} style={{ animationDelay: `${(i * 0.53) % 3}s` }} />
          <span className="ts-slots">{[0, 1, 2, 3].map(k => <i key={k} className={k < 1 + (i % 4) ? 'u' : ''} />)}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   PRESS KIT
   ============================================================ */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
    }}>
      <Icon name={done ? 'check' : 'log'} size={13} /> {done ? 'Copied' : label}
    </button>
  );
}

export function PressKit({ onClose }: { onClose: () => void }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const card = socialCardSvg();
  const arts = [
    { name: 'Logo mark', file: 'kubernetes-the-game-mark', svg: markSvg(512), w: 512, h: 512, cls: 'square' },
    { name: 'Wordmark', file: 'kubernetes-the-game-wordmark', svg: wordmarkSvg(false), w: 980, h: 240, cls: 'wide' },
    { name: 'Social card 1200×630', file: 'kubernetes-the-game-card', svg: card, w: 1200, h: 630, cls: 'card' },
  ];
  return (
    <ModalFrame title="Press kit" sub="Everything you need to write about, stream or share the game." onClose={onClose} width={940}>
      <div className="pk-hero">
        <LogoMark size={64} radius={19} />
        <div>
          <Wordmark size="lg" />
          <div className="pk-tag">{TAGLINE} {SUBLINE}</div>
        </div>
      </div>

      <section className="pk-sec">
        <h4>At a glance</h4>
        <div className="pk-facts">
          {FACTS.map(([k, v]) => <div key={k} className="stat-tile"><div className="k">{k}</div><div className="v pk-fact-v">{v}</div></div>)}
        </div>
      </section>

      <section className="pk-sec">
        <div className="pk-sec-head"><h4>Short description</h4><CopyButton text={COPY.short} /></div>
        <p className="pk-p">{COPY.short}</p>
        <div className="pk-sec-head"><h4>Long description</h4><CopyButton text={COPY.long} /></div>
        <p className="pk-p">{COPY.long}</p>
      </section>

      <section className="pk-sec">
        <h4>Key features</h4>
        <div className="pk-features">
          {FEATURES.map(f => (
            <div key={f.title} className="pk-feature">
              <span className="pk-fi"><Icon name={f.icon} size={17} /></span>
              <div><b>{f.title}</b><p>{f.body}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="pk-sec">
        <h4>Screenshots</h4>
        <div className="pk-shots">
          {SHOTS.map((s, i) => (
            <figure key={i} className="pk-shot">
              <button type="button" onClick={() => setZoom(i)} aria-label={`Enlarge screenshot ${i + 1}`}><img src={s.src} alt={s.caption} loading="lazy" /></button>
              <figcaption>{s.caption} <a href={s.src} download={`kubernetes-the-game-${i + 1}.jpg`}>Download</a></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="pk-sec">
        <h4>Logos &amp; art</h4>
        <div className="pk-arts">
          {arts.map(a => (
            <div key={a.name} className={`pk-art ${a.cls}`}>
              <div className="pk-art-prev"><img src={svgDataUri(a.svg)} alt={a.name} /></div>
              <div className="pk-art-foot">
                <b>{a.name}</b>
                <span className="flex gap8">
                  <button type="button" className="btn ghost sm" onClick={() => downloadText(`${a.file}.svg`, a.svg)}><Icon name="download" size={13} /> SVG</button>
                  <button type="button" className="btn ghost sm" onClick={() => { void downloadSvgAsPng(`${a.file}.png`, a.svg, a.w, a.h).catch(() => undefined); }}><Icon name="download" size={13} /> PNG</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pk-sec">
        <h4>Ready-to-post copy</h4>
        <div className="pk-social">
          {COPY.social.map((t, i) => (
            <div key={i} className="pk-social-row"><span>{t}</span><CopyButton text={t} /></div>
          ))}
        </div>
      </section>

      <p className="pk-legal">
        {GAME_TITLE} is an independent fan project. Kubernetes® is a registered trademark of The Linux Foundation; this game is not affiliated with, sponsored or endorsed by The Linux Foundation or the Cloud Native Computing Foundation. The logo and art here are original and do not reproduce the Kubernetes logo.
      </p>

      {zoom !== null && (
        <div className="pk-lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="Screenshot">
          <img src={SHOTS[zoom].src} alt={SHOTS[zoom].caption} />
          <div className="pk-lightbox-cap">{SHOTS[zoom].caption} · click to close</div>
        </div>
      )}
    </ModalFrame>
  );
}
