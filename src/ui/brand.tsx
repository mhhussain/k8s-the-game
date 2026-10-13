/* ============================================================
   Brand: logo mark, wordmark, and downloadable promo art
   (pure SVG, so it scales and survives the single-file build).
   Original art: a hexagonal "cluster" with three pods. It does
   not use or imitate the official Kubernetes helm logo.
   ============================================================ */
import React from 'react';

export const GAME_TITLE = 'Kubernetes: The Game';
export const TAGLINE = 'Run prod with no terminal.';
export const SUBLINE = 'Tickets in. Uptime out.';
export const VERSION = '1.0.0';

/* the mark: rounded hexagon, three pods orbiting a control-plane dot */
export function LogoMark({ size = 36, radius = 11, className, style }: { size?: number; radius?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`logo-mark ${className ?? ''}`} style={{ width: size, height: size, borderRadius: radius, ...style }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2.2l8.5 4.9v9.8L12 21.8l-8.5-4.9V7.1z" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.3" fill="#fff" />
        <circle cx="12" cy="6.6" r="1.35" fill="#fff" opacity=".85" />
        <circle cx="16.7" cy="14.7" r="1.35" fill="#fff" opacity=".85" />
        <circle cx="7.3" cy="14.7" r="1.35" fill="#fff" opacity=".85" />
      </svg>
    </div>
  );
}

export function Wordmark({ size = 'lg' }: { size?: 'sm' | 'lg' | 'xl' }) {
  return (
    <div className={`wordmark ${size}`}>
      <span className="wm-top">Kubernetes<span className="wm-colon">:</span></span>
      <span className="wm-bottom">The Game</span>
    </div>
  );
}

/* ---------- downloadable art (SVG strings; system fonts so they render anywhere) ---------- */
const FONT = `'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `'IBM Plex Mono',Menlo,Consolas,monospace`;

function markPaths(x: number, y: number, s: number): string {
  // 24-unit glyph scaled to s, placed at x,y
  const k = s / 24;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="none">
    <path d="M12 2.2l8.5 4.9v9.8L12 21.8l-8.5-4.9V7.1z" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="2.3" fill="#fff"/>
    <circle cx="12" cy="6.6" r="1.35" fill="#fff" opacity=".85"/>
    <circle cx="16.7" cy="14.7" r="1.35" fill="#fff" opacity=".85"/>
    <circle cx="7.3" cy="14.7" r="1.35" fill="#fff" opacity=".85"/>
  </g>`;
}

export function markSvg(size = 512, accent = '#4C6EF5', accentDim = '#3656D6'): string {
  const r = size * 0.28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accentDim}"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  ${markPaths(size * 0.19, size * 0.19, size * 0.62)}
</svg>`;
}

export function wordmarkSvg(dark = false): string {
  const ink = dark ? '#FFFFFF' : '#211E1A';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="240" viewBox="0 0 980 240">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C6EF5"/><stop offset="1" stop-color="#3656D6"/></linearGradient></defs>
  <rect x="20" y="20" width="200" height="200" rx="56" fill="url(#g)"/>
  ${markPaths(58, 58, 124)}
  <text x="262" y="118" font-family="${FONT}" font-weight="800" font-size="92" letter-spacing="-2.5" fill="${ink}">Kubernetes<tspan fill="#4C6EF5">:</tspan></text>
  <text x="266" y="200" font-family="${FONT}" font-weight="800" font-size="70" letter-spacing="-1.5" fill="#4C6EF5">The Game</text>
</svg>`;
}

/* 1200×630 social / store card */
export function socialCardSvg(): string {
  const leds = ['#16A34A', '#16A34A', '#16A34A', '#C9780A', '#16A34A', '#DC3F32', '#16A34A', '#6366F1', '#16A34A', '#16A34A', '#16A34A', '#C9780A'];
  const nodes = leds.map((c, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 700 + col * 118, y = 150 + row * 118;
    return `<g transform="translate(${x} ${y})">
      <rect width="100" height="100" rx="20" fill="#FFFFFF" stroke="#E7E3DB" stroke-width="2"/>
      <rect x="14" y="16" width="44" height="8" rx="4" fill="#E7E3DB"/>
      <circle cx="80" cy="20" r="7" fill="${c}"/>
      <rect x="14" y="44" width="15" height="15" rx="4" fill="#4C6EF5"/><rect x="33" y="44" width="15" height="15" rx="4" fill="#4C6EF5"/>
      <rect x="52" y="44" width="15" height="15" rx="4" fill="${i % 3 ? '#4C6EF5' : '#F0EEE8'}"/><rect x="71" y="44" width="15" height="15" rx="4" fill="#F0EEE8"/>
      <rect x="14" y="70" width="60" height="8" rx="4" fill="#EEEBE3"/>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBFAF8"/><stop offset="1" stop-color="#E9EDFE"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C6EF5"/><stop offset="1" stop-color="#3656D6"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${nodes}
  <rect x="72" y="92" width="112" height="112" rx="32" fill="url(#g)"/>
  ${markPaths(93, 93, 70)}
  <text x="72" y="300" font-family="${FONT}" font-weight="800" font-size="78" letter-spacing="-2" fill="#211E1A">Kubernetes<tspan fill="#4C6EF5">:</tspan></text>
  <text x="74" y="378" font-family="${FONT}" font-weight="800" font-size="64" letter-spacing="-1.5" fill="#4C6EF5">The Game</text>
  <text x="74" y="446" font-family="${FONT}" font-weight="600" font-size="30" fill="#6B6459">Run prod with no terminal.</text>
  <text x="74" y="488" font-family="${FONT}" font-weight="600" font-size="30" fill="#6B6459">Tickets in. Uptime out.</text>
  <rect x="72" y="532" width="318" height="50" rx="25" fill="#4C6EF5"/>
  <text x="231" y="564" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="20" fill="#FFFFFF">FREE · PLAY IN BROWSER</text>
</svg>`;
}

/* ---------- downloads ---------- */
export function downloadText(filename: string, text: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* rasterise an SVG string to PNG (for platforms that refuse SVG) */
export async function downloadSvgAsPng(filename: string, svg: string, width: number, height: number) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('render failed')); img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);
  const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('encode failed');
  const out = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = out; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(out), 1000);
}

export const svgDataUri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
