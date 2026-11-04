import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { LESSONS, LEVELS } from '@/data/lessons/curriculum';
import { useTraining } from '@/stores/training';
import { usePrefs } from '@/stores/prefs';
import { newId } from '@/services/training/records';
import { href, type Route } from '@/app/router';
import { Badge, Button, Callout, Meter, Panel } from '@/components/ui';
import p from '../shared/page.module.css';

export function levelProgress(level: number, completed: string[]) {
  const ls = LESSONS.filter((l) => l.level === level);
  return ls.length ? ls.filter((l) => completed.includes(l.id)).length / ls.length : 0;
}

export function unlockedLevel(completed: string[]) {
  let lvl = 1;
  for (const L of LEVELS) {
    if (L.level === 1) continue;
    if (levelProgress(L.level - 1, completed) >= 0.6) lvl = L.level;
    else break;
  }
  return lvl;
}

export default function LearningPage({ route }: { route: Route }) {
  const { progress } = useTraining();
  const editor = usePrefs((s) => s.editorEnabled);
  const [id, setIdState] = useState<string | null>(route.path[1] ?? null);
  useEffect(() => setIdState(route.path[1] ?? null), [route.path]);
  const setId = (v: string | null) => {
    setIdState(v);
    window.history.replaceState(null, '', v ? `#/learning/${v}` : '#/learning');
  };
  const lesson = LESSONS.find((l) => l.id === id);
  const unlocked = editor ? 6 : unlockedLevel(progress.completedLessons);
  if (lesson) return <LessonView key={lesson.id} lessonId={lesson.id} onBack={() => setId(null)} onOpen={setId} />;
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Learning Center</h1>
          <p>A structured path from fundamentals to master-level diagnostics. Each lesson links to hands-on labs, equipment operation or diagnostic scenarios, and ends with a knowledge check. Complete 60 % of a level to unlock the next.</p>
        </div>
      </div>
      {LEVELS.map((L) => {
        const prog = levelProgress(L.level, progress.completedLessons);
        const locked = L.level > unlocked;
        return (
          <Panel key={L.level} title={`Level ${L.level} — ${L.title}`} actions={locked ? <Badge><Lock size={11} /> locked</Badge> : <Badge tone={prog === 1 ? 'ok' : 'accent'}>{Math.round(prog * 100)} %</Badge>}>
            <p className={p.small}>{L.summary}</p>
            <Meter value={prog} />
            <div className={p.cols3} style={{ marginTop: 10 }}>
              {LESSONS.filter((l) => l.level === L.level).map((l) => {
                const done = progress.completedLessons.includes(l.id);
                return (
                  <button key={l.id} className={p.item} disabled={locked} style={{ opacity: locked ? 0.5 : 1 }} onClick={() => setId(l.id)}>
                    <div className={p.itemTitle}>
                      {done ? <CheckCircle2 size={14} color="var(--ok)" /> : <BookOpen size={14} />} {l.title}
                    </div>
                    <div className={p.itemSub}>
                      {l.minutes} min · {l.activities.length} activities · {l.quiz.length} questions {progress.quizScores[l.id] !== undefined && `· quiz ${progress.quizScores[l.id]} %`}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function LessonView({ lessonId, onBack, onOpen }: { lessonId: string; onBack(): void; onOpen(id: string): void }) {
  const l = LESSONS.find((x) => x.id === lessonId)!;
  const { progress, updateProgress, addRecord } = useTraining();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = Math.round((l.quiz.filter((q, i) => answers[i] === q.answer).length / l.quiz.length) * 100);
  const submit = async () => {
    setSubmitted(true);
    const pass = score >= 70;
    await updateProgress((pr) => ({ ...pr, quizScores: { ...pr.quizScores, [l.id]: Math.max(score, pr.quizScores[l.id] ?? 0) }, completedLessons: pass && !pr.completedLessons.includes(l.id) ? [...pr.completedLessons, l.id] : pr.completedLessons }));
    await addRecord({ id: newId('quiz'), type: 'quiz', refId: l.id, title: `Knowledge check – ${l.title}`, date: new Date().toISOString(), score, passed: pass, mistakes: l.quiz.filter((q, i) => answers[i] !== q.answer).map((q) => q.q) });
  };
  const idx = LESSONS.findIndex((x) => x.id === l.id);
  const next = LESSONS[idx + 1];
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <div className={p.row}>
            <Badge tone="accent">Level {l.level}</Badge>
            {progress.completedLessons.includes(l.id) && <Badge tone="ok">completed</Badge>}
          </div>
          <h1 style={{ marginTop: 4 }}>{l.title}</h1>
        </div>
        <Button onClick={onBack}>All lessons</Button>
      </div>
      <div className={p.split}>
        <div className={p.stack}>
          <Panel title="Lesson">
            <div className={p.prose}>
              <h3>Learning objectives</h3>
              <ul>{l.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
              {l.sections.map((s) => (
                <section key={s.heading}>
                  <h2>{s.heading}</h2>
                  {s.body.map((b) => <p key={b}>{b}</p>)}
                  {s.formula && <div className={p.formula}>{s.formula}</div>}
                  {s.callout && <Callout tone={s.callout.tone}>{s.callout.text}</Callout>}
                </section>
              ))}
            </div>
          </Panel>
          <Panel title="Knowledge check">
            <div className={p.list}>
              {l.quiz.map((q, i) => (
                <div key={q.q}>
                  <p style={{ marginBottom: 4 }}>
                    <strong>{i + 1}.</strong> {q.q}
                  </p>
                  <div className={p.row}>
                    {q.options.map((o, k) => (
                      <Button key={o} size="sm" active={answers[i] === k} onClick={() => !submitted && setAnswers({ ...answers, [i]: k })}>
                        {o}
                      </Button>
                    ))}
                  </div>
                  {submitted && <div style={{ marginTop: 4 }}><Callout tone={answers[i] === q.answer ? 'ok' : 'warn'}>{answers[i] === q.answer ? 'Correct. ' : `Answer: ${q.options[q.answer]}. `}{q.why}</Callout></div>}
                </div>
              ))}
              {!submitted ? (
                <Button variant="primary" disabled={Object.keys(answers).length < l.quiz.length} onClick={submit}>
                  Submit answers
                </Button>
              ) : (
                <div className={p.row}>
                  <Badge tone={score >= 70 ? 'ok' : 'warn'}>Score {score} %</Badge>
                  <span className={p.small}>{score >= 70 ? 'Lesson complete.' : 'Review the lesson and try again (70 % to pass).'}</span>
                  <Button size="sm" onClick={() => { setAnswers({}); setSubmitted(false); }}>Retry</Button>
                </div>
              )}
            </div>
          </Panel>
        </div>
        <div className={p.stack}>
          <Panel title="Practical activities">
            <div className={p.list}>
              {l.activities.map((a) => (
                <a key={a.label} href={href(a.href)} className={p.item} style={{ textDecoration: 'none' }}>
                  <div className={p.itemTitle}>
                    <ArrowRight size={13} /> {a.label}
                  </div>
                </a>
              ))}
            </div>
          </Panel>
          {next && (
            <Panel title="Next lesson">
              <Button onClick={() => onOpen(next.id)}>
                {next.title} <ArrowRight size={13} />
              </Button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
