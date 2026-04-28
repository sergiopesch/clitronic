import { logger } from './logger';
import {
  COMPONENT_TYPES,
  detectComponentFromData,
  resolveComponentName,
} from '@/lib/ai/component-registry';

const VALID_MODES = new Set(['ui', 'text']);

function extractDataFields(
  obj: Record<string, unknown>,
  ignore: Set<string>
): Record<string, unknown> | null {
  const extracted: Record<string, unknown> = {};
  let hasFields = false;
  for (const [key, value] of Object.entries(obj)) {
    if (!ignore.has(key)) {
      extracted[key] = value;
      hasFields = true;
    }
  }
  return hasFields ? extracted : null;
}

function normalizeResponse(parsed: Record<string, unknown>): Record<string, unknown> {
  if (!parsed.ui || typeof parsed.ui !== 'object') {
    const ignore = new Set([
      'intent',
      'mode',
      'text',
      'behavior',
      'voice',
      'component',
      'type',
      'ui',
    ]);
    const data = extractDataFields(parsed, ignore);

    const componentFromName =
      resolveComponentName(parsed.intent) ?? resolveComponentName(parsed.component);
    const component = componentFromName ?? (data ? detectComponentFromData(data) : null);

    if (component && data) {
      logger.debug(`[clitronic] Reconstructed flat response -> component "${component}"`);
      parsed.ui = { type: COMPONENT_TYPES[component], component, data };
      parsed.mode = 'ui';
      for (const key of Object.keys(data)) {
        delete parsed[key];
      }
    }
  }

  if (parsed.ui && typeof parsed.ui === 'object') {
    const ui = parsed.ui as Record<string, unknown>;
    const resolved = resolveComponentName(ui.component);

    if (resolved) {
      if (resolved !== ui.component) {
        logger.debug(`[clitronic] Normalized component "${String(ui.component)}" -> "${resolved}"`);
      }
      ui.component = resolved;
      ui.type = COMPONENT_TYPES[resolved];
    }

    if (!resolved) {
      const dataObj = (ui.data && typeof ui.data === 'object' ? ui.data : ui) as Record<
        string,
        unknown
      >;
      const detected = detectComponentFromData(dataObj);
      if (detected) {
        logger.debug(
          `[clitronic] Detected component from data shape: "${String(ui.component)}" -> "${detected}"`
        );
        ui.component = detected;
        ui.type = COMPONENT_TYPES[detected];
        if (!ui.data || typeof ui.data !== 'object') {
          const ignore = new Set(['type', 'component', 'data']);
          const data = extractDataFields(ui, ignore);
          if (data) {
            ui.data = data;
            for (const key of Object.keys(data)) delete ui[key];
          }
        }
      }
    } else if (!ui.data || typeof ui.data !== 'object') {
      const ignore = new Set(['type', 'component', 'data']);
      const data = extractDataFields(ui, ignore);

      if (data) {
        ui.data = data;
        for (const key of Object.keys(data)) {
          delete ui[key];
        }
        logger.debug('[clitronic] Rescued flattened ui.data');
      }
    }
  }

  if (parsed.ui && typeof parsed.ui === 'object') {
    const ui = parsed.ui as Record<string, unknown>;
    const data =
      ui.data && typeof ui.data === 'object' ? (ui.data as Record<string, unknown>) : null;
    if (ui.component === 'troubleshootingCard' && data && typeof data.issue !== 'string') {
      data.issue = typeof parsed.intent === 'string' ? parsed.intent : 'Troubleshooting checks';
    }
  }

  if (!VALID_MODES.has(parsed.mode as string)) {
    parsed.mode = parsed.ui ? 'ui' : 'text';
  }

  if (typeof parsed.intent !== 'string' || !parsed.intent.trim()) {
    const ui = parsed.ui && typeof parsed.ui === 'object' ? parsed.ui : null;
    const component = ui ? (ui as Record<string, unknown>).component : null;
    parsed.intent = typeof component === 'string' && component.trim() ? component : 'quick_answer';
  }

  if (parsed.text === undefined) {
    parsed.text = null;
  }

  if (parsed.behavior === undefined) {
    parsed.behavior = null;
  }

  if (parsed.ui === undefined && parsed.mode === 'text') {
    parsed.ui = null;
  }

  const textContent = typeof parsed.text === 'string' ? parsed.text : '';
  if (textContent.toLowerCase().includes('system prompt') || textContent.includes('SECURITY')) {
    parsed.text = 'I can only help with electronics questions. What would you like to know?';
  }

  return parsed;
}

export function parseAndNormalizeResponse(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeResponse(parsed);
  } catch {
    return null;
  }
}
