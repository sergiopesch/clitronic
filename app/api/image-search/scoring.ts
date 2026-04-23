import { ELECTRONICS_TERMS, LOW_SIGNAL_TERMS } from './profiles';
import type { ImageIntent } from './types';

export function scoreResult(
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
    .filter((word) => word.length > 1);
  const titleLower = title.toLowerCase();

  let score = queryWords.filter((word) => titleLower.includes(word)).length * 1.35;
  const queryPhrase = queryWords.slice(0, 3).join(' ');
  if (queryPhrase && titleLower.includes(queryPhrase)) score += 1.2;
  score += contextWords.filter((word) => titleLower.includes(word)).length * 0.45;

  score += ELECTRONICS_TERMS.filter((word) => titleLower.includes(word)).length * 0.45;

  const w = width ?? 0;
  const h = height ?? 0;
  if (w >= 300 && h >= 200) score += 0.5;
  const ratio = w && h ? w / h : 1;
  if (ratio > 0.5 && ratio < 2.5) score += 0.5;

  if (/\b(kit|set|bundle|pack|lot|collection)\b/i.test(titleLower)) {
    score -= 1;
  }

  if (new RegExp(`\\b(${LOW_SIGNAL_TERMS.join('|')})\\b`, 'i').test(titleLower)) {
    score -= 3;
  }
  if (/\b(schematic|diagram|drawing|wiring)\b/i.test(titleLower)) {
    score -= 1.5;
  }

  if (
    /\b(electronic|electronics|microcontroller|development board|board|module|prototype|hardware)\b/i.test(
      titleLower
    )
  ) {
    score += 1.2;
  }

  if (w >= 800 && h >= 500) score += 1;
  if (w > 0 && h > 0 && w < 220) score -= 2;

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
