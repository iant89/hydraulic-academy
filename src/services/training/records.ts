import { db } from '@/services/persistence/db';

export type RecordType = 'scenario' | 'lesson' | 'quiz' | 'assessment' | 'experiment' | 'exercise' | 'simulation' | 'repair';

export interface TrainingRecord {
  id: string;
  type: RecordType;
  refId: string;
  title: string;
  date: string;
  score?: number;
  passed?: boolean;
  durationS?: number;
  mode?: string;
  categories?: { id: string; label: string; score: number; weight: number }[];
  mistakes?: string[];
  notes?: string;
}

export interface Progress {
  completedLessons: string[];
  quizScores: Record<string, number>;
  completedExercises: string[];
  completedExperiments: string[];
  certificates: { id: string; title: string; date: string; score: number }[];
}

export const EMPTY_PROGRESS: Progress = { completedLessons: [], quizScores: {}, completedExercises: [], completedExperiments: [], certificates: [] };

export const recordsRepo = {
  async all(): Promise<TrainingRecord[]> {
    const r = await db.list<TrainingRecord>('records');
    return r.sort((a, b) => b.date.localeCompare(a.date));
  },
  async add(r: TrainingRecord) {
    await db.put('records', r.id, r);
  },
  async clear() {
    await db.clear('records');
  },
  async progress(): Promise<Progress> {
    return { ...EMPTY_PROGRESS, ...((await db.get<Progress>('progress', 'me')) ?? {}) };
  },
  async saveProgress(p: Progress) {
    await db.put('progress', 'me', p);
  },
};

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
