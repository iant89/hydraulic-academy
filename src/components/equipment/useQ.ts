import { usePrefs } from '@/stores/prefs';
import { formatQuantity, type Quantity } from '@/simulation/core/units';

/** Format a quantity in the technician's selected unit system. */
export function useFmt() {
  const units = usePrefs((s) => s.units);
  return (v: number, q: Quantity, digits?: number) => formatQuantity(v, q, units, digits);
}
