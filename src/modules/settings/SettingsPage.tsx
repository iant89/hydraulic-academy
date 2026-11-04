import { useState } from 'react';
import { usePrefs } from '@/stores/prefs';
import { useTraining } from '@/stores/training';
import { db } from '@/services/persistence/db';
import { Button, Callout, Field, Panel, Select, TextInput } from '@/components/ui';
import p from '../shared/page.module.css';

export default function SettingsPage() {
  const prefs = usePrefs();
  const reset = useTraining((s) => s.reset);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Settings</h1>
          <p>Preferences are stored in this browser. Training data is stored locally (IndexedDB) and works offline.</p>
        </div>
      </div>
      <div className={p.cols2}>
        <Panel title="Technician">
          <div className={p.list}>
            <Field label="Name on training records">
              <TextInput value={prefs.technician} onChange={(e) => prefs.set({ technician: e.target.value })} />
            </Field>
            <Field label="Display units (simulation always runs in SI)">
              <Select value={prefs.units} onChange={(e) => prefs.set({ units: e.target.value as 'metric' | 'imperial' })} options={[{ value: 'metric', label: 'Metric (bar, L/min, °C, kN)' }, { value: 'imperial', label: 'Imperial (psi, gpm, °F, kip)' }]} />
            </Field>
            <Field label="Default training mode">
              <Select value={prefs.defaultMode} onChange={(e) => prefs.set({ defaultMode: e.target.value as typeof prefs.defaultMode })} options={[{ value: 'guided', label: 'Guided learning' }, { value: 'practical', label: 'Practical training' }, { value: 'challenge', label: 'Diagnostic challenge' }, { value: 'master', label: 'Master technician' }]} />
            </Field>
            <label style={{ display: 'flex', gap: 6 }}>
              <input type="checkbox" checked={prefs.showHints} onChange={(e) => prefs.set({ showHints: e.target.checked })} /> Show hints in practical scenarios
            </label>
          </div>
        </Panel>
        <Panel title="Instructor / administrator">
          <div className={p.list}>
            <label style={{ display: 'flex', gap: 6 }}>
              <input type="checkbox" checked={prefs.editorEnabled} onChange={(e) => prefs.set({ editorEnabled: e.target.checked })} /> Enable equipment profile editing, assessment thresholds and all learning levels
            </label>
            <Callout tone="warn">There is no user authentication in this offline build. Restrict access to this device if editing must be controlled.</Callout>
          </div>
        </Panel>
        <Panel title="Data">
          <div className={p.list}>
            <Button
              onClick={async () => {
                const data = { records: await db.list('records'), progress: await db.list('progress'), experiments: await db.list('experiments'), profiles: await db.list('profiles') };
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                a.download = 'hydraulic-academy-backup.json';
                a.click();
              }}
            >
              Export all local data
            </Button>
            {!confirm ? (
              <Button variant="danger" onClick={() => setConfirm(true)}>
                Reset training records & progress…
              </Button>
            ) : (
              <div className={p.row}>
                <span>Delete all records and progress on this device?</span>
                <Button variant="danger" onClick={async () => { await reset(); setConfirm(false); setMsg('Training records and progress cleared.'); }}>
                  Yes, delete
                </Button>
                <Button onClick={() => setConfirm(false)}>Cancel</Button>
              </div>
            )}
            {msg && <Callout tone="ok">{msg}</Callout>}
          </div>
        </Panel>
        <Panel title="About this simulator">
          <div className={p.prose}>
            <p>Hydraulic Academy uses a lumped-parameter hydraulic network model (implicit time integration, SI units) with documented approximations. All values for the built-in equipment are simulated training values, not manufacturer specifications.</p>
            <p>This is a training simulator. It is not a replacement for manufacturer service manuals, qualified instruction, or site-specific safety requirements.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
