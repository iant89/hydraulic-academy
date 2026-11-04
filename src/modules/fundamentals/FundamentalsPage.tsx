import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { FUNDAMENTAL_LABS } from '@/data/labs';
import { CircuitLab, type LabRecord } from '@/components/circuit/CircuitLab';
import { Button, Callout, Panel, Tabs, TextInput, tableClass, Badge } from '@/components/ui';
import { FLUID_GRADES, kinematicViscosityCSt } from '@/simulation/physics/fluid';
import { pressureFromForce, pumpFlow, cylinderVelocity, hydraulicPower } from '@/simulation/physics/formulas';
import { BAR, CC, LPM, MM, circleArea } from '@/simulation/core/units';
import { useTraining } from '@/stores/training';
import p from '../shared/page.module.css';

type Tab = 'labs' | 'calc' | 'fluid';

export default function FundamentalsPage() {
  const [tab, setTab] = useState<Tab>('labs');
  return (
    <div className={p.page}>
      <div className={p.head}>
        <div className={p.grow}>
          <h1>Hydraulic Fundamentals</h1>
          <p>Learn by experiment. Every lab runs on the same hydraulic simulation engine used by the equipment – change one thing at a time and watch pressure, flow and motion respond.</p>
        </div>
      </div>
      <Tabs<Tab> tabs={[{ id: 'labs', label: 'Interactive labs' }, { id: 'calc', label: 'Formula calculator' }, { id: 'fluid', label: 'Fluid properties' }]} value={tab} onChange={setTab} />
      {tab === 'labs' && <Labs />}
      {tab === 'calc' && <Calculator />}
      {tab === 'fluid' && <FluidChart />}
    </div>
  );
}

function Labs() {
  const [id, setId] = useState(FUNDAMENTAL_LABS[0]!.id);
  const [records, setRecords] = useState<LabRecord[]>([]);
  const [answer, setAnswer] = useState<number | null>(null);
  const [showExpected, setShowExpected] = useState(false);
  const progress = useTraining((s) => s.progress);
  const update = useTraining((s) => s.updateProgress);
  const lab = FUNDAMENTAL_LABS.find((l) => l.id === id)!;
  const done = progress.completedExercises.includes(`lab:${id}`);
  return (
    <div className={p.splitL}>
      <Panel title="Labs">
        <div className={p.list}>
          {FUNDAMENTAL_LABS.map((l) => (
            <button key={l.id} className={`${p.item} ${id === l.id ? p.itemActive : ''}`} onClick={() => { setId(l.id); setRecords([]); setAnswer(null); setShowExpected(false); }}>
              <div className={p.itemTitle}>
                <FlaskConical size={13} /> {l.title} {progress.completedExercises.includes(`lab:${l.id}`) && <Badge tone="ok">done</Badge>}
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <div className={p.stack}>
        <Panel title={lab.title}>
          <p style={{ color: 'var(--text-2)' }}>
            <strong>Objective:</strong> {lab.objective}
          </p>
          <CircuitLab key={lab.id} circuit={lab.circuit()} controls={lab.controls} readouts={lab.readouts} onRecord={(r) => setRecords([r, ...records])} />
        </Panel>
        <div className={p.cols2}>
          <Panel title="Procedure">
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
              {lab.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div style={{ marginTop: 8 }}>
              {!showExpected ? (
                <Button size="sm" onClick={() => setShowExpected(true)}>
                  I have made my observations – show expected results
                </Button>
              ) : (
                <Callout tone="ok" title="Expected observations">
                  {lab.expected.map((e) => (
                    <div key={e}>• {e}</div>
                  ))}
                  <div style={{ marginTop: 6 }}>{lab.explanation}</div>
                </Callout>
              )}
            </div>
          </Panel>
          <Panel title="Recorded measurements">
            {records.length === 0 ? (
              <div className={p.small}>Use “Record measurement” to log each setting and result.</div>
            ) : (
              <div className={p.scroll}>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th>Settings</th>
                      <th>Results</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i}>
                        <td className={p.small}>{Object.entries(r.settings).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                        <td className={p.mono}>{Object.entries(r.values).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        {lab.question && (
          <Panel title="Check your understanding">
            <p>{lab.question.q}</p>
            <div className={p.row}>
              {lab.question.options.map((o, i) => (
                <Button key={o} active={answer === i} onClick={() => setAnswer(i)}>
                  {o}
                </Button>
              ))}
            </div>
            {answer !== null && (
              <div style={{ marginTop: 8 }}>
                <Callout tone={answer === lab.question.answer ? 'ok' : 'warn'} title={answer === lab.question.answer ? 'Correct' : 'Not quite'}>
                  {lab.question.why}
                </Callout>
              </div>
            )}
          </Panel>
        )}
        <div>
          <Button variant="primary" disabled={done || records.length < 2} onClick={() => update((pr) => ({ ...pr, completedExercises: [...pr.completedExercises, `lab:${id}`] }))}>
            {done ? 'Lab completed' : records.length < 2 ? 'Record at least two measurements to complete' : 'Mark lab complete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, unit }: { label: string; value: number; onChange(v: number): void; unit: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
      {label} ({unit})
      <TextInput type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Calculator() {
  const [force, setForce] = useState(50);
  const [bore, setBore] = useState(80);
  const [disp, setDisp] = useState(40);
  const [rpm, setRpm] = useState(1500);
  const [eff, setEff] = useState(0.92);
  const A = circleArea(bore * MM);
  const P = pressureFromForce(force * 1000, A);
  const Q = pumpFlow(disp * CC, rpm, eff);
  const v = cylinderVelocity(Q, A);
  return (
    <div className={p.cols2}>
      <Panel title="Cylinder: P = F / A, v = Q / A">
        <div className={p.cols2}>
          <Num label="Load force" value={force} onChange={setForce} unit="kN" />
          <Num label="Bore" value={bore} onChange={setBore} unit="mm" />
        </div>
        <div className={p.formula}>A = π·d²/4 = {(A * 1e4).toFixed(1)} cm²</div>
        <div className={p.formula}>P = F / A = {(P / BAR).toFixed(1)} bar</div>
        <div className={p.formula}>v = Q / A = {(v * 1000).toFixed(0)} mm/s (with the pump below)</div>
      </Panel>
      <Panel title="Pump: Q = Vd × n × ηv, Ph = p × Q">
        <div className={p.cols3}>
          <Num label="Displacement" value={disp} onChange={setDisp} unit="cm³/rev" />
          <Num label="Speed" value={rpm} onChange={setRpm} unit="rpm" />
          <Num label="Vol. efficiency" value={eff} onChange={setEff} unit="0–1" />
        </div>
        <div className={p.formula}>Q = {(Q / LPM).toFixed(1)} L/min</div>
        <div className={p.formula}>Hydraulic power at that pressure = {(hydraulicPower(P, Q) / 1000).toFixed(1)} kW</div>
      </Panel>
    </div>
  );
}

function FluidChart() {
  const temps = Array.from({ length: 21 }, (_, i) => i * 5);
  const grades = ['iso-vg-32', 'iso-vg-46', 'iso-vg-68', 'sae-15w40'];
  const colors = ['#45b4d6', '#f2a93b', '#4fb37f', '#e5534b'];
  const W = 640;
  const H = 300;
  const x = (t: number) => 50 + (t / 100) * (W - 70);
  const y = (nu: number) => H - 30 - ((Math.log10(nu) - 0.5) / 3) * (H - 50);
  return (
    <div className={p.cols2}>
      <Panel title="Viscosity vs temperature (model used by the simulator)">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Viscosity temperature chart">
          {[3, 10, 30, 100, 300, 1000].map((v) => (
            <g key={v}>
              <line x1={50} x2={W - 20} y1={y(v)} y2={y(v)} stroke="#2d3238" />
              <text x={44} y={y(v) + 3} fontSize={10} fill="#8a939d" textAnchor="end">{v}</text>
            </g>
          ))}
          {temps.filter((t) => t % 20 === 0).map((t) => (
            <text key={t} x={x(t)} y={H - 12} fontSize={10} fill="#8a939d" textAnchor="middle">{t} °C</text>
          ))}
          {grades.map((g, i) => (
            <polyline key={g} fill="none" stroke={colors[i]} strokeWidth={2} points={temps.map((t) => `${x(t)},${y(kinematicViscosityCSt(FLUID_GRADES[g]!, t))}`).join(' ')} />
          ))}
          <text x={56} y={16} fontSize={10} fill="#8a939d">cSt (log scale)</text>
        </svg>
        <div className={p.row}>
          {grades.map((g, i) => (
            <span key={g} className={p.chip}>
              <i style={{ width: 10, height: 3, background: colors[i], display: 'inline-block' }} /> {FLUID_GRADES[g]!.name}
            </span>
          ))}
        </div>
      </Panel>
      <Panel title="Why it matters">
        <div className={p.prose}>
          <p>Viscosity falls roughly tenfold between 0 °C and 60 °C. Thick, cold oil raises suction losses (cavitation risk at start-up) and line pressure drops. Thin, hot oil increases internal leakage in pumps, valves and cylinders – a worn pump that seems fine cold can be badly slow when hot.</p>
          <p>The wrong fluid (for example engine oil in a hydraulic system) shifts the whole curve. Always use the fluid specified by the equipment manufacturer.</p>
          <p>Hydraulic oil is nearly incompressible (bulk modulus ≈ 1.4–1.8 GPa; ≈ 1 GPa effective including hose expansion). Entrained air reduces it sharply, making the system spongy.</p>
        </div>
      </Panel>
    </div>
  );
}
