import type { LocalToolInvocation } from '@/lib/local-llm/tooling';

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function renderBulletSection(title: string, items: string[]) {
  if (items.length === 0) return null;

  return [title, ...items.map((item) => `- ${item}`)].join('\n');
}

function renderOrderedSection(title: string, items: string[]) {
  if (items.length === 0) return null;

  return [title, ...items.map((item, index) => `${index + 1}. ${item}`)].join('\n');
}

export function createGuidedToolReply(userMessage: string, toolInvocations: LocalToolInvocation[]) {
  const debugChecklistTool = toolInvocations.find(
    (tool) => tool.toolName === 'generate_debug_checklist'
  );
  if (debugChecklistTool) {
    const title = asString(debugChecklistTool.result.title) ?? 'LED debug checklist';
    const checks = Array.isArray(debugChecklistTool.result.checks)
      ? debugChecklistTool.result.checks.map(String)
      : [];
    const likelyCauses = Array.isArray(debugChecklistTool.result.likely_causes)
      ? debugChecklistTool.result.likely_causes.map(String)
      : [];
    const quickestTest = asString(debugChecklistTool.result.quickest_test);

    return [
      `## ${title}`,
      '',
      renderOrderedSection('### Debug checklist', checks),
      '',
      quickestTest ? `### Fastest next test\n${quickestTest}` : null,
      '',
      renderBulletSection('### Most likely causes', likelyCauses),
      '',
      'If you want, tell me **exactly what is happening** — for example `LED stays dark` or `Pi script runs but nothing blinks` — and I will narrow the diagnosis further.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const circuitPlanTool = toolInvocations.find((tool) => tool.toolName === 'generate_circuit_plan');
  if (circuitPlanTool) {
    const title = asString(circuitPlanTool.result.title) ?? 'Circuit plan';
    const platform = asString(circuitPlanTool.result.platform);
    const parts = Array.isArray(circuitPlanTool.result.parts)
      ? circuitPlanTool.result.parts.map(String)
      : [];
    const wiringSteps = Array.isArray(circuitPlanTool.result.wiring_steps)
      ? circuitPlanTool.result.wiring_steps.map(String)
      : [];
    const safetyNotes = Array.isArray(circuitPlanTool.result.safety_notes)
      ? circuitPlanTool.result.safety_notes.map(String)
      : [];
    const whyItWorks = Array.isArray(circuitPlanTool.result.why_it_works)
      ? circuitPlanTool.result.why_it_works.map(String)
      : [];
    const code = asString(circuitPlanTool.result.code);

    return [
      `## ${title}`,
      '',
      platform ? `**Platform:** ${platform}` : null,
      '',
      renderBulletSection('### Parts list', parts),
      '',
      renderOrderedSection('### Wiring plan', wiringSteps),
      '',
      renderBulletSection('### Why this works', whyItWorks),
      '',
      renderBulletSection('### Safety notes', safetyNotes),
      '',
      code ? ['### Starter code', '```', code, '```'].join('\n') : null,
      '',
      'If you want, I can next turn this into a **debug checklist**, a **plain-English explanation**, or a **slightly more advanced version**.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const resistorTool = toolInvocations.find((tool) => tool.toolName === 'calculate_resistor');
  if (resistorTool) {
    const resistance = asNumber(resistorTool.result.recommended_standard_ohms);
    const exact = asNumber(resistorTool.result.exact_value_ohms);
    const current = asNumber(resistorTool.result.estimated_current_ma_with_recommended);
    const power = asNumber(resistorTool.result.estimated_resistor_power_mw);

    return [
      resistance
        ? `Use a **${resistance} Ω** resistor as the safe first choice.`
        : 'Use the tool-backed resistor recommendation as the safe first choice.',
      '',
      renderBulletSection(
        '### Why',
        [
          exact !== undefined ? `The raw calculation comes out around **${exact} Ω**.` : '',
          resistance !== undefined
            ? `In practice you round **up** to a standard value, so **${resistance} Ω** is the cleaner beginner choice.`
            : '',
          current !== undefined
            ? `That gives roughly **${current} mA** through the LED, which is a sensible learning-friendly range.`
            : '',
          power !== undefined
            ? `Resistor dissipation is only about **${power} mW**, so a normal **1/4W resistor** is plenty.`
            : '',
        ].filter(Boolean)
      ),
      '',
      'If you want, I can next turn that into a **parts list + wiring plan** for Arduino, Raspberry Pi, or a plain breadboard build.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const ohmsLawTool = toolInvocations.find((tool) => tool.toolName === 'ohms_law');
  if (ohmsLawTool) {
    return [
      'Here is the tool-backed result:',
      '',
      ...Object.entries(ohmsLawTool.result).map(([key, value]) => {
        const label = key.replaceAll('_', ' ');
        return `- **${label}**: ${String(value)}`;
      }),
      '',
      'If you want, give me any two of voltage, current, and resistance and I will work out the third.',
    ].join('\n');
  }

  const componentTool = toolInvocations.find((tool) => tool.toolName === 'lookup_component');
  if (componentTool) {
    const name = asString(componentTool.result.name) ?? 'component';
    const description = asString(componentTool.result.description);
    const circuitExample = asString(componentTool.result.circuit_example);
    const pinout = asString(componentTool.result.pinout);
    const tips = asString(componentTool.result.tips);
    const keySpecs = Array.isArray(componentTool.result.key_specs)
      ? componentTool.result.key_specs.map(String)
      : [];

    const mentionsArduino = /arduino/i.test(userMessage);
    const mentionsRaspberryPi = /raspberry\s*pi|raspberrypi|pi\b/i.test(userMessage);

    return [
      `Here is the built-in note for **${name}**:`,
      '',
      description,
      '',
      renderBulletSection('### Key specs', keySpecs),
      '',
      circuitExample ? `### Typical use\n${circuitExample}` : null,
      '',
      pinout ? `### Pinout\n${pinout}` : null,
      '',
      tips ? `### Practical tip\n${tips}` : null,
      '',
      mentionsArduino
        ? 'For Arduino work, keep the wiring conservative and use the component example above as the starting pattern.'
        : null,
      mentionsRaspberryPi
        ? 'For Raspberry Pi GPIO, be even more careful with voltage and current limits than you would on Arduino.'
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const searchTool = toolInvocations.find((tool) => tool.toolName === 'search_components');
  if (searchTool) {
    const components = Array.isArray(searchTool.result.components)
      ? searchTool.result.components
      : [];

    return [
      `I found **${components.length}** built-in components in the current knowledge set:`,
      '',
      ...components.map((component) => {
        if (typeof component === 'object' && component !== null) {
          const name = 'name' in component ? String(component.name) : 'Unknown';
          const category = 'category' in component ? String(component.category) : 'unknown';
          return `- **${name}** — ${category}`;
        }

        return `- ${String(component)}`;
      }),
      '',
      'Ask about any one of them and I will pull the built-in notes for it.',
    ].join('\n');
  }

  return [
    'Guided electronics mode is active right now.',
    '',
    'It is strongest for:',
    '- resistor calculations',
    "- Ohm's law questions",
    '- component lookup',
    '- parts lists and wiring plans',
    '- first-pass debugging',
    '',
    'Try one of these:',
    '- `Help me build a simple Arduino LED breadboard circuit.`',
    '- `Help me build a Raspberry Pi LED circuit.`',
    '- `My Arduino LED circuit is not blinking. Give me a debug checklist.`',
  ].join('\n');
}
