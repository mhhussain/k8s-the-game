/* Last line of defence: if anything throws while rendering, show a recovery
   screen instead of a blank page, and let the player rescue their run. */
import React from 'react';
import { AUTOSAVE_KEY, deleteSlot } from '../engine';

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }

  private downloadAutosave = () => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'kubernetes-the-game-rescue.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* storage blocked */ }
  };
  private reset = () => { deleteSlot(AUTOSAVE_KEY); window.location.reload(); };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="modal" style={{ width: 520 }}>
          <div className="outcome lost">
            <h2>The cluster hit a kernel panic</h2>
            <p>Something in the game crashed. Your autosave is untouched. Try reloading first. If it keeps happening, download the autosave as a rescue file and start fresh.</p>
            <pre className="crash-msg">{String(this.state.error.message || this.state.error)}</pre>
            <div className="flex gap8" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={() => window.location.reload()}>Reload</button>
              <button type="button" className="btn ghost" onClick={this.downloadAutosave}>Download autosave</button>
              <button type="button" className="btn danger" onClick={this.reset}>Start fresh</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
