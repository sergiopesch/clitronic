'use client';

import { useMemo } from 'react';
import type { CircuitDocument, CircuitMode } from '@/lib/circuit';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function WorkbenchPreview({
  nodes,
  connections,
  mode,
}: {
  nodes: CircuitDocument['nodes'];
  connections: CircuitDocument['connections'];
  mode: CircuitMode;
}) {
  const displayNodes = nodes.length
    ? nodes
    : [
        { id: 'battery-1', key: 'battery', label: 'Battery', type: 'power', quantity: 1 },
        { id: 'resistor-1', key: 'resistor', label: 'Resistor', type: 'passive', quantity: 1 },
        { id: 'led-1', key: 'led', label: 'LED', type: 'output', quantity: 1 },
      ];

  return (
    <div className="rounded-2xl border border-cyan-900/30 bg-[linear-gradient(180deg,#0a1017,#081019)] p-4">
      <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
        <span>Spatial circuit sketch</span>
        <span>{mode === 'simulating' ? 'signal overlays on' : 'layout preview'}</span>
      </div>

      <div className="grid gap-3">
        {displayNodes.map((node, index) => (
          <div key={`${node.id}-${index}`} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-700/30 bg-cyan-950/20 text-xs text-cyan-200">
              {node.label.slice(0, 3).toUpperCase()}
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/50 to-transparent" />
            <div className="rounded-lg border border-gray-800 bg-[#0a0f15] px-2 py-1 text-xs text-gray-300">
              {node.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-cyan-900/25 bg-cyan-950/10 p-3 text-xs leading-relaxed text-cyan-100/80">
        {connections.length} inferred connection{connections.length === 1 ? '' : 's'} currently
        define the path. This is the bridge from pure concept UI to a real circuit document model.
      </div>
    </div>
  );
}

export function TopologyMap({
  nodes,
  connections,
}: {
  nodes: CircuitDocument['nodes'];
  connections: CircuitDocument['connections'];
}) {
  const displayNodes = nodes.length
    ? nodes
    : [
        { id: 'battery-1', key: 'battery', label: 'Battery', type: 'power', quantity: 1 },
        { id: 'resistor-1', key: 'resistor', label: 'Resistor', type: 'passive', quantity: 1 },
        { id: 'led-1', key: 'led', label: 'LED', type: 'output', quantity: 1 },
      ];

  return (
    <div className="rounded-2xl border border-cyan-900/30 bg-[#0a1017] p-4">
      <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
        <span>2D topology</span>
        <span>
          {displayNodes.length} node{displayNodes.length === 1 ? '' : 's'} • {connections.length}{' '}
          link{connections.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-3">
        {displayNodes.map((node, index) => {
          const outgoing = connections.filter((connection) => connection.from === node.id);
          return (
            <div key={node.id} className="rounded-xl border border-gray-800 bg-[#0d141c] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-cyan-200">{node.label}</div>
                  <div className="mt-1 text-[11px] tracking-[0.14em] text-gray-500 uppercase">
                    {node.type}
                  </div>
                </div>
                <div className="rounded-full border border-cyan-700/30 bg-cyan-950/20 px-2 py-1 text-[11px] text-cyan-200">
                  {node.id}
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-400">
                {outgoing.length
                  ? outgoing.map((connection) => {
                      const target = displayNodes.find(
                        (candidate) => candidate.id === connection.to
                      );
                      return (
                        <div key={connection.id} className="mb-1 flex items-center gap-2">
                          <span className="text-cyan-500">→</span>
                          <span>{target?.label ?? connection.to}</span>
                          <span className="text-gray-600">({connection.label ?? 'link'})</span>
                        </div>
                      );
                    })
                  : index < displayNodes.length - 1
                    ? 'No explicit outgoing link yet.'
                    : 'Terminal node.'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GraphPreview({ workspace }: { workspace: CircuitDocument }) {
  const mode = workspace.mode;
  const sim = workspace.simulation?.kind === 'led-series' ? workspace.simulation : undefined;

  const hasValues = Boolean(sim?.ok && sim.values);
  const currentMa = hasValues ? sim!.values!.currentMa : null;
  const resistorPowerMw = hasValues ? sim!.values!.resistorPowerMw : null;

  const displayCurrent = currentMa ?? 0;
  const displayPower = resistorPowerMw ?? 0;

  // Simple normalisation bands for MVP visuals.
  const currentPct = clamp((displayCurrent / 25) * 100, 0, 100);
  const powerPct = clamp((displayPower / 500) * 100, 0, 100);
  const bars =
    mode === 'simulating'
      ? [currentPct, powerPct, clamp((currentPct + powerPct) / 2, 0, 100), 40, 65, 55, 70]
      : [20, 28, 36, 30, 42, 34, 40];

  return (
    <div className="rounded-2xl border border-violet-900/30 bg-[linear-gradient(180deg,#100d18,#0b0b14)] p-4">
      <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
        <span>{mode === 'simulating' ? 'Live behaviour' : 'Potential signal view'}</span>
        <span>
          {hasValues
            ? `I = ${displayCurrent.toFixed(1)}mA • P = ${displayPower.toFixed(1)}mW`
            : mode === 'simulating'
              ? 'waiting for a valid circuit'
              : 'waiting for simulation'}
        </span>
      </div>

      <div className="flex h-40 items-end gap-2">
        {bars.map((bar, index) => (
          <div key={`${index}-${bar}`} className="flex flex-1 flex-col justify-end">
            <div
              className="rounded-t-md bg-gradient-to-t from-violet-500 to-cyan-400"
              style={{ height: `${bar}%` }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs leading-relaxed text-violet-100/80">
        {hasValues
          ? 'This is a DC snapshot (series LED). Current and power are driven by your parameters; change voltage/resistance and re-run simulate.'
          : 'Graphs will wake up when simulation produces real values. Add the missing parts, connect the loop, and run simulate.'}
      </div>
    </div>
  );
}

export function WindowsHelp({ workspace }: { workspace: CircuitDocument }) {
  const panelSummary = useMemo(
    () => workspace.panels.map((panel) => panel.title).join(' • '),
    [workspace.panels]
  );

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0a0f15] p-3 text-xs text-gray-400">
      Panels now open: <span className="text-cyan-400">{panelSummary || '—'}</span>
    </div>
  );
}
