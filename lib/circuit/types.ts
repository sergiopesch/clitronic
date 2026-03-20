export type CircuitNodeType =
  | 'power'
  | 'ground'
  | 'passive'
  | 'active'
  | 'input'
  | 'output'
  | 'logic'
  | 'unknown';

export type CircuitMode = 'draft' | 'preview' | 'simulating';

export interface CircuitNodeParameter {
  key: string;
  label: string;
  value: string;
}

export interface CircuitNode {
  id: string;
  key: string;
  label: string;
  type: CircuitNodeType;
  quantity: number;
  notes?: string[];
  parameters?: CircuitNodeParameter[];
}

export type CircuitConnectionKind = 'explicit' | 'inferred';

export interface CircuitConnection {
  id: string;
  from: string;
  to: string;
  kind: CircuitConnectionKind;
  label?: string;
  rationale?: string;
}

export interface CircuitMetric {
  label: string;
  value: string;
}

export interface CircuitEvent {
  id: string;
  kind: 'info' | 'warning' | 'teaching' | 'window-opened' | 'simulation' | 'focus' | 'validation';
  title: string;
  detail: string;
}

export type CircuitPanelKind =
  | 'workbench'
  | 'teacher'
  | 'inspector'
  | 'graph'
  | 'topology'
  | 'diagram'
  | 'next-step';

export type CircuitWindowTarget =
  | 'workbench'
  | 'teacher'
  | 'inspector'
  | 'graph'
  | 'topology'
  | 'diagram';

export type CircuitFocusTarget = CircuitWindowTarget;

export interface CircuitDiagramState {
  componentKey: string;
  title: string;
  isOpen: boolean;
}

export interface CircuitWindowState {
  openWindows: CircuitWindowTarget[];
  focusedWindow: CircuitWindowTarget;
  diagram?: CircuitDiagramState;
}

export interface CircuitTopologyLink {
  id: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  status: 'explicit' | 'inferred' | 'missing';
  detail: string;
  command: string;
}

export interface CircuitChecklistItem {
  id: string;
  label: string;
  status: 'ready' | 'inferred' | 'missing';
  detail: string;
  command?: string;
}

export interface CircuitPanel {
  id: string;
  kind: CircuitPanelKind;
  title: string;
  description: string;
  accent: 'cyan' | 'emerald' | 'amber' | 'violet';
  state?: {
    isOpen?: boolean;
    isPinned?: boolean;
    order?: number;
  };
}

export interface CircuitDocument {
  id: string;
  prompt: string;
  title: string;
  mode: CircuitMode;
  focusedPanel?: CircuitFocusTarget;
  windowState: CircuitWindowState;
  summary: string;
  nodes: CircuitNode[];
  connections: CircuitConnection[];
  simulation?: CircuitSimulation;
  metrics: CircuitMetric[];
  events: CircuitEvent[];
  panels: CircuitPanel[];
  insights: string[];
  nextActions: string[];
}

export interface LedSeriesSimulation {
  kind: 'led-series';
  ok: boolean;
  reason?: string;
  explanation?: string;
  values?: {
    supplyVoltageV: number;
    resistorOhms: number;
    ledForwardVoltageV: number;
    currentMa: number;
    resistorVoltageV: number;
    resistorPowerMw: number;
  };
  brightnessBand?: 'Very dim' | 'Comfortable' | 'Bright' | 'Aggressive';
  checklist: CircuitChecklistItem[];
  blockers: string[];
  suggestedCommands: string[];
  warnings: string[];
}

export type CircuitSimulation = LedSeriesSimulation;
