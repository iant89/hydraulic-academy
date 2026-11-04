import {
  LayoutDashboard,
  GraduationCap,
  FlaskConical,
  Library,
  Workflow,
  Truck,
  Warehouse,
  Stethoscope,
  Factory,
  TestTubes,
  Wrench,
  Network,
  ClipboardCheck,
  FileText,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'Learn' | 'Operate' | 'Diagnose & repair' | 'Reference' | 'Progress';
}

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Progress' },
  { id: 'learning', label: 'Learning Center', icon: GraduationCap, group: 'Learn' },
  { id: 'fundamentals', label: 'Hydraulic Fundamentals', icon: FlaskConical, group: 'Learn' },
  { id: 'components', label: 'Component Library', icon: Library, group: 'Learn' },
  { id: 'circuit-builder', label: 'Circuit Builder', icon: Workflow, group: 'Learn' },
  { id: 'simulator', label: 'Equipment Simulator', icon: Truck, group: 'Operate' },
  { id: 'playground', label: 'Hydraulic Playground', icon: TestTubes, group: 'Operate' },
  { id: 'workshop', label: 'Virtual Workshop', icon: Warehouse, group: 'Diagnose & repair' },
  { id: 'diagnostics', label: 'Diagnostic Center', icon: Stethoscope, group: 'Diagnose & repair' },
  { id: 'repair', label: 'Repair Workshop', icon: Wrench, group: 'Diagnose & repair' },
  { id: 'profiles', label: 'Equipment Profiles', icon: Factory, group: 'Reference' },
  { id: 'schematics', label: 'Hydraulic Schematics', icon: Network, group: 'Reference' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, group: 'Progress' },
  { id: 'records', label: 'Training Records', icon: FileText, group: 'Progress' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Progress' },
];

export const NAV_GROUPS: NavItem['group'][] = ['Progress', 'Learn', 'Operate', 'Diagnose & repair', 'Reference'];
