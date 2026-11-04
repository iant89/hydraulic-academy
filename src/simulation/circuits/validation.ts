import { BAR } from '../core/units';
import { getModel, hasModel } from '../components/registry';
import type { CircuitDefinition, ConnectionDefinition, PortDefinition, PortRef, PortRole } from '../hydraulics/types';

export type IssueSeverity = 'danger' | 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  why: string;
  consequence: string;
  fix: string;
  ports: PortRef[];
  connections: string[];
}

const key = (r: PortRef) => `${r.component}.${r.port}`;
const INLINE_TYPES = new Set(['filter', 'cooler', 'flow-meter', 'orifice', 'check-valve', 'flow-control']);

interface PortInfo {
  ref: PortRef;
  def: PortDefinition;
  compType: string;
  compLabel: string;
}

class Topology {
  ports = new Map<string, PortInfo>();
  parent = new Map<string, string>();
  constructor(public c: CircuitDefinition) {
    for (const comp of c.components) {
      if (!hasModel(comp.type) || comp.type === 'open-port') continue;
      for (const p of getModel(comp.type).ports(comp)) {
        const ref = { component: comp.id, port: p.id };
        this.ports.set(key(ref), { ref, def: p, compType: comp.type, compLabel: comp.label });
        this.parent.set(key(ref), key(ref));
      }
    }
    for (const cn of c.connections) if (this.ports.has(key(cn.from)) && this.ports.has(key(cn.to))) this.union(key(cn.from), key(cn.to));
  }
  find(k: string): string {
    let p = this.parent.get(k) ?? k;
    while (p !== (this.parent.get(p) ?? p)) p = this.parent.get(p)!;
    return p;
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
  /** Ports directly joined to `k` (same net), excluding k itself. */
  net(k: string): PortInfo[] {
    const r = this.find(k);
    return [...this.ports.entries()].filter(([kk]) => kk !== k && this.find(kk) === r).map(([, v]) => v);
  }
  isConnected(k: string) {
    return this.c.connections.some((cn) => key(cn.from) === k || key(cn.to) === k);
  }
  /** Roles reachable from a port through inline components (filters, coolers, meters...). */
  reach(k: string, seen = new Set<string>()): PortInfo[] {
    const out: PortInfo[] = [];
    const net = this.net(k);
    // A reservoir port fixes the net at tank pressure: do not propagate through inline parts beyond it.
    const atTank = [this.ports.get(k), ...net].some((p) => p && ['return-in', 'drain-in', 'suction-out'].includes(p.def.role));
    for (const p of net) {
      const pk = key(p.ref);
      if (seen.has(pk)) continue;
      seen.add(pk);
      if (INLINE_TYPES.has(p.compType) && !atTank) {
        const other = [...this.ports.values()].find((x) => x.ref.component === p.ref.component && x.ref.port !== p.ref.port);
        if (other) {
          seen.add(key(other.ref));
          out.push(...this.reach(key(other.ref), seen));
        }
      } else out.push(p);
    }
    return out;
  }
}

const has = (list: PortInfo[], roles: PortRole[]) => list.some((p) => roles.includes(p.def.role));
const desc = (p: PortInfo) => `${p.compLabel} port "${p.def.marking}"`;

/**
 * Validate the topology of a hydraulic circuit and explain each problem in
 * training terms: what is wrong, why, what would happen, how to fix it.
 * Validation is based on port FUNCTION (markings), never on hose colour.
 */
export function validateCircuit(c: CircuitDefinition): ValidationIssue[] {
  const t = new Topology(c);
  const issues: ValidationIssue[] = [];
  const push = (i: Omit<ValidationIssue, 'connections'> & { connections?: string[] }) => issues.push({ connections: [], ...i });
  const connsAt = (k: string) => c.connections.filter((cn) => key(cn.from) === k || key(cn.to) === k).map((cn) => cn.id);

  for (const cn of c.connections) {
    for (const end of [cn.from, cn.to]) {
      if (!t.ports.has(key(end)))
        push({ severity: 'error', code: 'unknown-port', message: `Line ${cn.label ?? cn.id} ends at "${key(end)}", which does not exist.`, why: 'Every hose must terminate at a real, marked port.', consequence: 'The line is not connected to anything.', fix: 'Reconnect the hose to the correct marked port.', ports: [end], connections: [cn.id] });
    }
    if (key(cn.from) === key(cn.to)) push({ severity: 'error', code: 'self-loop', message: `${cn.label ?? cn.id} connects a port to itself.`, why: 'A hose must join two different ports.', consequence: 'No function.', fix: 'Remove the hose.', ports: [cn.from], connections: [cn.id] });
  }

  for (const [k, p] of t.ports) {
    const reach = t.reach(k);
    const direct = t.net(k);
    const connected = t.isConnected(k);
    const conns = connsAt(k);
    switch (p.def.role) {
      case 'pump-inlet': {
        if (!connected) {
          push({ severity: 'error', code: 'pump-inlet-open', message: `${desc(p)} is not connected.`, why: 'A pump can only deliver what flows into its inlet.', consequence: 'Pump runs dry – rapid destruction.', fix: 'Connect the pump inlet to the reservoir suction outlet (S).', ports: [p.ref] });
          break;
        }
        if (has(reach, ['pump-outlet', 'supply', 'work'])) push({ severity: 'danger', code: 'pump-inlet-pressurised', message: `${desc(p)} is connected to a pressure/work line.`, why: 'Pump inlets and suction hoses are designed for low pressure only.', consequence: 'Inlet seal and suction hose failure; possible violent rupture.', fix: 'Pump inlet must connect only to the reservoir suction outlet (S).', ports: [p.ref], connections: conns });
        else if (!has(reach, ['suction-out'])) push({ severity: 'error', code: 'pump-inlet-not-suction', message: `${desc(p)} does not draw from a reservoir suction outlet.`, why: 'Return/drain ports on a reservoir are positioned and sized for returning flow, not for supplying the pump.', consequence: 'Pump starves or draws aerated, unfiltered oil – cavitation and wear.', fix: 'Connect the inlet to the reservoir port marked S.', ports: [p.ref], connections: conns });
        if (direct.some((x) => x.compType === 'filter')) push({ severity: 'warning', code: 'pressure-filter-on-suction', message: 'A return-line filter is installed in the suction line.', why: 'Fine filters create too much restriction for a pump inlet.', consequence: 'Cavitation when cold or when the element loads.', fix: 'Use only a coarse suction strainer on the inlet; put fine filtration in the return.', ports: [p.ref] });
        break;
      }
      case 'pump-outlet': {
        if (!connected) {
          push({ severity: 'danger', code: 'pump-outlet-blocked', message: `${desc(p)} is not connected (plugged).`, why: 'A positive-displacement pump delivers flow whatever the resistance.', consequence: 'Instant overpressure – pump, PTO or line failure.', fix: 'Connect the outlet to the valve pressure port (P).', ports: [p.ref] });
          break;
        }
        if (has(reach, ['pump-inlet', 'suction-out'])) push({ severity: 'error', code: 'pump-outlet-to-suction', message: `${desc(p)} connects back to a suction line or reservoir S port.`, why: 'Pump outlet must feed the system.', consequence: 'Pressurises the suction side; no system function.', fix: 'Route the outlet to the valve P port.', ports: [p.ref], connections: conns });
        if (has(reach, ['tank', 'return-in']) && !has(reach, ['supply'])) push({ severity: 'warning', code: 'pump-to-tank', message: `${desc(p)} goes straight to tank.`, why: 'Flow returns to tank without passing a control valve.', consequence: 'No pressure can be built; nothing operates.', fix: 'Connect the outlet to the directional valve P port.', ports: [p.ref], connections: conns });
        const relieved = (rp: PortInfo[]) => rp.some((x) => x.def.role === 'supply' && (x.compType === 'relief-valve' || x.compType === 'unloading-valve'));
        const comp = c.components.find((x) => x.id === p.ref.component);
        if (comp?.type !== 'pump-piston-pc' && !relieved(reach)) push({ severity: 'danger', code: 'no-relief', message: `No pressure relief valve protects ${desc(p)}.`, why: 'A fixed-displacement pump needs a relief path that is always connected to its outlet, upstream of any valve that can block flow.', consequence: 'When the actuator stalls or reaches end of stroke, pressure rises until something bursts.', fix: 'Connect a relief valve P port to the pump pressure line, with its T port to tank.', ports: [p.ref], connections: conns });
        break;
      }
      case 'supply': {
        if (!connected) {
          push({ severity: p.compType === 'relief-valve' ? 'warning' : 'error', code: 'supply-open', message: `${desc(p)} is not connected.`, why: 'The pressure inlet must be supplied.', consequence: p.compType === 'relief-valve' ? 'Relief valve provides no protection.' : 'Valve receives no flow.', fix: 'Connect to the pump pressure line.', ports: [p.ref] });
          break;
        }
        // Series (tandem) valve banks: an upstream valve's T port legitimately feeds the next valve's P port.
        const seriesFed = reach.some((x) => x.def.role === 'tank' && x.compType === 'dcv') && !has(reach, ['return-in', 'drain-in', 'suction-out']);
        if (!seriesFed && !has(reach, ['pump-outlet']) && has(reach, ['tank', 'return-in', 'drain-in', 'suction-out'])) push({ severity: 'danger', code: 'supply-on-return', message: `${desc(p)} (pressure inlet) is connected to a return/tank line.`, why: 'P and T ports have been reversed.', consequence: p.compType === 'relief-valve' ? 'The relief valve now sits on the return line – the pump has NO overpressure protection.' : 'Spool functions are reversed and the relief path may be bypassed.', fix: 'Swap the hoses so pump pressure feeds the port marked P and the return goes from T.', ports: [p.ref], connections: conns });
        break;
      }
      case 'tank': {
        if (!connected) {
          push({ severity: p.compType === 'dcv' ? 'danger' : 'error', code: 'tank-open', message: `${desc(p)} is not connected.`, why: 'Return ports must have a free path to the reservoir.', consequence: p.compType === 'relief-valve' ? 'Relief cannot discharge – no protection.' : 'Return flow is blocked: actuators stall and pressure builds in the return.', fix: 'Connect to the return line through the filter to the reservoir.', ports: [p.ref] });
          break;
        }
        if (p.compType === 'dcv' && reach.some((x) => x.def.role === 'supply' && x.compType === 'dcv') && !has(reach, ['pump-outlet'])) {
          push({ severity: 'info', code: 'series-valve', message: `${desc(p)} carries over to the next valve section (series/tandem circuit).`, why: 'In a series bank each section’s return feeds the next section’s pressure inlet.', consequence: 'Downstream functions add their pressure to upstream ones; all flow passes every section.', fix: 'Correct for a series bank – verify against the schematic.', ports: [p.ref] });
          break;
        }
        if (has(reach, ['pump-outlet'])) push({ severity: 'danger', code: 'tank-pressurised', message: `${desc(p)} (tank) is connected to pump pressure.`, why: 'T ports and return passages are often rated for low pressure only.', consequence: 'Body or seal failure; reversed function.', fix: 'Connect pump pressure to P and route T to the reservoir.', ports: [p.ref], connections: conns });
        else if (!has(reach, ['return-in', 'drain-in', 'suction-out', 'tank'])) push({ severity: 'warning', code: 'tank-not-to-reservoir', message: `${desc(p)} does not return to the reservoir.`, why: 'Return flow must reach the tank.', consequence: 'Blocked or restricted return.', fix: 'Route through the return filter to the reservoir R port.', ports: [p.ref], connections: conns });
        break;
      }
      case 'drain': {
        if (!connected) push({ severity: 'danger', code: 'drain-open', message: `${desc(p)} (case/spring drain) is plugged.`, why: 'Drain ports must stay at near-zero pressure.', consequence: 'Case pressure blows out the shaft seal; reducing valves cannot regulate.', fix: 'Run a dedicated drain line directly to the reservoir drain port.', ports: [p.ref] });
        else if (has(reach, ['pump-outlet', 'supply', 'work'])) push({ severity: 'danger', code: 'drain-pressurised', message: `${desc(p)} is connected to a pressure line.`, why: 'Case drains are low-pressure.', consequence: 'Shaft seal and housing failure.', fix: 'Connect the drain directly to the reservoir drain port.', ports: [p.ref], connections: conns });
        else if (direct.some((x) => x.compType === 'filter' || x.compType === 'cooler')) push({ severity: 'warning', code: 'drain-restricted', message: `${desc(p)} drains through a filter/cooler.`, why: 'Restriction in a case drain raises case pressure.', consequence: 'Shaft seal leakage, especially when cold.', fix: 'Route the case drain directly to tank.', ports: [p.ref], connections: conns });
        break;
      }
      case 'suction-out': {
        if (connected && !has(reach, ['pump-inlet'])) push({ severity: 'error', code: 'suction-misused', message: `${desc(p)} (suction outlet) is not feeding a pump inlet.`, why: 'Returning flow to the suction port puts hot, aerated, unfiltered oil straight into the pump inlet.', consequence: 'Aeration, cavitation, overheating.', fix: 'Return lines go to the R port; S feeds only the pump inlet.', ports: [p.ref], connections: conns });
        break;
      }
      case 'return-in':
      case 'drain-in': {
        if (has(reach, ['pump-inlet'])) push({ severity: 'error', code: 'suction-from-return', message: `Pump inlet draws from ${desc(p)}.`, why: 'Return ports are above the pickup or have diffusers – not intended for suction.', consequence: 'Air drawn into the pump.', fix: 'Connect the pump inlet to S.', ports: [p.ref], connections: conns });
        break;
      }
      case 'work': {
        if (!connected && p.compType === 'cylinder') push({ severity: 'error', code: 'actuator-port-open', message: `${desc(p)} is not connected.`, why: 'Both ports of a double-acting actuator must be connected to the valve.', consequence: 'Hydraulic lock (plugged) or no movement.', fix: 'Connect to the valve work port.', ports: [p.ref] });
        if (!connected && p.compType === 'dcv') push({ severity: 'info', code: 'valve-work-plugged', message: `${desc(p)} is plugged.`, why: 'Unused work ports may be plugged if the spool function allows it.', consequence: 'Check the spool type: a plugged port on a 4-way valve dead-heads in that position.', fix: 'Verify against the schematic.', ports: [p.ref] });
        if (connected && has(reach, ['pump-outlet']) && p.compType === 'cylinder') push({ severity: 'danger', code: 'actuator-direct-pump', message: `${desc(p)} is connected directly to the pump outlet.`, why: 'No valve controls the actuator.', consequence: 'Uncontrolled movement; dead-head at end of stroke.', fix: 'Connect the actuator to the directional valve work port.', ports: [p.ref], connections: conns });
        if (connected && has(reach, ['tank', 'return-in']) && p.compType === 'cylinder' && !has(reach, ['work'])) push({ severity: 'error', code: 'actuator-to-tank', message: `${desc(p)} is connected straight to tank.`, why: 'The actuator is not controlled by the valve.', consequence: 'Cannot be powered in that direction; load may fall.', fix: 'Connect the actuator to the valve work port.', ports: [p.ref], connections: conns });
        break;
      }
      case 'pilot': {
        if (!connected) push({ severity: 'warning', code: 'pilot-open', message: `${desc(p)} pilot is unconnected.`, why: 'Pilot-operated valves need their pilot signal.', consequence: p.compType === 'pilot-check' || p.compType === 'counterbalance' ? 'Load cannot be lowered (valve never opens).' : 'Valve never shifts.', fix: 'Connect the pilot to the line specified on the schematic (usually the opposite actuator line).', ports: [p.ref] });
        else if (has(reach, ['tank', 'return-in'])) push({ severity: 'error', code: 'pilot-to-tank', message: `${desc(p)} is connected to tank.`, why: 'A pilot from tank never sees pressure.', consequence: 'Valve never opens.', fix: 'Connect the pilot to the opposite work line.', ports: [p.ref], connections: conns });
        break;
      }
      default:
        break;
    }
  }

  // Hose rating vs. relief settings on the same net.
  for (const cn of c.connections) {
    const reliefs = c.components.filter((x) => x.type === 'relief-valve');
    const maxSetting = Math.max(0, ...reliefs.map((r) => Number(r.params.crackingPressure) || 0)) * BAR;
    if (cn.lineType !== 'suction' && cn.lineType !== 'return' && cn.lineType !== 'case-drain' && maxSetting > 0 && cn.hose.workingPressure < maxSetting)
      push({ severity: 'danger', code: 'hose-underrated', message: `${cn.label ?? cn.id} is rated ${(cn.hose.workingPressure / BAR).toFixed(0)} bar but the relief is set at ${(maxSetting / BAR).toFixed(0)} bar.`, why: 'Every pressure line must be rated for at least the maximum system pressure.', consequence: 'Hose burst – whipping and injection hazard.', fix: 'Fit hose with a working pressure ≥ the relief setting.', ports: [cn.from, cn.to], connections: [cn.id] });
    if (cn.lineType === 'suction' && cn.hose.construction !== 'suction-hose')
      push({ severity: 'warning', code: 'suction-not-helix', message: `${cn.label ?? cn.id} is not reinforced suction hose.`, why: 'Suction lines operate under vacuum.', consequence: 'Hose collapses – cavitation.', fix: 'Use wire-helix suction hose.', ports: [cn.from, cn.to], connections: [cn.id] });
    const fromRole = t.ports.get(key(cn.from))?.def.role;
    const toRole = t.ports.get(key(cn.to))?.def.role;
    const roles = [fromRole, toRole];
    if (cn.lineType === 'return' && roles.includes('pump-outlet'))
      push({ severity: 'warning', code: 'label-mismatch', message: `${cn.label ?? cn.id} is labelled as a return line but carries pump pressure.`, why: 'Labels and colours can be wrong. Port markings are authoritative.', consequence: 'Misidentification during service.', fix: 'Verify by port markings and the schematic; correct the tag.', ports: [cn.from, cn.to], connections: [cn.id] });
  }

  // Suction velocity guideline (≤ 1.2 m/s typical industry rule of thumb).
  for (const comp of c.components.filter((x) => x.type.startsWith('pump'))) {
    const inlet = c.connections.find((cn) => key(cn.to) === `${comp.id}.IN` || key(cn.from) === `${comp.id}.IN`);
    if (!inlet) continue;
    const q = ((Number(comp.params.displacement) || 0) * 1e-6 * (Number(comp.params.ratedSpeed) || 0)) / 60;
    const a = (Math.PI * inlet.hose.innerDiameter ** 2) / 4;
    const v = q / a;
    if (v > 1.5) push({ severity: 'warning', code: 'suction-velocity', message: `Suction velocity ≈${v.toFixed(1)} m/s at rated pump speed.`, why: 'A common design guideline keeps suction velocity around 0.6–1.2 m/s.', consequence: 'High inlet vacuum – cavitation, especially when cold.', fix: 'Increase suction hose diameter or shorten the line.', ports: [inlet.from, inlet.to], connections: [inlet.id] });
  }
  return issues;
}

export interface ReferenceDiff {
  severity: IssueSeverity;
  code: 'missing' | 'reversed' | 'wrong-port' | 'extra';
  message: string;
  expected?: ConnectionDefinition;
  actual?: ConnectionDefinition;
}

/** Compare a technician's connections with the reference schematic. */
export function compareToReference(actual: CircuitDefinition, reference: CircuitDefinition): ReferenceDiff[] {
  const pairKey = (cn: ConnectionDefinition) => [key(cn.from), key(cn.to)].sort().join('|');
  const out: ReferenceDiff[] = [];
  const actualPairs = new Map(actual.connections.map((cn) => [pairKey(cn), cn]));
  const refPairs = new Map(reference.connections.map((cn) => [pairKey(cn), cn]));
  for (const [k, ref] of refPairs) {
    if (actualPairs.has(k)) continue;
    // Find a line touching one of the expected ports
    const candidates = actual.connections.filter((cn) => [key(cn.from), key(cn.to)].some((e) => e === key(ref.from) || e === key(ref.to)));
    const sameComps = candidates.find((cn) => {
      const comps = new Set([cn.from.component, cn.to.component]);
      return comps.has(ref.from.component) && comps.has(ref.to.component);
    });
    if (sameComps && !refPairs.has(pairKey(sameComps))) {
      const swapped = reference.connections.some((r2) => r2 !== ref && pairKey(r2) !== k && [key(r2.from), key(r2.to)].includes(key(sameComps.from)));
      out.push({
        severity: 'error',
        code: swapped ? 'reversed' : 'wrong-port',
        message: `${ref.label ?? ref.id}: expected ${key(ref.from)} → ${key(ref.to)}, found ${key(sameComps.from)} → ${key(sameComps.to)}${swapped ? ' (ports reversed)' : ''}.`,
        expected: ref,
        actual: sameComps,
      });
    } else out.push({ severity: 'error', code: 'missing', message: `Missing connection: ${ref.label ?? ref.id} (${key(ref.from)} → ${key(ref.to)}).`, expected: ref });
  }
  for (const [k, cn] of actualPairs) {
    if (refPairs.has(k)) continue;
    if (out.some((d) => d.actual === cn)) continue;
    out.push({ severity: 'warning', code: 'extra', message: `Connection not on the schematic: ${key(cn.from)} → ${key(cn.to)}.`, actual: cn });
  }
  return out;
}

export interface NetDiff {
  kind: 'missing-join' | 'wrong-join';
  ports: string[];
  message: string;
}

/**
 * Compare circuits by their nets (which ports are hydraulically joined),
 * so equivalent tee positions are accepted. Used for circuit-building
 * exercises where hose routing order does not matter.
 */
export function compareNets(actual: CircuitDefinition, reference: CircuitDefinition): NetDiff[] {
  const nets = (c: CircuitDefinition) => {
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      if (!parent.has(k)) parent.set(k, k);
      let p = parent.get(k)!;
      while (p !== parent.get(p)) p = parent.get(p)!;
      return p;
    };
    for (const cn of c.connections) {
      const a = find(key(cn.from));
      const b = find(key(cn.to));
      if (a !== b) parent.set(a, b);
    }
    const groups = new Map<string, string[]>();
    for (const k of parent.keys()) {
      const r = find(k);
      groups.set(r, [...(groups.get(r) ?? []), k]);
    }
    return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort());
  };
  const A = nets(actual);
  const R = nets(reference);
  const sig = (g: string[]) => g.join('|');
  const aSet = new Set(A.map(sig));
  const rSet = new Set(R.map(sig));
  const out: NetDiff[] = [];
  for (const g of R) if (!aSet.has(sig(g))) out.push({ kind: 'missing-join', ports: g, message: `These ports must be joined in one line: ${g.join(', ')}.` });
  for (const g of A) if (!rSet.has(sig(g))) out.push({ kind: 'wrong-join', ports: g, message: `These ports are joined but should not be (as a group): ${g.join(', ')}.` });
  return out;
}
