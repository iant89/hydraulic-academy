import { useState } from 'react';
import { Award, CheckCircle2, ClipboardCheck, Printer, XCircle, Play } from 'lucide-react';
import { ASSESSMENTS } from '@/data/assessments';
import { useTraining } from '@/stores/training';
import { usePrefs } from '@/stores/prefs';
import { useWorkbay } from '@/stores/workbay';
import { loadScenario, briefById } from '@/data/scenarios';
import { competencies, weakAreas, CATEGORY_LESSONS } from '@/services/training/competency';
import { LESSONS } from '@/data/lessons/curriculum';
import { navigate, href } from '@/app/router';
import { Badge, Button, Callout, Meter, Panel, TextInput } from '@/components/ui';
import p from '../shared/page.module.css';

export default function AssessmentsPage() {
  const { records, progress, updateProgress } = useTraining();
  const tech = usePrefs((s) => s.technician);
  const editor = usePrefs((s) => s.editorEnabled);
  const start = useWorkbay((s) => s.startScenario);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [cert, setCert] = useState<{ id: string; title: string; date: string; score: number } | null>(null);
  const comp = competencies(records);
  const weak = weakAreas(records);
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Assessments</h1>
          <p>Practical examinations and competency requirements. Requirements are evaluated from your recorded training. Training completion records issued here are NOT professional qualifications, licences or manufacturer certifications.</p>
        </div>
      </div>
      <div className={p.cols2}>
        {ASSESSMENTS.map((a) => {
          const results = a.requirements.map((r, i) => ({ r, ...r.check(records, progress, thresholds[`${a.id}:${i}`] ?? r.threshold), i }));
          const met = results.every((x) => x.met);
          const issued = progress.certificates.find((c) => c.id === a.id);
          return (
            <Panel key={a.id} title={a.title} icon={<ClipboardCheck size={14} />} actions={met ? <Badge tone="ok">requirements met</Badge> : <Badge>{results.filter((x) => x.met).length}/{results.length}</Badge>}>
              <div className={p.list}>
                <div className={p.small}>{a.description}</div>
                {results.map((x) => (
                  <div key={x.i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    {x.met ? <CheckCircle2 size={14} color="var(--ok)" /> : <XCircle size={14} color="var(--muted)" />}
                    <span style={{ flex: 1 }}>{x.r.label}</span>
                    {editor && (
                      <span style={{ width: 70 }}>
                        <TextInput type="number" aria-label="Threshold" value={thresholds[`${a.id}:${x.i}`] ?? x.r.threshold} onChange={(e) => setThresholds({ ...thresholds, [`${a.id}:${x.i}`]: Number(e.target.value) })} />
                      </span>
                    )}
                    <span className={p.mono}>{x.detail}</span>
                  </div>
                ))}
                <div className={p.row}>
                  {a.examPool && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const id = a.examPool![Math.floor(Math.random() * a.examPool!.length)]!;
                        const s = await loadScenario(id);
                        start({ brief: { ...s.brief, hints: [] }, key: s.key });
                        navigate('diagnostics');
                      }}
                    >
                      <Play size={13} /> Start practical exam (random scenario)
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!met}
                    onClick={async () => {
                      const c = issued ?? { id: a.id, title: a.title, date: new Date().toISOString(), score: 100 };
                      if (!issued) await updateProgress((pr) => ({ ...pr, certificates: [...pr.certificates, c] }));
                      setCert(c);
                    }}
                  >
                    <Award size={13} /> {issued ? 'View completion record' : 'Issue completion record'}
                  </Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
      <div className={p.cols2}>
        <Panel title="Competency profile (diagnostic scenarios)">
          <div className={p.list}>
            {comp.map((c) => (
              <div key={c.id}>
                <div className={p.row} style={{ justifyContent: 'space-between' }}>
                  <span>{c.label}</span>
                  <span className={p.mono}>{c.average === null ? 'no data' : `${Math.round(c.average * 100)} % (${c.samples})`}</span>
                </div>
                <Meter value={c.average ?? 0} color={c.average === null ? undefined : c.average >= 0.8 ? 'var(--ok)' : c.average >= 0.5 ? 'var(--warn)' : 'var(--danger)'} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Areas requiring additional training">
          {weak.length === 0 ? (
            <div className={p.small}>No weak areas identified yet. Complete diagnostic scenarios to build your profile.</div>
          ) : (
            <div className={p.list}>
              {weak.map((w) => (
                <div key={w.id}>
                  <strong>{w.label}</strong> – {Math.round((w.average ?? 0) * 100)} %
                  <div className={p.small}>
                    Recommended:{' '}
                    {(CATEGORY_LESSONS[w.id] ?? []).map((l) => (
                      <a key={l} href={href(`learning/${l}`)} style={{ marginRight: 8 }}>
                        {LESSONS.find((x) => x.id === l)?.title}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {cert && (
        <Panel title="Training completion record" actions={<Button size="sm" onClick={() => window.print()}><Printer size={13} /> Print</Button>}>
          <div style={{ border: '2px solid var(--accent)', borderRadius: 8, padding: 24, textAlign: 'center', background: '#14171a' }} id="certificate">
            <div style={{ letterSpacing: '0.2em', color: 'var(--accent)', fontSize: 12 }}>HYDRAULIC ACADEMY – TRAINING COMPLETION RECORD</div>
            <h2 style={{ fontSize: 22, margin: '12px 0' }}>{tech}</h2>
            <div>has met the application requirements for</div>
            <h3 style={{ fontSize: 17, margin: '8px 0' }}>{cert.title}</h3>
            <div className={p.small}>Issued {new Date(cert.date).toLocaleDateString()} · record {cert.id}</div>
            <Callout tone="warn">This is an application-issued record of simulated training activity. It is not a professional qualification, licence, or manufacturer certification, and does not authorise work on real equipment.</Callout>
          </div>
        </Panel>
      )}
      <div className={p.small}>Exam scenario pool examples: {ASSESSMENTS.flatMap((a) => a.examPool ?? []).slice(0, 4).map((i) => briefById(i)?.title).join(' · ')}</div>
    </div>
  );
}
