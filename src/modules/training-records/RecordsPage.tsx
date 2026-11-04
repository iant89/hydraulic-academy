import { Fragment, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useTraining } from '@/stores/training';
import { usePrefs } from '@/stores/prefs';
import { competencies, weakAreas } from '@/services/training/competency';
import { Badge, Button, Panel, Select, tableClass } from '@/components/ui';
import type { RecordType } from '@/services/training/records';
import p from '../shared/page.module.css';

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function RecordsPage() {
  const { records, progress } = useTraining();
  const tech = usePrefs((s) => s.technician);
  const [type, setType] = useState<'all' | RecordType>('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => records.filter((r) => type === 'all' || r.type === type), [records, type]);
  const scen = records.filter((r) => r.type === 'scenario');
  const avg = scen.length ? scen.reduce((a, r) => a + (r.score ?? 0), 0) / scen.length : null;
  const csv = () => {
    const rows = [['date', 'type', 'title', 'mode', 'score', 'passed', 'duration_s', 'mistakes'], ...list.map((r) => [r.date, r.type, r.title, r.mode ?? '', r.score ?? '', r.passed ?? '', r.durationS?.toFixed(0) ?? '', (r.mistakes ?? []).join(' | ')])];
    download('hydraulic-academy-records.csv', rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Training Records</h1>
          <p>Every lesson, exercise, inspection and diagnostic session is recorded on this device for {tech}.</p>
        </div>
        <Button onClick={csv}>
          <Download size={14} /> Export CSV
        </Button>
        <Button onClick={() => download('hydraulic-academy-records.json', JSON.stringify({ technician: tech, progress, records }, null, 2), 'application/json')}>
          <Download size={14} /> Export JSON
        </Button>
      </div>
      <div className={p.cols4}>
        <Panel title="Records">
          <div className="mono" style={{ fontSize: 22 }}>{records.length}</div>
        </Panel>
        <Panel title="Diagnostic sessions">
          <div className="mono" style={{ fontSize: 22 }}>{scen.length}</div>
          <div className={p.small}>{scen.filter((r) => r.passed).length} passed</div>
        </Panel>
        <Panel title="Average diagnostic score">
          <div className="mono" style={{ fontSize: 22 }}>{avg === null ? '—' : avg.toFixed(0)}</div>
        </Panel>
        <Panel title="Lessons completed">
          <div className="mono" style={{ fontSize: 22 }}>{progress.completedLessons.length}</div>
        </Panel>
      </div>
      <Panel title="Performance report">
        <div className={p.cols2}>
          <table className={tableClass}>
            <tbody>
              {competencies(records).map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td className={p.mono}>{c.average === null ? '—' : `${Math.round(c.average * 100)} %`}</td>
                  <td className={p.small}>{c.samples} sessions</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={p.small}>
            {weakAreas(records).length ? <>Needs additional training: {weakAreas(records).map((w) => w.label).join(', ')}.</> : 'No weak areas identified yet.'}
          </div>
        </div>
      </Panel>
      <Panel title="History" actions={<div style={{ width: 200 }}><Select value={type} onChange={(e) => setType(e.target.value as typeof type)} options={[{ value: 'all', label: 'All types' }, ...['scenario', 'quiz', 'exercise', 'experiment', 'lesson', 'assessment'].map((t) => ({ value: t, label: t }))]} /></div>}>
        <div className="tableWrap">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Activity</th>
                <th>Type</th>
                <th>Score</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                    <td className={p.small}>{new Date(r.date).toLocaleString()}</td>
                    <td>{r.title}</td>
                    <td>
                      <Badge>{r.type}{r.mode ? ` · ${r.mode}` : ''}</Badge>
                    </td>
                    <td className={p.mono}>{r.score ?? '—'}</td>
                    <td>{r.passed === undefined ? '—' : <Badge tone={r.passed ? 'ok' : 'warn'}>{r.passed ? 'pass' : 'not passed'}</Badge>}</td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={5}>
                        {r.categories && <div className={p.small}>{r.categories.map((c) => `${c.label} ${Math.round(c.score * 100)} %`).join(' · ')}</div>}
                        {r.mistakes && r.mistakes.length > 0 && (
                          <ul className={p.small}>
                            {r.mistakes.map((m) => <li key={m}>{m}</li>)}
                          </ul>
                        )}
                        {r.notes && <div className={p.small}>Notes: {r.notes}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!list.length && <div className={p.small}>No records yet.</div>}
        </div>
      </Panel>
    </div>
  );
}
