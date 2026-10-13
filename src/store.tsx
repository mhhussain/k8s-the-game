/* ============================================================
   Game store — React binding for the pure engine.
   Provides {state, dispatch, settings, setSettings, save api}.
   ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CONFIG, reducer, seedState, AUTOSAVE_KEY, SLOT_KEYS, saveToSlot, loadFromSlot, deleteSlot, slotMeta,
  exportJson, importJson, loadSettings, saveSettings, migrateLegacyKeys,
  type Action, type GameState, type UiSettings, type SaveMeta,
} from './engine';

export interface SaveApi {
  slots: (SaveMeta | null)[];
  refresh(): void;
  saveSlot(i: number, label?: string): boolean;
  loadSlot(i: number): boolean;
  deleteSlot(i: number): void;
  hasAutosave(): boolean;
  loadAutosave(): boolean;
  exportFile(): void;
  importFile(file: File): Promise<void>;
  newGame(seed?: number): void;
}

interface Ctx {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  settings: UiSettings;
  setSettings(patch: Partial<UiSettings>): void;
  save: SaveApi;
}
const GameCtx = createContext<Ctx | null>(null);

function initialState(): GameState {
  migrateLegacyKeys();
  // resume the autosave if there is one; otherwise a fresh blank-slate game
  const auto = loadFromSlot(AUTOSAVE_KEY);
  return auto ?? seedState();
}

export function GameProvider({ children, initial }: { children: React.ReactNode; initial?: GameState }) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => i ?? initialState());
  const [settings, setSettingsState] = useState<UiSettings>(() => loadSettings());
  const [slotsVersion, setSlotsVersion] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const setSettings = useCallback((patch: Partial<UiSettings>) => {
    setSettingsState(prev => { const next = { ...prev, ...patch }; saveSettings(next); return next; });
  }, []);

  /* game clock */
  useEffect(() => {
    if (state.clock.paused) return;
    const interval = CONFIG.TICK_MS / state.clock.speed;
    const id = window.setInterval(() => { dispatch({ type: 'TICK' }); dispatch({ type: 'BUILD_TICK' }); }, interval);
    return () => window.clearInterval(id);
  }, [state.clock.paused, state.clock.speed]);

  /* autosave every N ticks and whenever the game pauses */
  const lastAutosaveTick = useRef(-1);
  useEffect(() => {
    if (!settings.autosave) return;
    const t = state.clock.tick;
    if (t === lastAutosaveTick.current) return;
    if (t % CONFIG.AUTOSAVE_EVERY === 0 || state.clock.paused) {
      lastAutosaveTick.current = t;
      saveToSlot(AUTOSAVE_KEY, state, 'Autosave');
    }
  }, [state.clock.tick, state.clock.paused, settings.autosave, state]);

  /* also autosave on tab hide / unload */
  useEffect(() => {
    if (!settings.autosave) return;
    const flush = () => saveToSlot(AUTOSAVE_KEY, stateRef.current, 'Autosave');
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', onHide); };
  }, [settings.autosave]);

  const save = useMemo<SaveApi>(() => ({
    get slots() { void slotsVersion; return SLOT_KEYS.map(k => slotMeta(k)); },
    refresh: () => setSlotsVersion(v => v + 1),
    saveSlot: (i, label) => { const ok = saveToSlot(SLOT_KEYS[i], stateRef.current, label ?? `Slot ${i + 1}`); setSlotsVersion(v => v + 1); return ok; },
    loadSlot: (i) => { const s = loadFromSlot(SLOT_KEYS[i]); if (!s) return false; dispatch({ type: 'LOAD_STATE', state: s }); return true; },
    deleteSlot: (i) => { deleteSlot(SLOT_KEYS[i]); setSlotsVersion(v => v + 1); },
    hasAutosave: () => !!slotMeta(AUTOSAVE_KEY),
    loadAutosave: () => { const s = loadFromSlot(AUTOSAVE_KEY); if (!s) return false; dispatch({ type: 'LOAD_STATE', state: s }); return true; },
    exportFile: () => {
      const s = stateRef.current;
      const day = Math.floor(s.clock.tick / CONFIG.TICKS_PER_DAY) + 1;
      const blob = new Blob([exportJson(s, `Day ${day}`)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `kubernetes-the-game-day${day}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    importFile: async (file) => {
      const text = await file.text();
      const s = importJson(text);
      dispatch({ type: 'LOAD_STATE', state: s });
    },
    newGame: (seed) => { dispatch({ type: 'NEW_GAME', seed }); },
  }), [slotsVersion]);

  const value = useMemo(() => ({ state, dispatch, settings, setSettings, save }), [state, settings, setSettings, save]);
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const ctx = useContext(GameCtx);
  if (!ctx) throw new Error('useGame outside GameProvider');
  return ctx;
}
