export function cleanTranscriptLight(raw: string): string {
  let value = (raw || '').trim();
  if (!value) return '';

  // Collapse repeated whitespace and punctuation noise from ASR.
  value = value.replace(/\s+/g, ' ');
  value = value.replace(/([!?.,])\1+/g, '$1');

  // Remove edge fillers while preserving electronics tokens in the body.
  value = value.replace(/^(?:(?:um|uh|erm|hmm|like|you know|okay|ok|so|well)\b[\s,.-]*)+/i, '');
  value = value.replace(/(?:[\s,.-]*(?:um|uh|erm|hmm|like|you know|okay|ok|so|well)\b)+$/i, '');

  return value.trim();
}
