import { Suspense, lazy, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { AppShell } from './layouts/AppShell';
import { useRoute } from './router';
import { useSimulationLoop } from '@/stores/simLoop';
import { useTraining } from '@/stores/training';
import { Empty } from '@/components/ui';
import type { Route } from './router';

type Page = LazyExoticComponent<ComponentType<{ route: Route }>>;
const page = (f: () => Promise<{ default: ComponentType<{ route: Route }> }>): Page => lazy(f);

const PAGES: Record<string, Page> = {
  dashboard: page(() => import('@/modules/dashboard/DashboardPage')),
  learning: page(() => import('@/modules/learning/LearningPage')),
  fundamentals: page(() => import('@/modules/fundamentals/FundamentalsPage')),
  components: page(() => import('@/modules/components-library/ComponentLibraryPage')),
  'circuit-builder': page(() => import('@/modules/circuit-builder/CircuitBuilderPage')),
  simulator: page(() => import('@/modules/equipment-simulator/SimulatorPage')),
  playground: page(() => import('@/modules/playground/PlaygroundPage')),
  workshop: page(() => import('@/modules/virtual-workshop/WorkshopPage')),
  diagnostics: page(() => import('@/modules/diagnostics/DiagnosticsPage')),
  repair: page(() => import('@/modules/repair-workshop/RepairPage')),
  profiles: page(() => import('@/modules/equipment-profiles/ProfilesPage')),
  schematics: page(() => import('@/modules/schematics/SchematicsPage')),
  assessments: page(() => import('@/modules/assessments/AssessmentsPage')),
  records: page(() => import('@/modules/training-records/RecordsPage')),
  settings: page(() => import('@/modules/settings/SettingsPage')),
};

export function App() {
  const route = useRoute();
  useSimulationLoop();
  const load = useTraining((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  const id = route.path[0] ?? 'dashboard';
  const Page = PAGES[id];
  return (
    <AppShell active={id}>
      <Suspense fallback={<Empty>Loading…</Empty>}>{Page ? <Page route={route} /> : <Empty>Page not found.</Empty>}</Suspense>
    </AppShell>
  );
}
