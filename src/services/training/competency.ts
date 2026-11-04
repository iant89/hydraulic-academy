import type { Progress, TrainingRecord } from './records';
import { LESSONS } from '@/data/lessons/curriculum';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
}

export function achievements(records: TrainingRecord[], progress: Progress): Achievement[] {
  const scen = records.filter((r) => r.type === 'scenario');
  const passed = scen.filter((r) => r.passed);
  const safe = scen.filter((r) => r.categories?.find((c) => c.id === 'safety')?.score === 1);
  return [
    { id: 'first-lesson', title: 'First principles', description: 'Complete your first lesson.', earned: progress.completedLessons.length > 0 },
    { id: 'level1', title: 'Fundamentals complete', description: 'Complete every Level 1 lesson.', earned: LESSONS.filter((l) => l.level === 1).every((l) => progress.completedLessons.includes(l.id)) },
    { id: 'builder', title: 'Circuit builder', description: 'Complete 4 circuit-building exercises.', earned: progress.completedExercises.filter((e) => e.startsWith('ex')).length >= 4 },
    { id: 'experimenter', title: 'Experimenter', description: 'Record conclusions for 3 playground experiments.', earned: progress.completedExperiments.length >= 3 },
    { id: 'first-diag', title: 'First diagnosis', description: 'Pass a diagnostic scenario.', earned: passed.length >= 1 },
    { id: 'safe-hands', title: 'Safe hands', description: 'Complete 3 scenarios with no safety violations.', earned: safe.length >= 3 },
    { id: 'verified', title: 'Proven repair', description: 'Score 100 % on repair verification.', earned: scen.some((r) => r.categories?.find((c) => c.id === 'verification')?.score === 1) },
    { id: 'master', title: 'Master technician', description: 'Pass a Master Technician scenario.', earned: passed.some((r) => r.mode === 'master') },
  ];
}

export const CATEGORY_LESSONS: Record<string, string[]> = {
  identification: ['l6-strategy', 'l1-pressure-flow'],
  tests: ['l6-strategy', 'l2-pumps'],
  sequence: ['l6-strategy'],
  replacement: ['l5-replace'],
  efficiency: ['l6-strategy'],
  safety: ['l5-safety', 'l4-inspection'],
  verification: ['l5-adjust'],
};

export interface Competency {
  id: string;
  label: string;
  average: number | null;
  samples: number;
}

export function competencies(records: TrainingRecord[]): Competency[] {
  const labels: Record<string, string> = { identification: 'Diagnostic accuracy', tests: 'Test selection & measurement', sequence: 'Diagnostic sequence', replacement: 'Parts replacement discipline', efficiency: 'Test efficiency', safety: 'Safety procedures', verification: 'Repair verification' };
  return Object.entries(labels).map(([id, label]) => {
    const vals = records.flatMap((r) => r.categories?.filter((c) => c.id === id).map((c) => c.score) ?? []);
    return { id, label, samples: vals.length, average: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
}

export function weakAreas(records: TrainingRecord[]) {
  return competencies(records)
    .filter((c) => c.average !== null && c.average < 0.75)
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0));
}
