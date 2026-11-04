import { create } from 'zustand';
import { EMPTY_PROGRESS, recordsRepo, type Progress, type TrainingRecord } from '@/services/training/records';

interface TrainingState {
  loaded: boolean;
  records: TrainingRecord[];
  progress: Progress;
  load(): Promise<void>;
  addRecord(r: TrainingRecord): Promise<void>;
  updateProgress(fn: (p: Progress) => Progress): Promise<void>;
  reset(): Promise<void>;
}

export const useTraining = create<TrainingState>((set, get) => ({
  loaded: false,
  records: [],
  progress: EMPTY_PROGRESS,
  async load() {
    const [records, progress] = await Promise.all([recordsRepo.all(), recordsRepo.progress()]);
    set({ records, progress, loaded: true });
  },
  async addRecord(r) {
    await recordsRepo.add(r);
    set({ records: [r, ...get().records] });
  },
  async updateProgress(fn) {
    const p = fn(structuredClone(get().progress));
    await recordsRepo.saveProgress(p);
    set({ progress: p });
  },
  async reset() {
    await recordsRepo.clear();
    await recordsRepo.saveProgress(EMPTY_PROGRESS);
    set({ records: [], progress: EMPTY_PROGRESS });
  },
}));
