import { useEffect, useState } from 'react';
import { Copy, Download, FileUp, Factory, Trash2, Truck, Save, Plus } from 'lucide-react';
import type { EquipmentProfile, ManufacturerDocument, SpecValue, VerificationStatus } from '@/equipment/shared/types';
import { profilesRepo, specIssues } from '@/services/training/profiles';
import { inspectionFor, machineFromProfile, TEMPLATES } from '@/equipment/registry';
import { SCENARIO_BRIEFS } from '@/data/scenarios';
import { useWorkbay } from '@/stores/workbay';
import { usePrefs } from '@/stores/prefs';
import { navigate } from '@/app/router';
import { newId } from '@/services/training/records';
import { Badge, Button, Callout, Field, KV, Panel, Select, Tabs, TextArea, TextInput, tableClass, type Tone } from '@/components/ui';
import p from '../shared/page.module.css';

const STATUS: Record<VerificationStatus, { label: string; tone: Tone; help: string }> = {
  'manufacturer-verified': { label: 'Manufacturer-verified', tone: 'ok', help: 'Taken from a cited manufacturer document (title, revision, section, reference).' },
  'technician-provided': { label: 'Technician-provided', tone: 'info', help: 'Entered or measured by a technician. Not verified against manufacturer documentation.' },
  'simulated-training': { label: 'Simulated training value', tone: 'warn', help: 'Used only by the simulator. Never apply to real equipment.' },
};

export function StatusBadge({ s }: { s: VerificationStatus }) {
  return <Badge tone={STATUS[s].tone} title={STATUS[s].help}>{STATUS[s].label}</Badge>;
}

type Tab = 'general' | 'hydraulic' | 'documents' | 'training' | 'edit';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<EquipmentProfile[]>([]);
  const [id, setId] = useState('generic-dt-15');
  const [tab, setTab] = useState<Tab>('general');
  const load = useWorkbay((s) => s.loadProfile);
  const current = useWorkbay((s) => s.profile);
  const editorEnabled = usePrefs((s) => s.editorEnabled);
  const refresh = () => void profilesRepo.all().then(setProfiles);
  useEffect(refresh, []);
  const pr = profiles.find((x) => x.id === id);
  const duplicate = async () => {
    if (!pr) return;
    const copy: EquipmentProfile = { ...structuredClone(pr), id: newId('profile'), name: `${pr.name} (copy)`, generic: false, createdBy: 'user' };
    await profilesRepo.save(copy);
    refresh();
    setId(copy.id);
    setTab('edit');
  };
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Equipment Profiles</h1>
          <p>Each profile configures the reusable components and simulation for a specific equipment configuration. Every specification carries its provenance: manufacturer-verified (with a cited document), technician-provided, or simulated training value.</p>
        </div>
      </div>
      <div className={p.row}>
        {(Object.keys(STATUS) as VerificationStatus[]).map((s) => (
          <span key={s} className={p.small}>
            <StatusBadge s={s} /> {STATUS[s].help}
          </span>
        ))}
      </div>
      <div className={p.splitL}>
        <Panel title="Profiles">
          <div className={p.list}>
            {profiles.map((x) => (
              <button key={x.id} className={`${p.item} ${x.id === id ? p.itemActive : ''}`} onClick={() => { setId(x.id); setTab('general'); }}>
                <div className={p.itemTitle}>
                  <Factory size={13} /> {x.name} {current.id === x.id && <Badge tone="accent">in work bay</Badge>}
                </div>
                <div className={p.itemSub}>
                  {x.manufacturer} · {x.model} · {x.generic ? 'generic training' : 'user profile'}
                </div>
              </button>
            ))}
          </div>
        </Panel>
        {pr && (
          <div className={p.stack}>
            <Panel
              title={`${pr.manufacturer} – ${pr.name}`}
              actions={
                <>
                  <Button size="sm" variant="primary" onClick={() => { load(pr); navigate('simulator'); }}>
                    <Truck size={13} /> Load into work bay
                  </Button>
                  {editorEnabled && (
                    <Button size="sm" onClick={duplicate}>
                      <Copy size={13} /> Duplicate
                    </Button>
                  )}
                </>
              }
            >
              <Tabs<Tab>
                tabs={[
                  { id: 'general', label: 'General' },
                  { id: 'hydraulic', label: 'Hydraulic configuration' },
                  { id: 'documents', label: `Documentation (${pr.documents.length})` },
                  { id: 'training', label: 'Inspection & scenarios' },
                  ...(editorEnabled && pr.createdBy === 'user' ? [{ id: 'edit' as Tab, label: 'Edit' }] : []),
                ]}
                value={tab}
                onChange={setTab}
              />
              <div style={{ marginTop: 10 }}>
                {tab === 'general' && (
                  <KV
                    items={[
                      ['Manufacturer', pr.manufacturer],
                      ['Equipment', pr.name],
                      ['Model', pr.model],
                      ['Model year', pr.modelYear],
                      ['Category', pr.category],
                      ['Serial applicability', pr.serialApplicability],
                      ['Engine', pr.engine],
                      ['Operating environment', pr.environment],
                      ['Template', TEMPLATES[pr.template]?.name ?? pr.template],
                      ['Description', pr.description],
                    ]}
                  />
                )}
                {tab === 'hydraulic' && <Specs pr={pr} />}
                {tab === 'documents' && <Docs pr={pr} />}
                {tab === 'training' && <TrainingInfo pr={pr} />}
                {tab === 'edit' && <Editor pr={pr} onSaved={refresh} onDeleted={() => { refresh(); setId('generic-dt-15'); }} />}
              </div>
            </Panel>
            {!editorEnabled && <Callout>Profile editing is restricted to authorised users. Enable it in Settings (instructor / administrator access).</Callout>}
          </div>
        )}
      </div>
    </div>
  );
}

function Specs({ pr }: { pr: EquipmentProfile }) {
  const def = machineFromProfile(pr);
  const issues = specIssues(pr);
  return (
    <div className={p.list}>
      {issues.length > 0 && <Callout tone="danger" title="Specification provenance problems">{issues.map((i) => <div key={i}>• {i}</div>)}</Callout>}
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Specification</th>
            <th>Value</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(pr.specs).map(([k, s]) => {
            const doc = pr.documents.find((d) => d.id === s.documentId);
            return (
              <tr key={k}>
                <td className={p.mono}>{k}</td>
                <td>
                  {s.value} {s.unit}
                  {s.note && <div className={p.small}>{s.note}</div>}
                </td>
                <td>
                  <StatusBadge s={s.status} />
                </td>
                <td className={p.small}>{doc ? `${doc.title} rev ${doc.revision}, ${doc.section}${s.page ? ` p.${s.page}` : ''}` : s.status === 'simulated-training' ? 'Simulator only – consult the manufacturer service documentation for real values' : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Component configuration (drives the simulation)</h3>
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Component</th>
            <th>Type</th>
            <th>Key parameters</th>
          </tr>
        </thead>
        <tbody>
          {def.circuit.components.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td className={p.mono}>{c.type}</td>
              <td className={p.small}>{Object.entries(c.params).slice(0, 6).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : v}`).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Replacement compatibility requirements</h3>
      <table className={tableClass}>
        <tbody>
          {Object.entries(pr.slots).map(([k, s]) => (
            <tr key={k}>
              <td className={p.mono}>{k}</td>
              <td className={p.small}>{Object.entries(s).map(([kk, v]) => `${kk}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Docs({ pr }: { pr: EquipmentProfile }) {
  if (!pr.documents.length)
    return <Callout tone="warn" title="No documentation on file">No manufacturer documentation is attached to this profile. Consult the applicable manufacturer service documentation for this model and serial number before performing real service work.</Callout>;
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th>Document</th>
          <th>Applicability</th>
          <th>Revision / date</th>
          <th>Section</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {pr.documents.map((d) => (
          <tr key={d.id}>
            <td>
              {d.title}
              <div className={p.small}>{d.manufacturer} · {d.kind}</div>
            </td>
            <td className={p.small}>{d.equipmentApplicability} / {d.modelApplicability}</td>
            <td className={p.small}>{d.revision} · {d.publicationDate}</td>
            <td className={p.small}>{d.section}<div>{d.reference}</div></td>
            <td>
              <StatusBadge s={d.status} />
            </td>
            <td>
              {d.fileKey && (
                <Button
                  size="sm"
                  onClick={async () => {
                    const b = await profilesRepo.getFile(d.fileKey!);
                    if (b) window.open(URL.createObjectURL(b), '_blank');
                  }}
                >
                  <Download size={13} /> Open
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrainingInfo({ pr }: { pr: EquipmentProfile }) {
  const ips = inspectionFor(pr);
  const sc = SCENARIO_BRIEFS.filter((b) => machineFromProfile(pr).id === 'generic-dt-15' && b.equipmentId);
  return (
    <div className={p.cols2}>
      <div>
        <h3>Inspection points ({ips.length})</h3>
        <ul className={p.small}>{ips.map((i) => <li key={i.id}>{i.label} – {i.zone}</li>)}</ul>
      </div>
      <div>
        <h3>Diagnostic scenarios</h3>
        {sc.length ? <ul className={p.small}>{sc.map((b) => <li key={b.id}>{b.title}</li>)}</ul> : <div className={p.small}>No scenarios authored for this profile yet. Load it into the work bay and use practice fault injection.</div>}
      </div>
    </div>
  );
}

function Editor({ pr, onSaved, onDeleted }: { pr: EquipmentProfile; onSaved(): void; onDeleted(): void }) {
  const [d, setD] = useState<EquipmentProfile>(structuredClone(pr));
  const [msg, setMsg] = useState<string | null>(null);
  const issues = specIssues(d);
  const set = (patch: Partial<EquipmentProfile>) => setD({ ...d, ...patch });
  const setSpec = (k: string, patch: Partial<SpecValue>) => set({ specs: { ...d.specs, [k]: { ...d.specs[k]!, ...patch } } });
  const setOverride = (comp: string, key: string, value: number) => set({ overrides: { ...d.overrides, [comp]: { ...(d.overrides[comp] ?? {}), [key]: value } } });
  const ov = (comp: string, key: string, fallback: number) => Number(d.overrides[comp]?.[key] ?? fallback);
  const statusOpts = (Object.keys(STATUS) as VerificationStatus[]).map((s) => ({ value: s, label: STATUS[s].label }));
  const addDoc = () => set({ documents: [...d.documents, { id: newId('doc'), title: '', manufacturer: d.manufacturer, kind: 'service-manual', equipmentApplicability: d.name, modelApplicability: d.model, revision: '', publicationDate: '', section: '', reference: '', status: 'technician-provided' }] });
  const setDoc = (i: number, patch: Partial<ManufacturerDocument>) => set({ documents: d.documents.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  return (
    <div className={p.list}>
      <div className={p.cols3}>
        {(['manufacturer', 'name', 'model', 'modelYear', 'serialApplicability', 'engine', 'environment'] as const).map((k) => (
          <Field key={k} label={k}>
            <TextInput value={String(d[k])} onChange={(e) => set({ [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <h3>Simulation configuration (reusable components)</h3>
      <div className={p.cols3}>
        <Field label="Pump displacement (cm³/rev)">
          <TextInput type="number" min={10} max={250} value={ov('pump', 'displacement', 70)} onChange={(e) => setOverride('pump', 'displacement', Math.min(250, Math.max(10, Number(e.target.value))))} />
        </Field>
        <Field label="Relief setting (bar, simulation)">
          <TextInput type="number" min={50} max={300} value={ov('relief', 'crackingPressure', 172)} onChange={(e) => setOverride('relief', 'crackingPressure', Math.min(300, Math.max(50, Number(e.target.value))))} />
        </Field>
        <Field label="Reservoir capacity (L)">
          <TextInput type="number" min={40} max={400} value={ov('tank', 'capacity', 120)} onChange={(e) => setOverride('tank', 'capacity', Math.min(400, Math.max(40, Number(e.target.value))))} />
        </Field>
        <Field label="Rated payload (kg)">
          <TextInput type="number" min={1000} max={40000} value={d.machineOverrides?.ratedPayload ?? 13600} onChange={(e) => set({ machineOverrides: { ...d.machineOverrides, ratedPayload: Math.min(40000, Math.max(1000, Number(e.target.value))) } })} />
        </Field>
      </div>
      <h3>Specifications and provenance</h3>
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Status</th>
            <th>Source document</th>
            <th>Page</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(d.specs).map(([k, s]) => (
            <tr key={k}>
              <td className={p.mono}>{k}</td>
              <td>
                <TextInput value={String(s.value)} onChange={(e) => setSpec(k, { value: e.target.value })} />
              </td>
              <td>
                <TextInput value={s.unit ?? ''} onChange={(e) => setSpec(k, { unit: e.target.value })} />
              </td>
              <td>
                <Select value={s.status} onChange={(e) => setSpec(k, { status: e.target.value as VerificationStatus })} options={statusOpts} />
              </td>
              <td>
                <Select value={s.documentId ?? ''} onChange={(e) => setSpec(k, { documentId: e.target.value || undefined })} options={[{ value: '', label: 'none' }, ...d.documents.map((x) => ({ value: x.id, label: x.title || '(untitled)' }))]} />
              </td>
              <td>
                <TextInput value={s.page ?? ''} onChange={(e) => setSpec(k, { page: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" onClick={() => set({ specs: { ...d.specs, [`custom.${Object.keys(d.specs).length}`]: { value: '', status: 'technician-provided' } } })}>
        <Plus size={13} /> Add specification
      </Button>
      <h3>Documents</h3>
      {d.documents.map((doc, i) => (
        <div key={doc.id} className={p.item} style={{ cursor: 'default' }}>
          <div className={p.cols3}>
            {(['title', 'manufacturer', 'revision', 'publicationDate', 'section', 'reference', 'equipmentApplicability', 'modelApplicability'] as const).map((k) => (
              <Field key={k} label={k}>
                <TextInput value={String(doc[k])} onChange={(e) => setDoc(i, { [k]: e.target.value })} />
              </Field>
            ))}
            <Field label="Kind">
              <Select value={doc.kind} onChange={(e) => setDoc(i, { kind: e.target.value as ManufacturerDocument['kind'] })} options={['hydraulic-schematic', 'service-manual', 'operator-manual', 'component-manual', 'maintenance-schedule', 'parts-catalog', 'troubleshooting', 'specification-sheet'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="Verification status">
              <Select value={doc.status} onChange={(e) => setDoc(i, { status: e.target.value as VerificationStatus })} options={statusOpts} />
            </Field>
            <Field label={`File ${doc.fileKey ? '(attached)' : ''}`}>
              <label className={p.chip} style={{ cursor: 'pointer' }}>
                <FileUp size={13} /> Upload
                <input
                  type="file"
                  hidden
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const key = `${doc.id}:${f.name}`;
                    await profilesRepo.saveFile(key, f);
                    setDoc(i, { fileKey: key });
                  }}
                />
              </label>
            </Field>
          </div>
          <Field label="Notes">
            <TextArea value={doc.notes ?? ''} onChange={(e) => setDoc(i, { notes: e.target.value })} />
          </Field>
        </div>
      ))}
      <Button size="sm" onClick={addDoc}>
        <Plus size={13} /> Add document
      </Button>
      {issues.length > 0 && <Callout tone="danger" title="Cannot save as manufacturer-verified">{issues.map((x) => <div key={x}>• {x}</div>)}</Callout>}
      <div className={p.row}>
        <Button
          variant="primary"
          disabled={issues.length > 0}
          onClick={async () => {
            await profilesRepo.save(d);
            setMsg('Profile saved.');
            onSaved();
          }}
        >
          <Save size={13} /> Save profile
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            await profilesRepo.remove(d.id);
            onDeleted();
          }}
        >
          <Trash2 size={13} /> Delete profile
        </Button>
      </div>
      {msg && <Callout tone="ok">{msg}</Callout>}
    </div>
  );
}
