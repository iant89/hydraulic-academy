import { create } from 'zustand';
import type { UnitSystem } from '@/simulation/core/units';
import { prefsStorage } from '@/services/persistence/db';
import type { TrainingMode } from '@/simulation/scenarios/types';

interface PrefsState {
  units: UnitSystem;
  technician: string;
  reducedMotion: boolean;
  defaultMode: TrainingMode;
  showHints: boolean;
  /** Authorised profile editing (instructor / administrator). */
  editorEnabled: boolean;
  set(p: Partial<Omit<PrefsState, 'set'>>): void;
}

const saved = prefsStorage.read<Partial<PrefsState>>('prefs', {});

export const usePrefs = create<PrefsState>((set) => ({
  units: 'metric',
  technician: 'Technician',
  reducedMotion: false,
  defaultMode: 'practical',
  showHints: true,
  editorEnabled: false,
  ...saved,
  set(p) {
    set(p);
    const { units, technician, reducedMotion, defaultMode, showHints, editorEnabled } = { ...usePrefs.getState(), ...p };
    prefsStorage.write('prefs', { units, technician, reducedMotion, defaultMode, showHints, editorEnabled });
  },
}));
