import type { Progress, TrainingRecord } from '@/services/training/records';
import { LESSONS } from './lessons/curriculum';

export interface Requirement {
  label: string;
  check(records: TrainingRecord[], progress: Progress, threshold: number): { met: boolean; detail: string };
  threshold: number;
}

export interface AssessmentDef {
  id: string;
  title: string;
  description: string;
  requirements: Requirement[];
  /** Scenario pool for the practical examination. */
  examPool?: string[];
}

const scen = (records: TrainingRecord[], mode?: string) => records.filter((r) => r.type === 'scenario' && (!mode || r.mode === mode));

export const ASSESSMENTS: AssessmentDef[] = [
  {
    id: 'a-fundamentals',
    title: 'Level 1–2 knowledge assessment',
    description: 'Hydraulic principles and component knowledge.',
    requirements: [
      { label: 'Average knowledge-check score, Levels 1–2', threshold: 75, check: (_r, p, t) => { const ids = LESSONS.filter((l) => l.level <= 2).map((l) => l.id); const s = ids.map((i) => p.quizScores[i] ?? 0); const avg = s.reduce((a, b) => a + b, 0) / s.length; return { met: avg >= t, detail: `${avg.toFixed(0)} % (need ${t} %)` }; } },
      { label: 'Fundamentals labs completed', threshold: 4, check: (_r, p, t) => { const n = p.completedExercises.filter((e) => e.startsWith('lab:')).length; return { met: n >= t, detail: `${n} / ${t}` }; } },
    ],
  },
  {
    id: 'a-circuits',
    title: 'Circuit construction practical',
    description: 'Correctly connect hydraulic circuits and identify incorrect connections.',
    requirements: [
      { label: 'Circuit exercises completed', threshold: 6, check: (_r, p, t) => { const n = p.completedExercises.filter((e) => e.startsWith('ex')).length; return { met: n >= t, detail: `${n} / ${t}` }; } },
      { label: '“Find and fix” exercise completed', threshold: 1, check: (_r, p) => ({ met: p.completedExercises.includes('ex8-fix'), detail: p.completedExercises.includes('ex8-fix') ? 'done' : 'not yet' }) },
    ],
  },
  {
    id: 'a-dumptruck',
    title: 'Dump truck hydraulic technician (training)',
    description: 'Operate, inspect, diagnose and repair Equipment Package 001.',
    examPool: ['dt-pump-low-flow', 'dt-relief-stuck-open', 'dt-restricted-suction', 'dt-cylinder-bypass', 'dt-relief-misadjusted', 'dt-pto-coupling'],
    requirements: [
      { label: 'Normal-operation baseline completed', threshold: 1, check: (r) => { const ok = r.some((x) => x.type === 'scenario' && x.refId === 'dt-normal' && x.passed); return { met: ok, detail: ok ? 'passed' : 'not yet' }; } },
      { label: 'Practical scenarios passed', threshold: 3, check: (r, _p, t) => { const n = new Set(scen(r, 'practical').filter((x) => x.passed).map((x) => x.refId)).size; return { met: n >= t, detail: `${n} / ${t}` }; } },
      { label: 'Diagnostic challenge passed', threshold: 1, check: (r, _p, t) => { const n = scen(r, 'challenge').filter((x) => x.passed).length; return { met: n >= t, detail: `${n} / ${t}` }; } },
      { label: 'Structured inspection with no missed defects', threshold: 1, check: (r) => { const ok = r.some((x) => x.refId === 'inspection' && x.passed); return { met: ok, detail: ok ? 'passed' : 'not yet' }; } },
      { label: 'Minimum safety score across scenarios (%)', threshold: 100, check: (r, _p, t) => { const s = scen(r).map((x) => (x.categories?.find((c) => c.id === 'safety')?.score ?? 1) * 100); const min = s.length ? Math.min(...s) : 0; return { met: s.length > 0 && min >= t, detail: s.length ? `lowest ${min.toFixed(0)} %` : 'no scenarios yet' }; } },
    ],
  },
  {
    id: 'a-master',
    title: 'Master technician diagnostics',
    description: 'Multiple simultaneous and intermittent faults.',
    examPool: ['dt-multi-pump-suction', 'dt-multi-relief-cylinder', 'dt-multi-intermittent', 'dt-multi-filter-valve'],
    requirements: [{ label: 'Master scenarios passed', threshold: 2, check: (r, _p, t) => { const n = new Set(scen(r, 'master').filter((x) => x.passed).map((x) => x.refId)).size; return { met: n >= t, detail: `${n} / ${t}` }; } }],
  },
];
