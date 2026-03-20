'use client';

import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { CircuitAnalysis, CircuitDocument, CircuitMode } from '@/lib/circuit';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function badgeClasses(status: 'explicit' | 'inferred' | 'missing' | 'ready'): string {
  if (status === 'explicit' || status === 'ready') {
    return 'border-emerald-700/40 bg-emerald-950/30 text-emerald-200';
  }
  if (status === 'inferred') {
    return 'border-amber-700/40 bg-amber-950/30 text-amber-200';
  }
  return 'border-rose-700/40 bg-rose-950/30 text-rose-200';
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

  const explicitCount = connections.filter((connection) => connection.kind === 'explicit').length;
  const inferredCount = connections.filter((connection) => connection.kind === 'inferred').length;

  return (
    <div className="rounded-2xl border border-cyan-900/30 bg-[linear-gradient(180deg,#0a1017,#081019)] p-4">
      <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
        <span>Spatial circuit sketch</span>
        <span>{mode === 'simulating' ? 'simulation context loaded' : 'drafting context'}</span>
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

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-900/25 bg-emerald-950/10 p-3 text-xs text-emerald-100/80">
          Explicit wires: <span className="font-semibold text-emerald-200">{explicitCount}</span>
        </div>
        <div className="rounded-xl border border-amber-900/25 bg-amber-950/10 p-3 text-xs text-amber-100/80">
          Inferred links: <span className="font-semibold text-amber-200">{inferredCount}</span>
        </div>
      </div>
    </div>
  );
}

export function TopologyMap({
  nodes,
  connections,
  analysis,
  onQuickCommand,
}: {
  nodes: CircuitDocument['nodes'];
  connections: CircuitDocument['connections'];
  analysis: CircuitAnalysis;
  onQuickCommand: (command: string) => void;
}) {
  const displayNodes = nodes.length
    ? nodes
    : [
        { id: 'battery-1', key: 'battery', label: 'Battery', type: 'power', quantity: 1 },
        { id: 'resistor-1', key: 'resistor', label: 'Resistor', type: 'passive', quantity: 1 },
        { id: 'led-1', key: 'led', label: 'LED', type: 'output', quantity: 1 },
      ];

  return (
    <div className="space-y-4 rounded-2xl border border-cyan-900/30 bg-[#0a1017] p-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Topology map</span>
        <span>
          {displayNodes.length} node{displayNodes.length === 1 ? '' : 's'} • {connections.length}{' '}
          link{connections.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {displayNodes.map((node) => {
            const related = connections.filter(
              (connection) => connection.from === node.id || connection.to === node.id
            );

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

                <div className="mt-3 space-y-2 text-xs text-gray-300">
                  {related.length ? (
                    related.map((connection) => {
                      const target = displayNodes.find((candidate) =>
                        candidate.id === connection.from
                          ? connection.to === node.id
                          : candidate.id === connection.to
                      );
                      const otherId = connection.from === node.id ? connection.to : connection.from;
                      const targetNode =
                        displayNodes.find((candidate) => candidate.id === otherId) ?? target;

                      return (
                        <div key={connection.id} className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-gray-100">↔ {targetNode?.label ?? otherId}</div>
                            <div className="mt-1 text-gray-500">
                              {connection.label ?? 'link'} •{' '}
                              {connection.rationale ?? 'No rationale'}
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-1 text-[11px] ${badgeClasses(connection.kind)}`}
                          >
                            {connection.kind}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500">No links attached yet.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-gray-800 bg-[#0d141c] p-3">
          <div className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">Required path</div>
          <div className="mt-3 space-y-2">
            {analysis.topologyLinks.map((link) => (
              <div key={link.id} className="rounded-lg border border-gray-800 bg-[#0a0f15] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white">
                    {link.fromLabel} → {link.toLabel}
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] ${badgeClasses(link.status)}`}
                  >
                    {link.status}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-relaxed text-gray-400">{link.detail}</div>
                {link.status !== 'explicit' ? (
                  <button
                    onClick={() => onQuickCommand(link.command)}
                    className="mt-3 rounded-full border border-cyan-700/30 bg-cyan-950/20 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-500/50 hover:bg-cyan-900/30"
                  >
                    {link.command}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GraphPreview({
  workspace,
  analysis,
  onQuickCommand,
}: {
  workspace: CircuitDocument;
  analysis: CircuitAnalysis;
  onQuickCommand: (command: string) => void;
}) {
  const mode = workspace.mode;
  const sim = workspace.simulation?.kind === 'led-series' ? workspace.simulation : undefined;

  const hasValues = Boolean(sim?.ok && sim.values);
  const currentMa = hasValues ? sim!.values!.currentMa : null;
  const resistorPowerMw = hasValues ? sim!.values!.resistorPowerMw : null;

  const displayCurrent = currentMa ?? 0;
  const displayPower = resistorPowerMw ?? 0;

  const currentPct = clamp((displayCurrent / 25) * 100, 0, 100);
  const powerPct = clamp((displayPower / 500) * 100, 0, 100);
  const bars =
    mode === 'simulating'
      ? [currentPct, powerPct, clamp((currentPct + powerPct) / 2, 0, 100), 40, 65, 55, 70]
      : [20, 28, 36, 30, 42, 34, 40];

  const guidance = sim?.ok
    ? (sim.explanation ??
      'Simulation is using the explicit series loop, so the graph now explains real current and power estimates for this circuit.')
    : (sim?.explanation ??
      'The graph is waiting for an explicit runnable path. Use the checklist below to complete the loop.');

  const blockers = sim?.ok ? [] : (sim?.blockers ?? analysis.blockers);
  const commands = sim?.ok
    ? sim.suggestedCommands.slice(0, 4)
    : (sim?.suggestedCommands.length ? sim.suggestedCommands : analysis.suggestedFixes).slice(0, 5);

  return (
    <div className="space-y-4 rounded-2xl border border-violet-900/30 bg-[linear-gradient(180deg,#100d18,#0b0b14)] p-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{mode === 'simulating' ? 'Live behaviour' : 'Simulation guidance'}</span>
        <span>
          {hasValues
            ? `I = ${displayCurrent.toFixed(1)}mA • P = ${displayPower.toFixed(1)}mW`
            : mode === 'simulating'
              ? 'blocked until path is explicit'
              : 'waiting for simulate'}
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

      <div className="rounded-xl border border-violet-900/25 bg-violet-950/10 p-3 text-xs leading-relaxed text-violet-100/80">
        {guidance}
      </div>

      {!sim?.ok ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-xl border border-rose-900/25 bg-rose-950/10 p-3">
            <div className="text-[11px] tracking-[0.16em] text-rose-200 uppercase">Blockers</div>
            <div className="mt-3 space-y-2 text-xs text-rose-100/85">
              {blockers.length ? (
                blockers.map((blocker) => (
                  <div
                    key={blocker}
                    className="rounded-lg border border-rose-900/30 bg-black/20 p-2"
                  >
                    {blocker}
                  </div>
                ))
              ) : (
                <div className="text-rose-100/70">No blockers surfaced yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0d141c] p-3">
            <div className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">
              Next commands
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {commands.map((command) => (
                <button
                  key={command}
                  onClick={() => onQuickCommand(command)}
                  className="rounded-full border border-cyan-700/30 bg-cyan-950/20 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-500/50 hover:bg-cyan-900/30"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-xl border border-emerald-900/25 bg-emerald-950/10 p-3 text-xs text-emerald-100/85">
            Brightness band:{' '}
            <span className="font-semibold text-emerald-200">{sim.brightnessBand}</span>
            <div className="mt-2">Resistor drop: {sim.values?.resistorVoltageV.toFixed(2)}V</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0d141c] p-3">
            <div className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">
              Suggested experiments
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {commands.map((command) => (
                <button
                  key={command}
                  onClick={() => onQuickCommand(command)}
                  className="rounded-full border border-cyan-700/30 bg-cyan-950/20 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-500/50 hover:bg-cyan-900/30"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DiagramDefinition {
  title: string;
  subtitle: string;
  polarity?: string;
  notes: string[];
  render: () => ReactElement;
}

const DIAGRAMS: Record<string, DiagramDefinition> = {
  battery: {
    title: 'Battery',
    subtitle: 'Long plate = positive, short plate = negative.',
    polarity: 'Observe polarity when feeding the rest of the circuit.',
    notes: [
      'Treat the battery as the start of the current path.',
      'A 9V battery gives more headroom than a 5V source, but the resistor still sets current.',
    ],
    render: () => (
      <svg viewBox="0 0 240 120" className="h-32 w-full">
        <line x1="30" y1="60" x2="90" y2="60" stroke="currentColor" strokeWidth="4" />
        <line x1="100" y1="35" x2="100" y2="85" stroke="currentColor" strokeWidth="6" />
        <line x1="125" y1="45" x2="125" y2="75" stroke="currentColor" strokeWidth="3" />
        <line x1="135" y1="60" x2="210" y2="60" stroke="currentColor" strokeWidth="4" />
        <text x="95" y="25" fontSize="12" fill="currentColor">
          +
        </text>
        <text x="122" y="25" fontSize="12" fill="currentColor">
          -
        </text>
      </svg>
    ),
  },
  resistor: {
    title: 'Resistor',
    subtitle: 'Insert in series to limit current.',
    notes: [
      'Resistors are non-polarized, so either direction works.',
      'For a red LED on 5V or 9V, start around 220Ω to 470Ω and adjust deliberately.',
    ],
    render: () => (
      <svg viewBox="0 0 240 120" className="h-32 w-full">
        <line x1="20" y1="60" x2="55" y2="60" stroke="currentColor" strokeWidth="4" />
        <polyline
          points="55,60 75,35 95,85 115,35 135,85 155,35 175,60"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        />
        <line x1="175" y1="60" x2="220" y2="60" stroke="currentColor" strokeWidth="4" />
      </svg>
    ),
  },
  led: {
    title: 'LED',
    subtitle: 'Anode to positive through a resistor, cathode to ground.',
    polarity: 'Long leg / triangle side toward the resistor. Flat side toward ground.',
    notes: [
      'Never wire an LED straight to a battery without a resistor.',
      'If the path is explicit, simulation can estimate brightness from current.',
    ],
    render: () => (
      <svg viewBox="0 0 240 120" className="h-32 w-full">
        <line x1="20" y1="60" x2="85" y2="60" stroke="currentColor" strokeWidth="4" />
        <polygon points="85,30 85,90 130,60" fill="none" stroke="currentColor" strokeWidth="4" />
        <line x1="145" y1="30" x2="145" y2="90" stroke="currentColor" strokeWidth="4" />
        <line x1="145" y1="60" x2="220" y2="60" stroke="currentColor" strokeWidth="4" />
        <line x1="120" y1="28" x2="145" y2="8" stroke="currentColor" strokeWidth="3" />
        <line x1="138" y1="28" x2="163" y2="8" stroke="currentColor" strokeWidth="3" />
        <polyline points="145,8 156,10 152,20" fill="none" stroke="currentColor" strokeWidth="3" />
        <polyline points="163,8 174,10 170,20" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    ),
  },
  capacitor: {
    title: 'Capacitor',
    subtitle: 'Stores charge and often bridges supply to ground.',
    polarity: 'Electrolytic capacitors are polarized. Stripe marks the negative side.',
    notes: [
      'Place large electrolytics across supply rails to smooth voltage changes.',
      'If you reverse a polarized capacitor, it can fail violently.',
    ],
    render: () => (
      <svg viewBox="0 0 240 120" className="h-32 w-full">
        <line x1="20" y1="60" x2="95" y2="60" stroke="currentColor" strokeWidth="4" />
        <line x1="105" y1="30" x2="105" y2="90" stroke="currentColor" strokeWidth="4" />
        <line x1="135" y1="30" x2="135" y2="90" stroke="currentColor" strokeWidth="4" />
        <line x1="145" y1="60" x2="220" y2="60" stroke="currentColor" strokeWidth="4" />
        <text x="98" y="22" fontSize="12" fill="currentColor">
          +
        </text>
      </svg>
    ),
  },
};

export function ComponentDiagramPreview({ componentKey }: { componentKey: string }) {
  const diagram = DIAGRAMS[componentKey] ?? {
    title: 'Component',
    subtitle: 'No custom diagram yet.',
    notes: ['Try battery, resistor, led, or capacitor.'],
    render: () => <div className="text-sm text-gray-500">No diagram available.</div>,
  };

  return (
    <div className="rounded-2xl border border-emerald-900/30 bg-[linear-gradient(180deg,#0d1514,#09110f)] p-4 text-emerald-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{diagram.title}</div>
          <div className="mt-1 text-sm text-emerald-100/80">{diagram.subtitle}</div>
        </div>
        <div className="rounded-full border border-emerald-700/30 bg-emerald-950/20 px-3 py-1 text-[11px] tracking-[0.16em] text-emerald-200 uppercase">
          Diagram
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-900/25 bg-black/20 p-4 text-emerald-200">
        {diagram.render()}
      </div>

      {diagram.polarity ? (
        <div className="mt-4 rounded-xl border border-amber-900/30 bg-amber-950/20 p-3 text-xs text-amber-100/85">
          {diagram.polarity}
        </div>
      ) : null}

      <div className="mt-4 space-y-2 text-sm text-emerald-100/85">
        {diagram.notes.map((note) => (
          <div key={note} className="rounded-xl border border-gray-800 bg-black/20 px-3 py-2">
            {note}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WindowsHelp({ workspace }: { workspace: CircuitDocument }) {
  const panelSummary = useMemo(
    () =>
      workspace.panels
        .filter((panel) => panel.state?.isOpen)
        .map((panel) => panel.title)
        .join(' • '),
    [workspace.panels]
  );

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0a0f15] p-3 text-xs text-gray-400">
      Supporting windows now open: <span className="text-cyan-400">{panelSummary || '—'}</span>
    </div>
  );
}
