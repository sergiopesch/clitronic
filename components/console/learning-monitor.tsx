'use client';

import { useState } from 'react';
import {
  analyzeCircuit,
  syncCircuitDocument,
  type CircuitConnection,
  type CircuitDocument,
  type CircuitNode,
} from '@/lib/circuit';
import type { TeacherSceneState, TeacherState } from '@/lib/teacher-state';
import {
  ComponentDiagramPreview,
  TopologyMap,
  WorkbenchPreview,
} from '@/components/studio/previews';

type LearningMonitorProps = {
  teacherState?: TeacherState;
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
  scene: TeacherSceneState
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

function getSection(state: TeacherState | undefined, kind: string) {
  return state?.sections.find((section) => section.kind === kind);
}

export function LearningMonitor({ teacherState, isLoading, onQuickPrompt }: LearningMonitorProps) {
  const [activeTab, setActiveTab] = useState<'scene' | 'guide' | 'inspect'>('scene');

  const scene = teacherState?.scene;
  const calculations = teacherState?.calculations;
  const debug = teacherState?.debug;
  const component = teacherState?.component;
  const diagramComponent = component?.id ?? scene?.focusComponent;
  const workspace = scene
    ? createWorkspaceFromScene(
        teacherState?.title ?? 'Lesson scene',
        teacherState?.topic ?? '',
        scene
      )
    : null;
  const analysis = workspace ? analyzeCircuit(workspace) : null;

  const parts = getSection(teacherState, 'parts')?.items ?? [];
  const wiringSteps = getSection(teacherState, 'wiring')?.items ?? [];
  const whyItWorks = getSection(teacherState, 'concepts')?.items ?? [];
  const safetyNotes = getSection(teacherState, 'safety')?.items ?? [];
  const code = getSection(teacherState, 'starter-code')?.code ?? null;

  const tabs: Array<{ key: 'scene' | 'guide' | 'inspect'; label: string; enabled: boolean }> = [
    {
      key: 'scene',
      label: 'Scene',
      enabled: Boolean(workspace || diagramComponent || calculations),
    },
    {
      key: 'guide',
      label: 'Guide',
      enabled:
        parts.length > 0 ||
        wiringSteps.length > 0 ||
        whyItWorks.length > 0 ||
        safetyNotes.length > 0 ||
        Boolean(code) ||
        Boolean(component) ||
        Boolean(debug?.checks.length),
    },
    {
      key: 'inspect',
      label: 'Inspect',
      enabled: Boolean(analysis || calculations || debug || teacherState?.capabilities.length),
    },
  ];

  return (
    <aside className="flex h-full min-h-[38rem] flex-col rounded-xl border border-border bg-surface-1">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] tracking-widest text-accent/80 uppercase">
              learning monitor
            </div>
            <h2 className="mt-2 text-sm font-semibold text-text-primary">
              {teacherState?.title ?? 'Learning monitor'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {teacherState?.summary ??
                'The monitor follows lesson state from the chat: scene, reference notes, calculations, and debug guidance.'}
            </p>
          </div>
          <div className="rounded-full border border-accent/20 bg-accent/8 px-2.5 py-1 text-[11px] tracking-wider text-accent uppercase">
            {isLoading ? 'updating' : 'live'}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tabs
            .filter((tab) => tab.enabled)
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  activeTab === tab.key
                    ? 'border-accent/30 bg-accent/8 text-accent'
                    : 'border-border text-text-muted hover:border-border-accent hover:text-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'scene' && (
          <div className="space-y-3">
            {workspace ? (
              <div className="space-y-3">
                <WorkbenchPreview
                  nodes={workspace.nodes}
                  connections={workspace.connections}
                  mode={workspace.mode}
                />
                <div className="rounded-lg border border-border bg-surface-0/40 p-3 text-sm text-text-secondary">
                  <div className="text-[11px] tracking-wider text-text-muted uppercase">
                    Scene status
                  </div>
                  <p className="mt-1.5 leading-relaxed">{scene?.description}</p>
                </div>
              </div>
            ) : calculations ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {calculations.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-accent/15 bg-accent/5 p-3"
                  >
                    <div className="text-[11px] tracking-wider text-text-muted uppercase">
                      {metric.label}
                    </div>
                    <div className="mt-1.5 text-lg font-semibold text-text-primary">
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface-0/40 p-3 text-sm text-text-muted">
                Ask Clitronic to explain or build a circuit and this monitor will open the relevant
                scene, diagram, and teaching artefacts next to the chat.
              </div>
            )}

            {diagramComponent && <ComponentDiagramPreview componentKey={diagramComponent} />}
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="space-y-3">
            {parts.length > 0 && (
              <MonitorSection title="Parts list">
                {parts.map((part) => (
                  <div key={part} className="rounded-lg border border-border bg-surface-0/40 px-3 py-2 text-sm text-text-secondary">
                    {part}
                  </div>
                ))}
              </MonitorSection>
            )}

            {wiringSteps.length > 0 && (
              <MonitorSection title="Wiring plan">
                {wiringSteps.map((step, index) => (
                  <div key={step} className="rounded-lg border border-border bg-surface-0/40 px-3 py-2.5">
                    <div className="text-[11px] tracking-wider text-accent uppercase">
                      Step {index + 1}
                    </div>
                    <div className="mt-1 text-sm leading-relaxed text-text-secondary">{step}</div>
                  </div>
                ))}
              </MonitorSection>
            )}

            {whyItWorks.length > 0 && (
              <MonitorSection title="Why this works" accent="success">
                {whyItWorks.map((point) => (
                  <div key={point} className="rounded-lg border border-success/15 bg-success/5 px-3 py-2 text-sm text-success/90">
                    {point}
                  </div>
                ))}
              </MonitorSection>
            )}

            {component && (
              <MonitorSection title="Component reference" accent="accent">
                <div className="text-sm">
                  <div className="font-medium text-text-primary">{component.name}</div>
                  {component.description && (
                    <p className="mt-1.5 leading-relaxed text-text-secondary">{component.description}</p>
                  )}
                  {component.keySpecs.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {component.keySpecs.map((spec) => (
                        <div key={spec} className="rounded-lg border border-accent/10 bg-surface-0/40 px-3 py-2 text-text-secondary">
                          {spec}
                        </div>
                      ))}
                    </div>
                  )}
                  {component.pinout && (
                    <div className="mt-2 rounded-lg border border-border bg-surface-0/40 px-3 py-2 text-text-secondary">
                      <span className="text-text-muted">Pinout:</span> {component.pinout}
                    </div>
                  )}
                  {component.tips && (
                    <div className="mt-2 rounded-lg border border-border bg-surface-0/40 px-3 py-2 text-text-secondary">
                      <span className="text-text-muted">Tip:</span> {component.tips}
                    </div>
                  )}
                </div>
              </MonitorSection>
            )}

            {debug?.checks.length ? (
              <MonitorSection title="Debug checklist" accent="warning">
                {debug.checks.map((check, index) => (
                  <div key={check} className="rounded-lg border border-warning/15 bg-warning/5 px-3 py-2 text-sm text-warning/90">
                    {index + 1}. {check}
                  </div>
                ))}
                {debug.quickestTest && (
                  <button
                    type="button"
                    onClick={() => onQuickPrompt(debug.quickestTest!)}
                    className="mt-2 rounded-lg border border-warning/20 bg-surface-0/40 px-3 py-2 text-xs text-warning transition hover:border-warning/40"
                  >
                    use fastest next test
                  </button>
                )}
              </MonitorSection>
            ) : null}

            {safetyNotes.length > 0 && (
              <MonitorSection title="Safety notes" accent="error">
                {safetyNotes.map((note) => (
                  <div key={note} className="rounded-lg border border-error/15 bg-error/5 px-3 py-2 text-sm text-error/90">
                    {note}
                  </div>
                ))}
              </MonitorSection>
            )}

            {code && (
              <MonitorSection title="Starter code">
                <pre className="overflow-x-auto rounded-lg bg-surface-0/60 p-3 text-sm text-text-primary">
                  {code}
                </pre>
              </MonitorSection>
            )}
          </div>
        )}

        {activeTab === 'inspect' && (
          <div className="space-y-3">
            {analysis && workspace && (
              <TopologyMap
                nodes={workspace.nodes}
                connections={workspace.connections}
                analysis={analysis}
                onQuickCommand={onQuickPrompt}
              />
            )}

            {calculations && (
              <MonitorSection title="Calculation monitor">
                <div className="grid gap-2 sm:grid-cols-2">
                  {calculations.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-border bg-surface-0/40 px-3 py-2.5">
                      <div className="text-[11px] tracking-wider text-text-muted uppercase">{metric.label}</div>
                      <div className="mt-1 text-lg font-semibold text-text-primary">{metric.value}</div>
                    </div>
                  ))}
                </div>
              </MonitorSection>
            )}

            {debug && (
              <MonitorSection title={debug.title}>
                <div className="flex flex-wrap gap-1.5">
                  {debug.checks.map((check) => (
                    <div key={check} className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary">
                      {check}
                    </div>
                  ))}
                </div>
                {debug.likelyCauses?.length ? (
                  <div className="mt-3 space-y-1.5">
                    {debug.likelyCauses.map((cause) => (
                      <div key={cause} className="rounded-lg border border-warning/10 bg-warning/5 px-3 py-2 text-sm text-warning/90">
                        {cause}
                      </div>
                    ))}
                  </div>
                ) : null}
              </MonitorSection>
            )}

            {teacherState?.capabilities.length ? (
              <MonitorSection title="Capability status">
                {teacherState.capabilities.map((capability) => (
                  <div key={capability.label} className="rounded-lg border border-border bg-surface-0/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-text-primary">{capability.label}</div>
                      <div
                        className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${
                          capability.status === 'active'
                            ? 'border-success/20 bg-success/8 text-success'
                            : 'border-warning/20 bg-warning/8 text-warning'
                        }`}
                      >
                        {capability.status}
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{capability.detail}</p>
                  </div>
                ))}
              </MonitorSection>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function MonitorSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: 'accent' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const borderClass = accent
    ? `border-${accent}/15`
    : 'border-border';
  const bgClass = accent
    ? `bg-${accent}/5`
    : 'bg-surface-0/20';

  return (
    <section className={`rounded-lg border ${borderClass} ${bgClass} p-3`}>
      <div className="mb-2 text-[11px] tracking-wider text-text-muted uppercase">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
