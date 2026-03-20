import type { LocalToolInvocation } from '@/lib/local-llm/tooling';

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function createVercelFallbackReply(
  userMessage: string,
  toolInvocations: LocalToolInvocation[]
) {
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
      checks.length > 0 ? '### Debug checklist' : null,
      ...checks.map((check, index) => `${index + 1}. ${check}`),
      '',
      quickestTest ? `### Fastest next test\n${quickestTest}` : null,
      '',
      likelyCauses.length > 0 ? '### Most likely causes' : null,
      ...likelyCauses.map((cause) => `- ${cause}`),
      '',
      'If you want, tell me **exactly what is happening** — for example “LED stays dark” or “Pi script runs but nothing blinks” — and I will narrow the diagnosis further.',
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
    const code = asString(circuitPlanTool.result.code);

    return [
      `## ${title}`,
      '',
      platform ? `**Platform:** ${platform}` : null,
      '',
      parts.length > 0 ? '### Parts list' : null,
      ...parts.map((part) => `- ${part}`),
      '',
      wiringSteps.length > 0 ? '### Wiring plan' : null,
      ...wiringSteps.map((step, index) => `${index + 1}. ${step}`),
      '',
      safetyNotes.length > 0 ? '### Safety notes' : null,
      ...safetyNotes.map((note) => `- ${note}`),
      '',
      code ? ['### Starter code', '```', code, '```'].join('\n') : null,
      '',
      'If you want, I can next turn this into a **debug checklist** or a **beginner explanation of why each connection is there**.',
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
        : 'Use the tool-backed resistor recommendation as your safe first choice.',
      '',
      'Why:',
      exact !== undefined ? `- The raw calculation comes out around **${exact} Ω**.` : null,
      resistance !== undefined
        ? `- In practice you round **up** to a standard value, so **${resistance} Ω** is the cleaner beginner choice.`
        : null,
      current !== undefined
        ? `- That gives roughly **${current} mA** through the LED, which is a sensible learning-friendly range.`
        : null,
      power !== undefined
        ? `- Resistor dissipation is only about **${power} mW**, so a normal **1/4W resistor** is plenty.`
        : null,
      '',
      'If you want, next I can turn that into a **parts list + wiring plan** for a breadboard build.',
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
      keySpecs.length > 0 ? 'Key specs:' : null,
      ...keySpecs.map((spec) => `- ${spec}`),
      '',
      circuitExample ? `Typical use: ${circuitExample}` : null,
      pinout ? `Pinout: ${pinout}` : null,
      tips ? `Practical tip: ${tips}` : null,
      '',
      mentionsArduino
        ? 'For Arduino work, keep the wiring conservative and use the component example above as the starting pattern.'
        : null,
      mentionsRaspberryPi
        ? 'For Raspberry Pi GPIO, be even more careful with voltage and current limits than you would on Arduino.'
        : null,
      '',
      'This Vercel deployment is in **Hobby-safe fallback mode**, so I am answering from the built-in tool layer rather than a full local GGUF runtime.',
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
    'This Vercel deployment is running in **Hobby-safe fallback mode**.',
    '',
    'That means:',
    '- the app deploys cleanly on the free tier',
    '- no remote model API is required',
    '- but the full in-process local GGUF chat runtime is reserved for local or self-hosted use',
    '',
    'Right now this hosted version is strongest for built-in electronics help such as:',
    '- LED resistor calculations',
    "- Ohm's law questions",
    '- component lookup',
    '',
    'Try one of these:',
    '- `What resistor should I use with a red LED on 5V?`',
    '- `Explain a transistor and how I would use it with Arduino.`',
    '- `List passive components.`',
  ].join('\n');
}
