export type Pcm16LeDecodeState = {
  pendingByte: number | null;
};

export function createPcm16LeDecodeState(): Pcm16LeDecodeState {
  return { pendingByte: null };
}

export function decodePcm16LeChunk(
  chunk: Uint8Array,
  state: Pcm16LeDecodeState
): Float32Array<ArrayBuffer> {
  const sampleCount = Math.floor((chunk.byteLength + (state.pendingByte === null ? 0 : 1)) / 2);
  const samples = new Float32Array(sampleCount);
  let sampleIndex = 0;
  let byteIndex = 0;

  const writeSample = (lowByte: number, highByte: number) => {
    const unsigned = lowByte | (highByte << 8);
    const signed = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
    samples[sampleIndex] = signed / 0x8000;
    sampleIndex += 1;
  };

  if (state.pendingByte !== null && chunk.byteLength > 0) {
    writeSample(state.pendingByte, chunk[0]);
    state.pendingByte = null;
    byteIndex = 1;
  }

  while (byteIndex + 1 < chunk.byteLength) {
    writeSample(chunk[byteIndex], chunk[byteIndex + 1]);
    byteIndex += 2;
  }

  state.pendingByte = byteIndex < chunk.byteLength ? chunk[byteIndex] : null;
  return samples;
}

export function hasPendingPcm16LeByte(state: Pcm16LeDecodeState): boolean {
  return state.pendingByte !== null;
}
