import { Award, BookOpen, Stethoscope, Truck, AlertTriangle } from 'lucide-react';
import { useTraining } from '@/stores/training';
import { useWorkbay } from '@/stores/workbay';
import { usePrefs } from '@/stores/prefs';
import { LESSONS, LEVELS } from '@/data/lessons/curriculum';
import { achievements, weakAreas, CATEGORY_LESSONS } from '@/services/training/competency';
import { levelProgress, unlockedLevel } from '../learning/LearningPage';
import { href } from '@/app/router';
import { Badge, Meter, Panel, Stat } from '@/components/ui';
import p from '../shared/page.module.css';

export default function DashboardPage() {
  const { records, progress } = useTraining();
  const tech = usePrefs((s) => s.technician);
  const { profile, session } = useWorkbay();
  const done = progress.completedLessons;
  const overall = done.length / LESSONS.length;
  const level = unlockedLevel(done);
  const scen = records.filter((r) => r.type === 'scenario');
  const passRate = scen.length ? scen.filter((r) => r.passed).length / scen.length : null;
  const avg = scen.length ? scen.reduce((a, r) => a + (r.score ?? 0), 0) / scen.length : null;
  const weak = weakAreas(records);
  const recommended = [
    ...weak.flatMap((w) => CATEGORY_LESSONS[w.id] ?? []),
    ...LESSONS.filter((l) => l.level <= level && !done.includes(l.id)).map((l) => l.id),
  ].filter((v, i, a) => a.indexOf(v) === i && !done.includes(v)).slice(0, 4);
  const mistakes = records.flatMap((r) => (r.mistakes ?? []).map((m) => ({ m, title: r.title, date: r.date }))).slice(0, 6);
  const ach = achievements(records, progress);
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Welcome, {tech}</h1>
          <p>Current learning level: Level {level} – {LEVELS[level - 1]?.title}. Work bay: {profile.name}{session ? ` (scenario: ${session.brief.title})` : ''}.</p>
        </div>
      </div>
      <div className={p.cols4}>
        <Panel title="Overall progress">
          <Stat label="Lessons" value={`${done.length} / ${LESSONS.length}`} />
          <Meter value={overall} />
        </Panel>
        <Panel title="Diagnostic performance">
          <Stat label="Average score" value={avg === null ? '—' : avg.toFixed(0)} sub={passRate === null ? 'No sessions yet' : `${Math.round(passRate * 100)} % pass rate · ${scen.length} sessions`} />
        </Panel>
        <Panel title="Practical assessments">
          <Stat label="Completion records" value={progress.certificates.length} sub={progress.certificates.map((c) => c.title).join(', ') || 'None issued yet'} />
        </Panel>
        <Panel title="Exercises">
          <Stat label="Circuits / labs / experiments" value={`${progress.completedExercises.filter((e) => e.startsWith('ex')).length} / ${progress.completedExercises.filter((e) => e.startsWith('lab:')).length} / ${progress.completedExperiments.length}`} />
        </Panel>
      </div>
      <div className={p.cols3}>
        <Panel title="Courses" icon={<BookOpen size={14} />}>
          <div className={p.list}>
            {LEVELS.map((L) => {
              const pr = levelProgress(L.level, done);
              return (
                <a key={L.level} href={href('learning')} className={p.item} style={{ textDecoration: 'none', opacity: L.level > level ? 0.5 : 1 }}>
                  <div className={p.itemTitle}>
                    Level {L.level}: {L.title} {pr === 1 ? <Badge tone="ok">completed</Badge> : L.level > level ? <Badge>locked</Badge> : <Badge tone="accent">available</Badge>}
                  </div>
                  <Meter value={pr} />
                </a>
              );
            })}
          </div>
        </Panel>
        <Panel title="Recommended next" icon={<Stethoscope size={14} />}>
          <div className={p.list}>
            {recommended.map((id) => {
              const l = LESSONS.find((x) => x.id === id)!;
              return (
                <a key={id} href={href(`learning/${id}`)} className={p.item} style={{ textDecoration: 'none' }}>
                  <div className={p.itemTitle}>{l.title}</div>
                  <div className={p.itemSub}>Level {l.level} · {l.minutes} min{weak.some((w) => (CATEGORY_LESSONS[w.id] ?? []).includes(id)) ? ' · addresses a weak area' : ''}</div>
                </a>
              );
            })}
            <a href={href('diagnostics')} className={p.item} style={{ textDecoration: 'none' }}>
              <div className={p.itemTitle}>Diagnostic Center – practise a scenario</div>
            </a>
          </div>
        </Panel>
        <Panel title="Recent mistakes" icon={<AlertTriangle size={14} />}>
          {mistakes.length === 0 ? (
            <div className={p.small}>Nothing recorded yet.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: 'var(--text-2)' }}>
              {mistakes.map((x, i) => (
                <li key={i}>
                  {x.m} <span className={p.small}>({x.title})</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className={p.cols2}>
        <Panel title="Achievements" icon={<Award size={14} />}>
          <div className={p.cols2}>
            {ach.map((a) => (
              <div key={a.id} style={{ opacity: a.earned ? 1 : 0.45, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Award size={16} color={a.earned ? 'var(--accent)' : 'var(--muted)'} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                  <div className={p.small}>{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent equipment simulations" icon={<Truck size={14} />}>
          {scen.length === 0 ? (
            <div className={p.small}>
              No diagnostic sessions yet. Open the <a href={href('simulator')}>Equipment Simulator</a> to operate the dump truck.
            </div>
          ) : (
            <div className={p.list}>
              {scen.slice(0, 5).map((r) => (
                <div key={r.id} className={p.row} style={{ justifyContent: 'space-between' }}>
                  <span>{r.title}</span>
                  <span className={p.row}>
                    <Badge tone={r.passed ? 'ok' : 'warn'}>{r.score}</Badge>
                    <span className={p.small}>{new Date(r.date).toLocaleDateString()}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
