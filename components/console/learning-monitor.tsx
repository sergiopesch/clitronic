'use client';

import { useState } from 'react';
import {
  analyzeCircuit,
  syncCircuitDocument,
  type CircuitConnection,
  type CircuitDocument,
  type CircuitNode,
  type CircuitNodeType,
} from '@/lib/circuit';
import {
  ComponentDiagramPreview,
  TopologyMap,
  WorkbenchPreview,
} from '@/components/studio/previews';

type ToolInvocation = {
  toolName:
    | 'lookup_component'
    | 'search_components'
    | 'calculate_resistor'
    | 'ohms_law'
    | 'generate_circuit_plan'
    | 'generate_debug_checklist';
  summary: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

type ConsoleMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
};

type MonitorScene = {
  components: Array<{ id: string; label: string; type: CircuitNodeType }>;
  connections: Array<{
    id: string;
    from: string;
    to: string;
    kind: 'explicit' | 'inferred';
    label?: string;
  }>;
  focusComponent?: string;
};

type MonitorMetricPanel = {
  title: string;
  metrics: Array<{ label: string; value: string }>;
};

type MonitorDebugPanel = {
  title: string;
  checks: string[];
};

type LearningMonitorProps = {
  messages: ConsoleMessage[];
  isLoading: boolean;
  onQuickPrompt: (prompt: string) => void;
};

function titleCase(value: string) {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function createWorkspaceFromScene(
  title: string,
  prompt: string,
  scene: MonitorScene
): CircuitDocument {
  const nodes: CircuitNode[] = scene.components.map((component) => ({
    id: component.id,
    key: component.id,
    label: component.label,
    type: component.type,
    quantity: 1,
  }));

  const connections: CircuitConnection[] = scene.connections.map((connection) => ({
    id: connection.id,
    from: connection.from,
    to: connection.to,
    kind: connection.kind,
    label: connection.label,
  }));

  return syncCircuitDocument({
    id: `monitor-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    prompt,
    title,
    mode: 'preview',
    focusedPanel: 'workbench',
    windowState: {
      openWindows: ['workbench', 'teacher', 'inspector', 'topology'],
      focusedWindow: 'workbench',
      diagram: scene.focusComponent
        ? {
            componentKey: scene.focusComponent,
            title: `${titleCase(scene.focusComponent)} diagram`,
            isOpen: true,
          }
        : undefined,
    },
    summary: `Adaptive lesson scene for: ${title}`,
    nodes,
    connections,
    simulation: undefined,
  });
}

export function LearningMonitor({ messages, isLoading, onQuickPrompt }: LearningMonitorProps) {
  const [activeTab, setActiveTab] = useState<'scene' | 'guide' | 'inspect'>('scene');

  const latestUserPrompt = [...messages]
    .reverse()
    .find((message) => message.role === 'user')?.content;
  const latestAssistantWithTools = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.toolInvocations?.length);
  const toolInvocations = latestAssistantWithTools?.toolInvocations ?? [];

  const circuitPlanTool = toolInvocations.find((tool) => tool.toolName === 'generate_circuit_plan');
  const debugTool = toolInvocations.find((tool) => tool.toolName === 'generate_debug_checklist');
  const componentTool = toolInvocations.find((tool) => tool.toolName === 'lookup_component');
  const metricTool = toolInvocations.find(
    (tool) => tool.toolName === 'calculate_resistor' || tool.toolName === 'ohms_law'
  );

  const scene = (circuitPlanTool?.result.monitor_scene as MonitorScene | undefined) ?? undefined;
  const metricPanel =
    (metricTool?.result.monitor_metrics as MonitorMetricPanel | undefined) ?? undefined;
  const debugPanel =
    (debugTool?.result.monitor_debug as MonitorDebugPanel | undefined) ?? undefined;
  const diagramComponent =
    (componentTool?.result.monitor_diagram_component as string | undefined) ??
    scene?.focusComponent;

  const workspace =
    scene && latestUserPrompt && circuitPlanTool
      ? createWorkspaceFromScene(
          String(circuitPlanTool.result.title ?? 'Lesson scene'),
          latestUserPrompt,
          scene
        )
      : null;

  const analysis = workspace ? analyzeCircuit(workspace) : null;

  const lessonTitle = String(
    circuitPlanTool?.result.title ??
      debugTool?.result.title ??
      metricPanel?.title ??
      'Learning monitor'
  );

  const parts = Array.isArray(circuitPlanTool?.result.parts)
    ? circuitPlanTool?.result.parts.map(String)
    : [];
  const wiringSteps = Array.isArray(circuitPlanTool?.result.wiring_steps)
    ? circuitPlanTool?.result.wiring_steps.map(String)
    : [];
  const whyItWorks = Array.isArray(circuitPlanTool?.result.why_it_works)
    ? circuitPlanTool?.result.why_it_works.map(String)
    : [];
  const safetyNotes = Array.isArray(circuitPlanTool?.result.safety_notes)
    ? circuitPlanTool?.result.safety_notes.map(String)
    : [];
  const code =
    typeof circuitPlanTool?.result.code === 'string' ? circuitPlanTool.result.code : null;
  const debugChecks = Array.isArray(debugTool?.result.checks)
    ? debugTool?.result.checks.map(String)
    : [];
  const quickTest =
    typeof debugTool?.result.quickest_test === 'string' ? debugTool.result.quickest_test : null;

  const tabs: Array<{ key: 'scene' | 'guide' | 'inspect'; label: string; enabled: boolean }> = [
    {
      key: 'scene',
      label: 'Scene',
      enabled: Boolean(workspace || diagramComponent || metricPanel),
    },
    {
      key: 'guide',
      label: 'Guide',
      enabled:
        parts.length > 0 ||
        wiringSteps.length > 0 ||
        whyItWorks.length > 0 ||
        debugChecks.length > 0,
    },
    { key: 'inspect', label: 'Inspect', enabled: Boolean(analysis || metricPanel || debugPanel) },
  ];

  return (
    <aside className="flex h-full min-h-[38rem] flex-col rounded-3xl border border-zinc-800 bg-[#090d12] shadow-2xl shadow-black/20">
      <div className="border-b border-zinc-800 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] tracking-[0.22em] text-cyan-300/80 uppercase">
              learning monitor
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">{lessonTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              The monitor adapts to the lesson: scene, checklist, component reference, and
              explanation move with the conversation.
            </p>
          </div>
          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] tracking-[0.18em] text-cyan-200 uppercase">
            {isLoading ? 'updating' : 'live'}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tabs
            .filter((tab) => tab.enabled)
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  activeTab === tab.key
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                    : 'border-zinc-700 text-zinc-400 hover:border-cyan-500/20 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {activeTab === 'scene' ? (
          <div className="space-y-4">
            {workspace ? (
              <WorkbenchPreview
                nodes={workspace.nodes}
                connections={workspace.connections}
                mode={workspace.mode}
              />
            ) : metricPanel ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {metricPanel.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4"
                  >
                    <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                      {metric.label}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">{metric.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4 text-sm text-zinc-400">
                Ask Clitronic to explain or build a circuit and this monitor will open the relevant
                scene, diagram, and teaching artefacts next to the chat.
              </div>
            )}

            {diagramComponent ? <ComponentDiagramPreview componentKey={diagramComponent} /> : null}
          </div>
        ) : null}

        {activeTab === 'guide' ? (
          <div className="space-y-4">
            {parts.length > 0 ? (
              <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  Parts list
                </div>
                <div className="mt-3 space-y-2 text-sm text-zinc-200">
                  {parts.map((part) => (
                    <div
                      key={part}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                    >
                      {part}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {wiringSteps.length > 0 ? (
              <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  Wiring plan
                </div>
                <div className="mt-3 space-y-2 text-sm text-zinc-200">
                  {wiringSteps.map((step, index) => (
                    <div
                      key={step}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3"
                    >
                      <div className="text-[11px] tracking-[0.18em] text-cyan-300 uppercase">
                        Step {index + 1}
                      </div>
                      <div className="mt-2 leading-6">{step}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {whyItWorks.length > 0 ? (
              <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-[11px] tracking-[0.18em] text-emerald-300 uppercase">
                  Why this works
                </div>
                <div className="mt-3 space-y-2 text-sm text-emerald-50/90">
                  {whyItWorks.map((point) => (
                    <div
                      key={point}
                      className="rounded-xl border border-emerald-500/10 bg-black/20 px-3 py-2"
                    >
                      {point}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {debugChecks.length > 0 ? (
              <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="text-[11px] tracking-[0.18em] text-amber-300 uppercase">
                  Debug checklist
                </div>
                <div className="mt-3 space-y-2 text-sm text-amber-50/90">
                  {debugChecks.map((check, index) => (
                    <div
                      key={check}
                      className="rounded-xl border border-amber-500/10 bg-black/20 px-3 py-2"
                    >
                      {index + 1}. {check}
                    </div>
                  ))}
                </div>
                {quickTest ? (
                  <button
                    type="button"
                    onClick={() => onQuickPrompt(quickTest)}
                    className="mt-4 rounded-full border border-amber-500/20 bg-black/20 px-3 py-2 text-xs text-amber-100 transition hover:border-amber-400/30 hover:bg-amber-500/10"
                  >
                    use fastest next test
                  </button>
                ) : null}
              </section>
            ) : null}

            {safetyNotes.length > 0 ? (
              <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                <div className="text-[11px] tracking-[0.18em] text-rose-300 uppercase">
                  Safety notes
                </div>
                <div className="mt-3 space-y-2 text-sm text-rose-50/90">
                  {safetyNotes.map((note) => (
                    <div
                      key={note}
                      className="rounded-xl border border-rose-500/10 bg-black/20 px-3 py-2"
                    >
                      {note}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {code ? (
              <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  Starter code
                </div>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-sm text-zinc-100">
                  {code}
                </pre>
              </section>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'inspect' ? (
          <div className="space-y-4">
            {analysis && workspace ? (
              <TopologyMap
                nodes={workspace.nodes}
                connections={workspace.connections}
                analysis={analysis}
                onQuickCommand={onQuickPrompt}
              />
            ) : null}

            {metricPanel ? (
              <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  Calculation monitor
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {metricPanel.metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3"
                    >
                      <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                        {metric.label}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">{metric.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {debugPanel ? (
              <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                <div className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  {debugPanel.title}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {debugPanel.checks.map((check) => (
                    <div
                      key={check}
                      className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                    >
                      {check}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
