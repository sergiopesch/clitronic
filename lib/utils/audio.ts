/**
 * Audio feedback utilities for voice mode
 * Uses Web Audio API to generate chime tones programmatically
 */

let audioContext: AudioContext | null = null;

/**
 * Get or create the shared AudioContext
 */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Play a chime tone with the given frequencies
 */
function playChimeTone(
  ctx: AudioContext,
  frequencies: number[],
  startTime: number,
  duration: number = 0.1,
  gap: number = 0.08
): void {
  frequencies.forEach((freq, index) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, startTime + index * (duration + gap));

    // Envelope: quick attack, sustain, quick release
    const noteStart = startTime + index * (duration + gap);
    gainNode.gain.setValueAtTime(0, noteStart);
    gainNode.gain.linearRampToValueAtTime(0.15, noteStart + 0.01);
    gainNode.gain.setValueAtTime(0.15, noteStart + duration - 0.02);
    gainNode.gain.linearRampToValueAtTime(0, noteStart + duration);

    oscillator.start(noteStart);
    oscillator.stop(noteStart + duration);
  });
}

/**
 * Play audio feedback for voice mode state changes
 * @param type - 'start' for recording start, 'end' for recording end
 */
export async function playAudioFeedback(type: 'start' | 'end'): Promise<void> {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const startTime = ctx.currentTime;

    if (type === 'start') {
      // Ascending tones: 400Hz -> 500Hz -> 600Hz (uplifting, "listening")
      playChimeTone(ctx, [400, 500, 600], startTime, 0.08, 0.05);
    } else {
      // Descending tones: 600Hz -> 500Hz -> 400Hz (completion, "done")
      playChimeTone(ctx, [600, 500, 400], startTime, 0.08, 0.05);
    }
  } catch (error) {
    // Silently fail if audio is not available
    console.warn('Audio feedback not available:', error);
  }
}

/**
 * Preload audio feedback by creating the AudioContext
 * Call this on user interaction to comply with browser autoplay policies
 */
export function preloadAudioFeedback(): void {
  try {
    const ctx = getAudioContext();
    // Create a silent oscillator to "warm up" the audio context
    if (ctx.state === 'suspended') {
      // Will be resumed on next user interaction
    }
  } catch (error) {
    console.warn('Audio preload not available:', error);
  }
}
