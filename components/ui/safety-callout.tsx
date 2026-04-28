import type { ReactNode } from 'react';

const SAFETY_TERMS = [
  'mains',
  'line voltage',
  'high voltage',
  'licensed',
  'electrician',
  'code',
  'permit',
  'fire',
  'fuse',
  'breaker',
  'current limit',
  'wire gauge',
  'awg',
  'polarity',
  'battery',
  'lithium',
  'heat',
  'thermal',
  'enclosure',
  'ground',
  'disconnect',
  'unplug',
  'ppe',
];

export function extractSafetyNotes(values: Array<string | undefined | null>): string[] {
  const notes: string[] = [];

  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (!SAFETY_TERMS.some((term) => lower.includes(term))) continue;
    if (!notes.includes(text)) notes.push(text);
  }

  return notes.slice(0, 3);
}

export function SafetyCallout({ notes, children }: { notes?: string[]; children?: ReactNode }) {
  const visibleNotes = notes?.filter(Boolean) ?? [];
  if (visibleNotes.length === 0 && !children) return null;

  return (
    <div className="border-warning/25 bg-warning/[0.05] border-t px-4 py-3 sm:px-5">
      <div className="text-warning/80 mb-2 text-[10px] tracking-wider uppercase">Check first</div>
      {children ?? (
        <ul className="space-y-1.5">
          {visibleNotes.map((note, index) => (
            <li key={`${note}-${index}`} className="text-warning/90 flex items-start gap-2 text-xs">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
