import { CURATED_PROFILES } from './profiles';
import type { CuratedProfile, ImageIntent, ScoredImage } from './types';

const ELECTRONICS_WORKBENCH_SCENE: CuratedProfile = {
  id: 'electronics-workbench-scene',
  intent: 'tool',
  aliases: [],
  preferredQuery: 'electronics workbench',
  relevanceTokens: [
    'electronics',
    'workbench',
    'oscilloscope',
    'soldering',
    'breadboard',
    'pegboard',
  ],
};

const NETWORK_PATCH_PANEL_SCENE: CuratedProfile = {
  id: 'network-patch-panel-scene',
  intent: 'connector',
  aliases: [],
  preferredQuery: 'network patch panel',
  relevanceTokens: ['network', 'patch', 'panel', 'ethernet', 'poe', 'cable'],
};

/**
 * Multi-object scenes need a retrieval query for the whole environment. Letting a
 * single component alias win turns an ESP32 bench into a jumper-wire product shot.
 */
export function getSceneProfile(input: string): CuratedProfile | null {
  const value = input.toLowerCase();
  const hasWorkbenchAnchor =
    /\b(oscilloscope|soldering station|bench psu|bench power supply)\b/.test(value);
  const hasWorkbenchContext =
    /\b(pegboard|component drawers?|breadboards?|jumper wires?|electronics workbenches?|electronics benches?)\b/.test(
      value
    );
  if (hasWorkbenchAnchor && hasWorkbenchContext) return ELECTRONICS_WORKBENCH_SCENE;

  const hasPatchPanel = /\bpatch panels?\b/.test(value);
  const hasNetworkContext =
    /\b(poe|ethernet|network closets?|structured media|cable labels?|service loops?)\b/.test(value);
  if (hasPatchPanel && hasNetworkContext) return NETWORK_PATCH_PANEL_SCENE;

  return null;
}

export function simplifyQuery(query: string): string {
  return query
    .replace(/\b(v\d+|r\d+|rev\s*\d+|kit|breakout|closeup|high\s*resolution|photo)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function preprocessImageQuery(query: string): string {
  const stripped = query
    .replace(/\b(show|me|a|an|the|please)\b/gi, ' ')
    .replace(/\b(photo|photos|picture|pictures|image|images|pic|pics)\s+of\b/gi, ' ')
    .replace(/\b(photo|photos|picture|pictures|image|images|pic|pics)\b/gi, ' ')
    .replace(/\bwhat\s+(?:does|do)\b/gi, ' ')
    .replace(/\blooks?\s+like\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = stripped.toLowerCase();
  const includesBoardLike =
    /\b(boards?|modules?|dev kit|development kit|development board|microcontroller)\b/i.test(
      stripped
    );
  if (/\b(arduino|esp32|esp8266|raspberry pi|pico|nodemcu|teensy)\b/i.test(stripped)) {
    return includesBoardLike ? stripped : `${stripped} board`;
  }

  if (
    !/\b(electronic|electronics|circuit|component|microcontroller|sensor|board|module)\b/i.test(
      lower
    )
  ) {
    return `${stripped} electronics component`;
  }

  return stripped;
}

export function detectImageIntent(input: string): ImageIntent {
  const value = input.toLowerCase();
  if (
    /\b(arduino|raspberry pi|esp32|esp8266|teensy|pico|nodemcu|dev kit|development board)\b/.test(
      value
    )
  ) {
    return 'board';
  }
  if (
    /\b(sensor|imu|accelerometer|gyroscope|ultrasonic|thermistor|dht|bmp|bme|lidar|encoder|joystick|ldr|photoresistor|soil|ina219|hx711|rtc|ds3231)\b/.test(
      value
    )
  ) {
    return 'sensor';
  }
  if (/\b(servo|stepper|motor|relay|buzzer|actuator)\b/.test(value)) {
    return 'actuator';
  }
  if (/\b(resistor|capacitor|inductor|potentiometer|led|diode)\b/.test(value)) {
    return 'passive';
  }
  if (
    /\b(multimeter|oscilloscope|logic analyzer|soldering|iron|hot air|bench power)\b/.test(value)
  ) {
    return 'tool';
  }
  if (/\b(connector|header|usb|gpio|dupont|jack|terminal block)\b/.test(value)) {
    return 'connector';
  }
  if (/\b(regulator|battery|power supply|buck|boost|charger)\b/.test(value)) {
    return 'power';
  }
  if (/\b(oled|lcd|display|e-ink|tft)\b/.test(value)) {
    return 'display';
  }
  if (/\b(atmega|stm32|chip|ic|integrated circuit|mcu)\b/.test(value)) {
    return 'chip';
  }
  return 'generic';
}

export function tuneQueryForIntent(query: string, intent: ImageIntent): string {
  switch (intent) {
    case 'board':
      return `${query} development board closeup`;
    case 'sensor':
      return `${query} sensor module closeup`;
    case 'actuator':
      return `${query} actuator module electronics closeup`;
    case 'passive':
      return `${query} electronics component macro closeup`;
    case 'tool':
      return `${query} electronics bench tool`;
    case 'connector':
      return `${query} connector electronics closeup`;
    case 'power':
      return `${query} power electronics module`;
    case 'display':
      return `${query} display module electronics`;
    case 'chip':
      return `${query} integrated circuit package`;
    default:
      return `${query} electronics`;
  }
}

export function getCuratedProfile(input: string): CuratedProfile | null {
  const lower = input.toLowerCase();
  let best: CuratedProfile | null = null;
  let bestScore = 0;

  for (const profile of CURATED_PROFILES) {
    for (const alias of profile.aliases) {
      const normalizedAlias = alias.toLowerCase().trim();
      if (!normalizedAlias) continue;
      const escapedAlias = normalizedAlias
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
      const aliasPattern = new RegExp(`(?:^|[^a-z0-9])${escapedAlias}(?=$|[^a-z0-9])`, 'i');
      if (!aliasPattern.test(lower)) continue;
      const isExact = lower === normalizedAlias;
      const score = normalizedAlias.length + (isExact ? 30 : 0);
      if (score > bestScore) {
        best = profile;
        bestScore = score;
      }
    }
  }

  return best;
}

export function extractSignalWords(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9+#-]+/)
    .filter((word) => word.length > 2)
    .slice(0, 12);
}

export function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function normalizeExcludedUrlKeys(rawExcludeParams: string[]): string[] {
  if (!rawExcludeParams.length) return [];
  const keys = new Set<string>();
  for (const value of rawExcludeParams) {
    const key = normalizeUrlKey(value);
    if (key) keys.add(key);
  }
  return [...keys].sort().slice(0, 12);
}

export function filterExcluded(results: ScoredImage[], excludeKeys: string[]): ScoredImage[] {
  if (excludeKeys.length === 0) return results;
  const excluded = new Set(excludeKeys);
  return results.filter((item) => !excluded.has(normalizeUrlKey(item.url)));
}

export function toImageCandidates(results: ScoredImage[], count: number) {
  return results.slice(0, count).map((item) => ({
    url: item.url,
    thumbnail: item.thumbnail,
    attribution: item.attribution,
    source: item.source,
  }));
}
