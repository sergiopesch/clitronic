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

export interface CircuitConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
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

export type CircuitPanelKind = 'scene' | 'teacher' | 'inspector' | 'graph' | 'next-step';

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
  values?: {
    supplyVoltageV: number;
    resistorOhms: number;
    ledForwardVoltageV: number;
    currentMa: number;
    resistorVoltageV: number;
    resistorPowerMw: number;
  };
  brightnessBand?: 'Very dim' | 'Comfortable' | 'Bright' | 'Aggressive';
  warnings: string[];
}

export type CircuitSimulation = LedSeriesSimulation;
