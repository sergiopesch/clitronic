import type { CircuitNodeType } from '@/lib/circuit';

export type TeacherToolName =
  | 'lookup_component'
  | 'search_components'
  | 'calculate_resistor'
  | 'ohms_law'
  | 'generate_circuit_plan'
  | 'generate_debug_checklist';

export type TeacherToolInvocation = {
  toolName: TeacherToolName;
  summary: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type TeacherSectionKind =
  | 'parts'
  | 'wiring'
  | 'concepts'
  | 'safety'
  | 'starter-code'
  | 'reference'
  | 'limitations';

export type TeacherSection = {
  id: string;
  title: string;
  kind: TeacherSectionKind;
  items?: string[];
  code?: string;
};

export type TeacherSceneState = {
  title: string;
  description: string;
  honesty: 'illustrative' | 'calculated';
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

export type TeacherMetricPanel = {
  title: string;
  metrics: Array<{ label: string; value: string }>;
};

export type TeacherDebugState = {
  title: string;
  checks: string[];
  likelyCauses?: string[];
  quickestTest?: string;
};

export type TeacherComponentReference = {
  id?: string;
  name: string;
  category?: string;
  description?: string;
  keySpecs: string[];
  circuitExample?: string;
  pinout?: string;
  tips?: string;
};

export type TeacherCapabilityNote = {
  label: string;
  status: 'active' | 'limited';
  detail: string;
};

export type TeacherState = {
  title: string;
  topic: string;
  mode: 'local-model' | 'guided-tools';
  stage: 'explaining' | 'planning' | 'calculating' | 'debugging' | 'referencing';
  summary: string;
  sections: TeacherSection[];
  scene?: TeacherSceneState;
  calculations?: TeacherMetricPanel;
  debug?: TeacherDebugState;
  component?: TeacherComponentReference;
  capabilities: TeacherCapabilityNote[];
  suggestedPrompts: string[];
  sourceTools: TeacherToolName[];
};

function toLines(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function summarizePrompt(prompt?: string) {
  if (!prompt) return 'electronics lesson';
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function extractMonitorMetrics(result: Record<string, unknown>) {
  const panel = result.monitor_metrics;
  if (!panel || typeof panel !== 'object') return undefined;

  const title = toString((panel as { title?: unknown }).title) ?? 'Calculation monitor';
  const metrics = Array.isArray((panel as { metrics?: unknown[] }).metrics)
    ? ((panel as { metrics?: Array<{ label?: unknown; value?: unknown }> }).metrics ?? [])
        .map((metric) => {
          const label = toString(metric.label);
          const value = toString(metric.value);
          if (!label || !value) return null;
          return { label, value };
        })
        .filter((metric): metric is { label: string; value: string } => metric !== null)
    : [];

  return metrics.length > 0 ? { title, metrics } : undefined;
}

function extractMonitorScene(result: Record<string, unknown>, title: string) {
  const scene = result.monitor_scene;
  if (!scene || typeof scene !== 'object') return undefined;

  const components = Array.isArray((scene as { components?: unknown[] }).components)
    ? (
        (
          scene as {
            components?: Array<{ id?: unknown; label?: unknown; type?: unknown }>;
          }
        ).components ?? []
      )
        .map((component) => {
          const id = toString(component.id);
          const label = toString(component.label);
          const type = toString(component.type) as CircuitNodeType | undefined;
          if (!id || !label || !type) return null;
          return { id, label, type };
        })
        .filter(
          (component): component is { id: string; label: string; type: CircuitNodeType } =>
            component !== null
        )
    : [];

  const connections = Array.isArray((scene as { connections?: unknown[] }).connections)
    ? (
        (
          scene as {
            connections?: Array<{
              id?: unknown;
              from?: unknown;
              to?: unknown;
              kind?: unknown;
              label?: unknown;
            }>;
          }
        ).connections ?? []
      )
        .map((connection) => {
          const id = toString(connection.id);
          const from = toString(connection.from);
          const to = toString(connection.to);
          const kind = toString(connection.kind) as 'explicit' | 'inferred' | undefined;
          if (!id || !from || !to || !kind) return null;
          const label = toString(connection.label);

          return {
            id,
            from,
            to,
            kind,
            ...(label ? { label } : {}),
          };
        })
        .filter(
          (
            connection
          ): connection is {
            id: string;
            from: string;
            to: string;
            kind: 'explicit' | 'inferred';
            label?: string;
          } => connection !== null
        )
    : [];

  if (components.length === 0 || connections.length === 0) return undefined;

  return {
    title,
    description:
      'This is an illustrative circuit scene driven by the current lesson state. It shows intended wiring, not a live electrical simulation.',
    honesty: 'illustrative' as const,
    components,
    connections,
    focusComponent: toString((scene as { focusComponent?: unknown }).focusComponent),
  };
}

function createBaseCapabilities(mode: TeacherState['mode']): TeacherCapabilityNote[] {
  return [
    {
      label: 'Beginner explanations',
      status: 'active',
      detail:
        'Clitronic can explain parts, wiring, and first-principles reasoning in plain language.',
    },
    {
      label: 'Adaptive monitor',
      status: 'active',
      detail:
        'The monitor follows structured lesson state: scene, calculations, reference notes, and debug guidance.',
    },
    {
      label: mode === 'guided-tools' ? 'Guided planning tools' : 'Local model path',
      status: 'active',
      detail:
        mode === 'guided-tools'
          ? 'Guided mode can reliably handle circuit plans, resistor picks, component notes, and first-pass debug checklists.'
          : 'The local-model path stays available for open-ended explanation and uses local tool context when present.',
    },
    {
      label: 'Simulation honesty',
      status: 'limited',
      detail:
        'This monitor can show illustrative scene state and calculation panels, but it does not claim live circuit simulation unless a real simulator is wired in.',
    },
  ];
}

function mergeSections(base: TeacherSection[], next: TeacherSection[]) {
  const merged = new Map<string, TeacherSection>();

  for (const section of base) {
    merged.set(section.kind, section);
  }

  for (const section of next) {
    merged.set(section.kind, section);
  }

  return Array.from(merged.values());
}

function mergeCapabilities(base: TeacherCapabilityNote[], next: TeacherCapabilityNote[]) {
  const merged = new Map<string, TeacherCapabilityNote>();

  for (const note of base) {
    merged.set(note.label, note);
  }

  for (const note of next) {
    merged.set(note.label, note);
  }

  return Array.from(merged.values());
}

export function mergeTeacherStates(
  previous: TeacherState | undefined,
  next: TeacherState | undefined
): TeacherState | undefined {
  if (!previous) return next;
  if (!next) return previous;

  return {
    ...previous,
    ...next,
    sections: mergeSections(previous.sections, next.sections),
    scene: next.scene ?? previous.scene,
    calculations: next.calculations ?? previous.calculations,
    debug: next.debug ?? previous.debug,
    component: next.component ?? previous.component,
    capabilities: mergeCapabilities(previous.capabilities, next.capabilities),
    suggestedPrompts:
      next.suggestedPrompts.length > 0 ? next.suggestedPrompts : previous.suggestedPrompts,
    sourceTools: Array.from(new Set([...previous.sourceTools, ...next.sourceTools])),
  };
}

export function buildTeacherState({
  mode,
  userMessage,
  assistantMessage,
  toolInvocations,
}: {
  mode: TeacherState['mode'];
  userMessage?: string;
  assistantMessage?: string;
  toolInvocations: TeacherToolInvocation[];
}): TeacherState {
  const sourceTools = toolInvocations.map((invocation) => invocation.toolName);
  const sections: TeacherSection[] = [];
  const capabilities = createBaseCapabilities(mode);
  const suggestedPrompts: string[] = [];
  const fallbackTopic = summarizePrompt(userMessage);

  let title = 'Learning monitor';
  let topic = fallbackTopic;
  let stage: TeacherState['stage'] = 'explaining';
  let summary =
    assistantMessage?.split('\n').find((line) => line.trim()) ??
    'Clitronic is ready to explain beginner electronics topics and update the monitor when structured lesson state is available.';
  let scene: TeacherState['scene'];
  let calculations: TeacherState['calculations'];
  let debug: TeacherState['debug'];
  let component: TeacherState['component'];

  for (const invocation of toolInvocations) {
    if (invocation.toolName === 'generate_circuit_plan') {
      title = toString(invocation.result.title) ?? title;
      topic = title;
      stage = 'planning';
      summary = invocation.summary;

      const parts = toLines(invocation.result.parts);
      const wiring = toLines(invocation.result.wiring_steps);
      const concepts = toLines(invocation.result.why_it_works);
      const safety = toLines(invocation.result.safety_notes);
      const code = toString(invocation.result.code);

      if (parts.length > 0) {
        sections.push({ id: 'parts', title: 'Parts list', kind: 'parts', items: parts });
      }
      if (wiring.length > 0) {
        sections.push({ id: 'wiring', title: 'Wiring plan', kind: 'wiring', items: wiring });
      }
      if (concepts.length > 0) {
        sections.push({
          id: 'concepts',
          title: 'Why it works',
          kind: 'concepts',
          items: concepts,
        });
      }
      if (safety.length > 0) {
        sections.push({ id: 'safety', title: 'Safety notes', kind: 'safety', items: safety });
      }
      if (code) {
        sections.push({ id: 'starter-code', title: 'Starter code', kind: 'starter-code', code });
      }

      scene = extractMonitorScene(invocation.result, title);
      suggestedPrompts.push(
        'Turn this into a debug checklist.',
        'Explain why the resistor matters here.',
        'Show me the likely mistakes beginners make with this circuit.'
      );
    }

    if (invocation.toolName === 'generate_debug_checklist') {
      title = toString(invocation.result.title) ?? title;
      topic = title;
      stage = 'debugging';
      summary = invocation.summary;

      const checks = toLines(invocation.result.checks);
      const likelyCauses = toLines(invocation.result.likely_causes);
      const quickestTest = toString(invocation.result.quickest_test);

      debug = {
        title: toString(invocation.result.title) ?? 'Debug checklist',
        checks,
        likelyCauses: likelyCauses.length > 0 ? likelyCauses : undefined,
        quickestTest,
      };

      if (checks.length > 0) {
        sections.push({
          id: 'debug-reference',
          title: 'Debug checklist',
          kind: 'reference',
          items: checks,
        });
      }

      if (likelyCauses.length > 0) {
        sections.push({
          id: 'debug-limitations',
          title: 'Most likely causes',
          kind: 'limitations',
          items: likelyCauses,
        });
      }

      if (quickestTest) {
        suggestedPrompts.push(quickestTest);
      }
    }

    if (invocation.toolName === 'calculate_resistor' || invocation.toolName === 'ohms_law') {
      if (stage !== 'debugging' && !sourceTools.includes('generate_circuit_plan')) {
        stage = 'calculating';
      }
      title =
        calculations?.title ??
        toString((invocation.result.monitor_metrics as { title?: unknown } | undefined)?.title) ??
        title;
      topic = fallbackTopic;
      summary = invocation.summary;
      calculations = extractMonitorMetrics(invocation.result);
      suggestedPrompts.push(
        'Explain the calculation in beginner-friendly terms.',
        'Apply that value to a simple LED wiring plan.'
      );
    }

    if (invocation.toolName === 'lookup_component') {
      if (stage === 'explaining') {
        stage = 'referencing';
      }

      const name = toString(invocation.result.name) ?? 'Component reference';
      component = {
        id: toString(invocation.result.monitor_diagram_component),
        name,
        category: toString(invocation.result.category),
        description: toString(invocation.result.description),
        keySpecs: toLines(invocation.result.key_specs),
        circuitExample: toString(invocation.result.circuit_example),
        pinout: toString(invocation.result.pinout),
        tips: toString(invocation.result.tips),
      };

      if (!title || title === 'Learning monitor') {
        title = name;
      }

      topic = name;
      summary = invocation.summary;
      suggestedPrompts.push(
        `Show me a beginner circuit using ${name}.`,
        `Explain why ${name} behaves that way.`
      );
    }

    if (invocation.toolName === 'search_components') {
      const components = Array.isArray(invocation.result.components)
        ? invocation.result.components
            .map((entry) => {
              if (!entry || typeof entry !== 'object') return null;
              const name = toString((entry as { name?: unknown }).name);
              const category = toString((entry as { category?: unknown }).category);
              if (!name) return null;
              return category ? `${name} (${category})` : name;
            })
            .filter((entry): entry is string => entry !== null)
        : [];

      if (components.length > 0) {
        sections.push({
          id: 'component-list',
          title: 'Available built-in parts',
          kind: 'reference',
          items: components,
        });
      }
    }
  }

  return {
    title,
    topic,
    mode,
    stage,
    summary,
    sections,
    scene,
    calculations,
    debug,
    component,
    capabilities,
    suggestedPrompts: Array.from(new Set(suggestedPrompts)),
    sourceTools,
  };
}
