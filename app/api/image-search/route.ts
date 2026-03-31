import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ScoredImage {
  url: string;
  thumbnail?: string;
  attribution: string;
  source: 'brave' | 'wikimedia';
  score: number;
}

/** Minimum score to consider a result "confident" (skip retry). */
const CONFIDENCE_THRESHOLD = 2;
const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const IMAGE_CACHE_MAX_ENTRIES = 300;
const IMAGE_CACHE = new Map<string, { expiresAt: number; payload: ImageSearchResponse }>();

interface ImageSearchResponse {
  url: string | null;
  thumbnail?: string;
  attribution?: string;
  source?: 'brave' | 'wikimedia';
  score?: number;
  confident: boolean;
  queryUsed?: string;
  images?: {
    url: string;
    thumbnail?: string;
    attribution?: string;
    source?: 'brave' | 'wikimedia';
  }[];
}

type ImageIntent =
  | 'board'
  | 'sensor'
  | 'actuator'
  | 'passive'
  | 'tool'
  | 'connector'
  | 'power'
  | 'display'
  | 'chip'
  | 'generic';

interface CuratedProfile {
  id: string;
  intent: ImageIntent;
  aliases: string[];
  preferredQuery: string;
  fallbackQuery?: string;
  relevanceTokens: string[];
}

const ELECTRONICS_TERMS = [
  'arduino',
  'raspberry',
  'esp32',
  'esp8266',
  'microcontroller',
  'development',
  'board',
  'breadboard',
  'resistor',
  'capacitor',
  'transistor',
  'diode',
  'sensor',
  'module',
  'pcb',
  'solder',
  'multimeter',
  'oscilloscope',
  'connector',
  'voltage',
  'current',
  'gpio',
  'electronic',
  'electronics',
];

const LOW_SIGNAL_TERMS = [
  'logo',
  'icon',
  'clipart',
  'vector',
  'emoji',
  'symbol',
  'wallpaper',
  'poster',
  'sticker',
  'meme',
  'cartoon',
  'drawing',
  '3d render',
  'mockup',
  'toy',
];

const CURATED_PROFILES: CuratedProfile[] = [
  {
    id: 'arduino-uno',
    intent: 'board',
    aliases: ['arduino uno', 'uno r3', 'arduino r3', 'arduino'],
    preferredQuery: 'arduino uno r3 development board closeup photo',
    fallbackQuery: 'arduino uno board',
    relevanceTokens: ['arduino', 'uno', 'r3', 'board', 'microcontroller'],
  },
  {
    id: 'esp32-devkit',
    intent: 'board',
    aliases: ['esp32', 'esp32 devkit', 'esp32 wroom', 'esp32 board'],
    preferredQuery: 'esp32 devkit v1 development board closeup',
    fallbackQuery: 'esp32 development board',
    relevanceTokens: ['esp32', 'devkit', 'board', 'wroom', 'module'],
  },
  {
    id: 'raspberry-pi-4',
    intent: 'board',
    aliases: ['raspberry pi 4', 'rpi 4', 'pi 4', 'raspberry pi'],
    preferredQuery: 'raspberry pi 4 model b board closeup',
    fallbackQuery: 'raspberry pi board',
    relevanceTokens: ['raspberry', 'pi', 'model', 'board', 'ports'],
  },
  {
    id: 'breadboard',
    intent: 'connector',
    aliases: ['breadboard', 'solderless breadboard'],
    preferredQuery: 'solderless breadboard closeup electronics',
    fallbackQuery: 'breadboard prototyping board',
    relevanceTokens: ['breadboard', 'solderless', 'prototyping'],
  },
  {
    id: 'multimeter',
    intent: 'tool',
    aliases: ['multimeter', 'digital multimeter', 'dmm'],
    preferredQuery: 'digital multimeter electronics bench tool',
    fallbackQuery: 'multimeter closeup',
    relevanceTokens: ['multimeter', 'digital', 'meter', 'bench'],
  },
  {
    id: 'servo-motor-sg90',
    intent: 'actuator',
    aliases: ['servo motor', 'sg90 servo', 'micro servo', 'servo'],
    preferredQuery: 'sg90 micro servo motor electronics closeup',
    fallbackQuery: 'servo motor module',
    relevanceTokens: ['servo', 'motor', 'sg90', 'actuator', 'horn'],
  },
  {
    id: 'stepper-28byj48',
    intent: 'actuator',
    aliases: ['stepper motor', '28byj-48', '28byj48'],
    preferredQuery: '28byj-48 stepper motor module electronics closeup',
    fallbackQuery: 'stepper motor electronics',
    relevanceTokens: ['stepper', 'motor', '28byj', 'driver'],
  },
  {
    id: 'dc-motor',
    intent: 'actuator',
    aliases: ['dc motor', 'brushed dc motor', 'mini dc motor'],
    preferredQuery: 'mini dc motor electronics project closeup',
    fallbackQuery: 'dc motor closeup',
    relevanceTokens: ['dc', 'motor', 'shaft', 'actuator'],
  },
  {
    id: 'relay-module',
    intent: 'actuator',
    aliases: ['relay module', '5v relay', 'relay board', 'relay'],
    preferredQuery: '5v relay module electronics board closeup',
    fallbackQuery: 'relay module board',
    relevanceTokens: ['relay', 'module', 'board', 'coil', 'contacts'],
  },
  {
    id: 'ultrasonic-hcsr04',
    intent: 'sensor',
    aliases: ['hc-sr04', 'hcsr04', 'ultrasonic sensor', 'distance sensor'],
    preferredQuery: 'hc-sr04 ultrasonic distance sensor module closeup',
    fallbackQuery: 'ultrasonic sensor module',
    relevanceTokens: ['ultrasonic', 'sensor', 'hc-sr04', 'distance'],
  },
  {
    id: 'dht11-sensor',
    intent: 'sensor',
    aliases: ['dht11', 'temperature humidity sensor', 'dht sensor'],
    preferredQuery: 'dht11 temperature humidity sensor module closeup',
    fallbackQuery: 'dht11 sensor module',
    relevanceTokens: ['dht11', 'temperature', 'humidity', 'sensor'],
  },
  {
    id: 'pir-hc-sr501',
    intent: 'sensor',
    aliases: ['pir sensor', 'motion sensor', 'hc-sr501'],
    preferredQuery: 'hc-sr501 pir motion sensor module closeup',
    fallbackQuery: 'pir motion sensor module',
    relevanceTokens: ['pir', 'motion', 'sensor', 'module'],
  },
  {
    id: 'oled-ssd1306',
    intent: 'display',
    aliases: ['oled display', 'ssd1306', '0.96 oled'],
    preferredQuery: 'ssd1306 oled display module electronics closeup',
    fallbackQuery: 'oled display module',
    relevanceTokens: ['oled', 'ssd1306', 'display', 'module'],
  },
  {
    id: 'lcd-1602',
    intent: 'display',
    aliases: ['lcd 1602', '1602 lcd', 'character lcd', 'lcd module'],
    preferredQuery: '1602 lcd character display module closeup',
    fallbackQuery: 'lcd 1602 module',
    relevanceTokens: ['lcd', '1602', 'display', 'character'],
  },
  {
    id: 'potentiometer',
    intent: 'passive',
    aliases: ['potentiometer', 'pot', 'variable resistor'],
    preferredQuery: 'rotary potentiometer electronics component closeup',
    fallbackQuery: 'potentiometer component',
    relevanceTokens: ['potentiometer', 'variable', 'resistor', 'rotary'],
  },
  {
    id: 'resistor',
    intent: 'passive',
    aliases: ['resistor', 'resistors', 'through-hole resistor'],
    preferredQuery: 'through-hole resistor electronics component closeup',
    fallbackQuery: 'resistor component',
    relevanceTokens: ['resistor', 'ohm', 'component', 'color bands'],
  },
  {
    id: 'electrolytic-capacitor',
    intent: 'passive',
    aliases: ['capacitor', 'electrolytic capacitor', 'capacitors'],
    preferredQuery: 'electrolytic capacitor electronics component closeup',
    fallbackQuery: 'capacitor component',
    relevanceTokens: ['capacitor', 'electrolytic', 'uf', 'component'],
  },
  {
    id: 'led-component',
    intent: 'passive',
    aliases: ['led', 'led diode', 'light emitting diode'],
    preferredQuery: '5mm led diode electronics component closeup',
    fallbackQuery: 'led component',
    relevanceTokens: ['led', 'diode', 'component', 'anode', 'cathode'],
  },
  {
    id: 'buzzer-module',
    intent: 'actuator',
    aliases: ['buzzer', 'active buzzer', 'passive buzzer', 'buzzer module'],
    preferredQuery: 'buzzer module electronics closeup',
    fallbackQuery: 'piezo buzzer module',
    relevanceTokens: ['buzzer', 'piezo', 'module', 'sound'],
  },
  {
    id: '2n2222-transistor',
    intent: 'chip',
    aliases: ['2n2222', 'transistor', 'npn transistor', 'to-92 transistor'],
    preferredQuery: '2n2222 npn transistor to-92 package closeup',
    fallbackQuery: 'npn transistor component',
    relevanceTokens: ['2n2222', 'npn', 'transistor', 'to-92'],
  },
  {
    id: 'l298n-driver',
    intent: 'power',
    aliases: ['l298n', 'motor driver', 'l298n module', 'h-bridge module'],
    preferredQuery: 'l298n motor driver module board closeup',
    fallbackQuery: 'motor driver module electronics',
    relevanceTokens: ['l298n', 'driver', 'module', 'h-bridge', 'motor'],
  },
  {
    id: 'lm2596-buck',
    intent: 'power',
    aliases: ['lm2596', 'buck converter', 'dc-dc converter', 'step down module'],
    preferredQuery: 'lm2596 buck converter module electronics closeup',
    fallbackQuery: 'buck converter module',
    relevanceTokens: ['lm2596', 'buck', 'converter', 'module', 'dc-dc'],
  },
  {
    id: 'jumper-wires',
    intent: 'connector',
    aliases: ['jumper wires', 'dupont wires', 'dupont cable', 'jumper cable'],
    preferredQuery: 'dupont jumper wires electronics breadboard closeup',
    fallbackQuery: 'jumper wires electronics',
    relevanceTokens: ['jumper', 'dupont', 'wires', 'breadboard'],
  },
  {
    id: 'usb-c-cable',
    intent: 'connector',
    aliases: ['usb c cable', 'usb-c cable', 'usb cable', 'type c cable'],
    preferredQuery: 'usb-c cable data power electronics closeup',
    fallbackQuery: 'usb c cable connector',
    relevanceTokens: ['usb-c', 'cable', 'connector', 'type-c'],
  },
  {
    id: 'stm32-blue-pill',
    intent: 'board',
    aliases: ['stm32', 'blue pill', 'stm32 blue pill', 'stm32f103'],
    preferredQuery: 'stm32f103 blue pill development board closeup',
    fallbackQuery: 'stm32 development board',
    relevanceTokens: ['stm32', 'f103', 'blue', 'pill', 'board'],
  },
  {
    id: 'nodemcu-esp8266',
    intent: 'board',
    aliases: ['nodemcu', 'esp8266 nodemcu', 'esp8266 board', 'esp-12e'],
    preferredQuery: 'nodemcu esp8266 development board closeup',
    fallbackQuery: 'esp8266 nodemcu board',
    relevanceTokens: ['nodemcu', 'esp8266', 'board', 'wifi'],
  },
  {
    id: 'ws2812b-neopixel',
    intent: 'actuator',
    aliases: ['ws2812b', 'neopixel', 'addressable led', 'rgb led strip'],
    preferredQuery: 'ws2812b neopixel addressable led strip closeup',
    fallbackQuery: 'neopixel led module',
    relevanceTokens: ['ws2812b', 'neopixel', 'addressable', 'led', 'rgb'],
  },
  {
    id: 'rotary-encoder-ky040',
    intent: 'sensor',
    aliases: ['rotary encoder', 'ky-040', 'ky040 encoder', 'encoder module'],
    preferredQuery: 'ky-040 rotary encoder module closeup',
    fallbackQuery: 'rotary encoder module electronics',
    relevanceTokens: ['encoder', 'rotary', 'ky-040', 'module'],
  },
  {
    id: 'joystick-module',
    intent: 'sensor',
    aliases: ['joystick module', 'ps2 joystick', 'analog joystick'],
    preferredQuery: 'ps2 analog joystick module electronics closeup',
    fallbackQuery: 'joystick module board',
    relevanceTokens: ['joystick', 'analog', 'module', 'x y'],
  },
  {
    id: 'ldr-photoresistor',
    intent: 'sensor',
    aliases: ['ldr', 'photoresistor', 'light sensor resistor'],
    preferredQuery: 'ldr photoresistor light sensor component closeup',
    fallbackQuery: 'photoresistor sensor module',
    relevanceTokens: ['ldr', 'photoresistor', 'light', 'sensor'],
  },
  {
    id: 'soil-moisture-sensor',
    intent: 'sensor',
    aliases: ['soil moisture sensor', 'hygrometer sensor', 'soil sensor module'],
    preferredQuery: 'soil moisture sensor module electronics closeup',
    fallbackQuery: 'soil moisture sensor board',
    relevanceTokens: ['soil', 'moisture', 'sensor', 'module'],
  },
  {
    id: 'ina219-current-sensor',
    intent: 'sensor',
    aliases: ['ina219', 'current sensor module', 'voltage current sensor'],
    preferredQuery: 'ina219 current sensor module closeup',
    fallbackQuery: 'ina219 module board',
    relevanceTokens: ['ina219', 'current', 'sensor', 'module', 'i2c'],
  },
  {
    id: 'ds3231-rtc',
    intent: 'sensor',
    aliases: ['ds3231', 'rtc module', 'real time clock module'],
    preferredQuery: 'ds3231 rtc module electronics closeup',
    fallbackQuery: 'rtc module board',
    relevanceTokens: ['ds3231', 'rtc', 'clock', 'module'],
  },
  {
    id: 'hx711-load-cell',
    intent: 'sensor',
    aliases: ['hx711', 'load cell amplifier', 'load cell module'],
    preferredQuery: 'hx711 load cell amplifier module closeup',
    fallbackQuery: 'hx711 module',
    relevanceTokens: ['hx711', 'load', 'cell', 'amplifier', 'module'],
  },
  {
    id: 'micro-sd-module',
    intent: 'connector',
    aliases: ['micro sd module', 'sd card module', 'microsd breakout'],
    preferredQuery: 'micro sd card module spi breakout closeup',
    fallbackQuery: 'sd card module electronics',
    relevanceTokens: ['micro', 'sd', 'card', 'module', 'spi'],
  },
  {
    id: 'mosfet-irfz44n',
    intent: 'chip',
    aliases: ['mosfet', 'irfz44n', 'n channel mosfet', 'power mosfet'],
    preferredQuery: 'irfz44n n-channel mosfet transistor closeup',
    fallbackQuery: 'power mosfet transistor component',
    relevanceTokens: ['mosfet', 'irfz44n', 'transistor', 'power'],
  },
  {
    id: 'lm358-opamp',
    intent: 'chip',
    aliases: ['lm358', 'op amp', 'operational amplifier ic', 'opamp ic'],
    preferredQuery: 'lm358 operational amplifier ic dip package closeup',
    fallbackQuery: 'op amp ic component',
    relevanceTokens: ['lm358', 'opamp', 'operational', 'amplifier', 'ic'],
  },
];

/**
 * Smart image search with confidence scoring.
 *
 * Round 1: Search Brave + Wikimedia in parallel with exact query.
 *          If best result score >= threshold → return immediately.
 * Round 2: If no confident match, retry with a simplified query.
 *          Pick the best result across all attempts.
 *
 * Response includes `confident: boolean` so the client knows quality.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get('q')?.trim();
  const rawCaption = searchParams.get('caption')?.trim();
  const rawDescription = searchParams.get('description')?.trim();
  const rawExclude = searchParams.getAll('exclude');
  const requestedCountRaw = Number(searchParams.get('count') || '1');
  const requestedCount = Number.isFinite(requestedCountRaw)
    ? Math.min(Math.max(Math.floor(requestedCountRaw), 1), 6)
    : 1;

  if (!rawQuery) {
    return NextResponse.json({ error: 'Missing query parameter.' }, { status: 400 });
  }

  const contextText = [rawCaption, rawDescription].filter(Boolean).join(' ');
  const query = preprocessImageQuery(rawQuery);
  const intentSource = `${query} ${contextText}`.trim();
  const curated = getCuratedProfile(intentSource);
  const intent = curated?.intent ?? detectImageIntent(intentSource);
  const tunedQuery = curated?.preferredQuery ?? tuneQueryForIntent(query, intent);
  const excludeKeys = normalizeExcludedUrlKeys(rawExclude);
  const excludeCacheSuffix = excludeKeys.length > 0 ? `|exclude:${excludeKeys.join(',')}` : '';
  const cacheKey = `${tunedQuery.toLowerCase()}|${intent}|${requestedCount}${excludeCacheSuffix}`;
  const cached = IMAGE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return jsonWithCache(cached.payload);
  }

  const braveKey = process.env.BRAVE_API_KEY;

  // ── Round 1: Parallel search with exact query ──
  const curatedContext = curated
    ? `${contextText} ${curated.relevanceTokens.join(' ')}`.trim()
    : contextText;
  const round1 = await searchParallel(tunedQuery, braveKey, intent, curatedContext);
  const round1Candidates = filterExcluded(round1, excludeKeys);
  const topRound1 = round1Candidates[0] ?? null;
  if (topRound1 && topRound1.score >= CONFIDENCE_THRESHOLD) {
    const payload: ImageSearchResponse = {
      ...topRound1,
      confident: true,
      queryUsed: tunedQuery,
      images: toImageCandidates(round1Candidates, requestedCount),
    };
    setImageCache(cacheKey, payload);
    return jsonWithCache(payload);
  }

  // ── Round 2: Retry if no result OR low confidence and query is multi-word ──
  const queryWords = tunedQuery.trim().split(/\s+/);
  if ((!topRound1 || topRound1.score < CONFIDENCE_THRESHOLD) && queryWords.length > 2) {
    const retryQuery = curated?.fallbackQuery?.trim() || simplifyQuery(tunedQuery);
    if (retryQuery !== tunedQuery) {
      const round2 = await searchParallel(retryQuery, braveKey, intent, curatedContext);
      if (round2.length > 0) {
        const merged = filterExcluded(mergeAndRank(round1, round2), excludeKeys);
        const best = merged[0]!;
        const payload: ImageSearchResponse = {
          ...best,
          confident: best.score >= CONFIDENCE_THRESHOLD,
          queryUsed: best.score >= (topRound1?.score ?? -Infinity) ? retryQuery : tunedQuery,
          images: toImageCandidates(merged, requestedCount),
        };
        setImageCache(cacheKey, payload);
        return jsonWithCache(payload);
      }
    }
  }

  // Return round 1 result even if low confidence, or null
  if (topRound1) {
    const payload: ImageSearchResponse = {
      ...topRound1,
      confident: false,
      queryUsed: tunedQuery,
      images: toImageCandidates(round1Candidates, requestedCount),
    };
    setImageCache(cacheKey, payload);
    return jsonWithCache(payload);
  }

  const payload: ImageSearchResponse = { url: null, confident: false, queryUsed: tunedQuery };
  setImageCache(cacheKey, payload);
  return jsonWithCache(payload);
}

function jsonWithCache(payload: ImageSearchResponse) {
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
    },
  });
}

function setImageCache(key: string, payload: ImageSearchResponse) {
  const now = Date.now();
  for (const [entryKey, entryValue] of IMAGE_CACHE) {
    if (entryValue.expiresAt <= now) {
      IMAGE_CACHE.delete(entryKey);
    }
  }

  IMAGE_CACHE.set(key, { expiresAt: now + IMAGE_CACHE_TTL_MS, payload });
  while (IMAGE_CACHE.size > IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = IMAGE_CACHE.keys().next().value;
    if (!oldestKey) break;
    IMAGE_CACHE.delete(oldestKey);
  }
}

/* ── Parallel search across providers ── */

async function searchParallel(
  query: string,
  braveKey: string | undefined,
  intent: ImageIntent,
  contextText: string
): Promise<ScoredImage[]> {
  const contextWords = extractSignalWords(contextText);
  const searches: Promise<ScoredImage[]>[] = [];

  if (braveKey) searches.push(searchBrave(query, braveKey, intent, contextWords));
  searches.push(searchWikimedia(query, intent, contextWords));

  const results = await Promise.all(searches);
  return mergeAndRank(...results);
}

function mergeAndRank(...groups: ScoredImage[][]): ScoredImage[] {
  const seen = new Set<string>();
  const merged: ScoredImage[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = normalizeUrlKey(item.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged.sort((a, b) => b.score - a.score);
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function normalizeExcludedUrlKeys(rawExcludeParams: string[]): string[] {
  if (!rawExcludeParams.length) return [];
  const keys = new Set<string>();
  for (const value of rawExcludeParams) {
    const key = normalizeUrlKey(value);
    if (key) keys.add(key);
  }
  return [...keys].slice(0, 12);
}

function filterExcluded(results: ScoredImage[], excludeKeys: string[]): ScoredImage[] {
  if (excludeKeys.length === 0) return results;
  const excluded = new Set(excludeKeys);
  const filtered = results.filter((item) => !excluded.has(normalizeUrlKey(item.url)));
  return filtered.length > 0 ? filtered : results;
}

function toImageCandidates(results: ScoredImage[], count: number) {
  return results.slice(0, count).map((item) => ({
    url: item.url,
    thumbnail: item.thumbnail,
    attribution: item.attribution,
    source: item.source,
  }));
}

/* ── Query simplification for retry ── */

function simplifyQuery(query: string): string {
  // Remove version numbers, qualifiers, and extra words
  return query
    .replace(/\b(v\d+|r\d+|rev\s*\d+|kit|breakout|closeup|high\s*resolution|photo)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function preprocessImageQuery(query: string): string {
  const stripped = query
    .replace(/\b(show|me|a|an|the|please)\b/gi, ' ')
    .replace(/\b(photo|photos|picture|pictures|image|images|pic|pics)\s+of\b/gi, ' ')
    .replace(/\b(photo|photos|picture|pictures|image|images|pic|pics)\b/gi, ' ')
    .replace(/\bwhat\s+does\s+\w+\s+look\s+like\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = stripped.toLowerCase();
  const includesBoardLike =
    /\b(board|module|dev kit|development kit|development board|microcontroller)\b/i.test(stripped);
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

function detectImageIntent(input: string): ImageIntent {
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

function tuneQueryForIntent(query: string, intent: ImageIntent): string {
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

function getCuratedProfile(input: string): CuratedProfile | null {
  const lower = input.toLowerCase();
  let best: CuratedProfile | null = null;
  let bestScore = 0;

  for (const profile of CURATED_PROFILES) {
    for (const alias of profile.aliases) {
      const normalizedAlias = alias.toLowerCase().trim();
      if (!normalizedAlias) continue;
      if (!lower.includes(normalizedAlias)) continue;
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

function extractSignalWords(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9+#-]+/)
    .filter((word) => word.length > 2)
    .slice(0, 12);
}

/* ── Scoring helpers ── */

function scoreResult(
  query: string,
  title: string,
  width: number | undefined,
  height: number | undefined,
  contextWords: string[],
  intent: ImageIntent
): number {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const titleLower = title.toLowerCase();

  // Base: how many query words appear in the title
  let score = queryWords.filter((word) => titleLower.includes(word)).length * 1.35;
  const queryPhrase = queryWords.slice(0, 3).join(' ');
  if (queryPhrase && titleLower.includes(queryPhrase)) score += 1.2;
  score += contextWords.filter((word) => titleLower.includes(word)).length * 0.45;

  score += ELECTRONICS_TERMS.filter((word) => titleLower.includes(word)).length * 0.45;

  // Bonus for reasonable dimensions
  const w = width ?? 0;
  const h = height ?? 0;
  if (w >= 300 && h >= 200) score += 0.5;
  const ratio = w && h ? w / h : 1;
  if (ratio > 0.5 && ratio < 2.5) score += 0.5;

  // Penalty if title contains "kit", "set", "bundle" (likely a collection, not the item)
  if (/\b(kit|set|bundle|pack|lot|collection)\b/i.test(titleLower)) {
    score -= 1;
  }

  // Penalize low-signal visuals and non-photo image assets.
  if (new RegExp(`\\b(${LOW_SIGNAL_TERMS.join('|')})\\b`, 'i').test(titleLower)) {
    score -= 3;
  }
  if (/\b(schematic|diagram|drawing|wiring)\b/i.test(titleLower)) {
    score -= 1.5;
  }

  // Prefer obvious electronics context.
  if (
    /\b(electronic|electronics|microcontroller|development board|board|module|prototype|hardware)\b/i.test(
      titleLower
    )
  ) {
    score += 1.2;
  }

  // Prefer higher-quality images over tiny previews.
  if (w >= 800 && h >= 500) score += 1;
  if (w > 0 && h > 0 && w < 220) score -= 2;

  // Intent-specific relevance bonuses.
  if (
    intent === 'board' &&
    /\b(board|microcontroller|arduino|raspberry|esp32|esp8266|uno)\b/.test(titleLower)
  ) {
    score += 1.6;
  }
  if (
    intent === 'sensor' &&
    /\b(sensor|module|temperature|humidity|imu|accelerometer|gyroscope)\b/.test(titleLower)
  ) {
    score += 1.4;
  }
  if (intent === 'actuator' && /\b(servo|stepper|motor|relay|buzzer|actuator)\b/.test(titleLower)) {
    score += 1.35;
  }
  if (
    intent === 'passive' &&
    /\b(resistor|capacitor|inductor|diode|led|potentiometer)\b/.test(titleLower)
  ) {
    score += 1.15;
  }
  if (
    intent === 'tool' &&
    /\b(multimeter|oscilloscope|soldering|bench|analyzer)\b/.test(titleLower)
  ) {
    score += 1.2;
  }
  if (intent === 'display' && /\b(oled|lcd|display|tft|e-ink)\b/.test(titleLower)) {
    score += 1.1;
  }

  return score;
}

/* ── Brave Image Search ── */

async function searchBrave(
  query: string,
  apiKey: string,
  intent: ImageIntent,
  contextWords: string[]
): Promise<ScoredImage[]> {
  try {
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '10');
    url.searchParams.set('safesearch', 'strict');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as BraveImageResponse;
    const results = data.results;
    if (!results?.length) return [];
    const ranked: ScoredImage[] = [];

    for (const img of results) {
      const imageUrl = img.properties?.url ?? img.thumbnail?.src;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg')) continue;
      if (/\.(gif|webp)(\?|$)/i.test(imageUrl)) continue;
      if (/\/(sprite|icon|logo)\b/i.test(imageUrl)) continue;

      const w = img.properties?.width ?? 0;
      if (w > 0 && w < 150) continue;

      const score = scoreResult(
        query,
        img.title ?? '',
        img.properties?.width,
        img.properties?.height,
        contextWords,
        intent
      );

      ranked.push({
        url: img.properties?.url ?? imageUrl,
        thumbnail: img.thumbnail?.src,
        attribution: img.source ?? 'Brave Search',
        source: 'brave',
        score,
      });
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, 12);
  } catch {
    return [];
  }
}

/* ── Wikimedia Commons Search ── */

async function searchWikimedia(
  query: string,
  intent: ImageIntent,
  contextWords: string[]
): Promise<ScoredImage[]> {
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', '10');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|extmetadata|size');
    url.searchParams.set('iiurlwidth', '600');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(2500),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as WikimediaResponse;
    const pages = data.query?.pages;
    if (!pages) return [];
    const ranked: ScoredImage[] = [];

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const imageUrl = info.url ?? info.thumburl;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg') || imageUrl.endsWith('.SVG')) continue;
      if (/\.(gif|webp)(\?|$)/i.test(imageUrl)) continue;
      if (info.width && info.width < 150) continue;

      const title = (page.title ?? '').replace(/^File:/i, '');
      const score = scoreResult(query, title, info.width, undefined, contextWords, intent);

      ranked.push({
        url: imageUrl,
        thumbnail: info.thumburl,
        attribution: info.extmetadata?.Artist?.value
          ? stripHtml(info.extmetadata.Artist.value)
          : 'Wikimedia Commons',
        source: 'wikimedia',
        score,
      });
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, 12);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/* ── Type definitions ── */

interface BraveImageResponse {
  results?: {
    title?: string;
    thumbnail?: { src: string };
    properties?: { url?: string; width?: number; height?: number };
    source?: string;
  }[];
}

interface WikimediaResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

interface WikimediaPage {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    width?: number;
    extmetadata?: {
      Artist?: { value: string };
    };
  }[];
}
