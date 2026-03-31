'use client';

import type { VoiceState } from '@/hooks/useVoiceInteraction';

interface VoiceDockProps {
  isSupported: boolean;
  voiceState: VoiceState;
  isMuted: boolean;
  isLocked?: boolean;
  onPrimaryAction: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

function stateLabel(state: VoiceState, isLocked: boolean): string {
  if (isLocked) return 'Daily limit reached';
  if (state === 'idle') return 'Ready';
  if (state === 'requesting_mic') return 'Allow microphone';
  if (state === 'connecting_realtime') return 'Connecting';
  if (state === 'listening') return 'Live listening';
  if (state === 'capturing') return 'Recording';
  if (state === 'transcribing') return 'Transcribing';
  if (state === 'processing') return 'Building response';
  if (state === 'speaking') return 'Speaking';
  return 'Voice unavailable';
}

function primaryLabel(state: VoiceState, isLocked: boolean): string {
  if (isLocked) return 'Limit reached';
  if (state === 'requesting_mic') return 'Allow mic';
  if (state === 'connecting_realtime') return 'Connecting';
  if (state === 'listening') return 'Live';
  if (state === 'capturing') return 'Listening';
  if (state === 'transcribing') return 'Sending';
  if (state === 'processing') return 'Thinking';
  if (state === 'speaking') return 'Speaking';
  if (state === 'error') return 'Try again';
  return 'Press to talk';
}

type VoiceControlButtonProps = {
  label: string;
  size: 'primary' | 'secondary';
  disabled?: boolean;
  active?: boolean;
  ariaPressed?: boolean;
  ariaLabel?: string;
  onClick: () => void;
};

function VoiceControlButton({
  label,
  size,
  disabled = false,
  active = false,
  ariaPressed,
  ariaLabel,
  onClick,
}: VoiceControlButtonProps) {
  const isPrimary = size === 'primary';
  const toneClass = disabled
    ? active
      ? 'cursor-default border-cyan-200/35 from-cyan-300/26 to-cyan-500/14 text-text-primary shadow-[0_22px_70px_rgba(34,211,238,0.24)]'
      : 'cursor-not-allowed border-cyan-400/12 from-cyan-500/8 to-cyan-500/5 text-text-muted opacity-45'
    : active
      ? 'border-cyan-200/35 from-cyan-300/26 to-cyan-500/14 text-text-primary shadow-[0_22px_70px_rgba(34,211,238,0.24)]'
      : 'border-cyan-300/25 from-cyan-400/20 to-cyan-500/10 text-text-primary hover:scale-[1.02] hover:shadow-[0_24px_80px_rgba(34,211,238,0.26)]';

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex shrink-0 touch-manipulation select-none items-center justify-center rounded-full border bg-gradient-to-b text-center shadow-[0_18px_60px_rgba(34,211,238,0.18)] transition duration-300 ${
        isPrimary
          ? 'h-[clamp(6.5rem,30vw,8.5rem)] w-[clamp(6.5rem,30vw,8.5rem)]'
          : 'h-[clamp(3.875rem,18vw,5rem)] w-[clamp(3.875rem,18vw,5rem)]'
      } ${toneClass}`}
    >
      <span className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/18" />
      <span
        className={`pointer-events-none absolute rounded-full border border-cyan-200/20 transition-transform duration-300 ${
          isPrimary ? 'inset-4 group-hover:scale-[1.03]' : 'inset-2.5 group-hover:scale-[1.05]'
        }`}
      />
      <span
        className={`px-3 font-medium uppercase ${
          isPrimary ? 'text-[11px] tracking-[0.12em] sm:text-xs' : 'text-[9px] tracking-[0.11em] sm:text-[10px]'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export function VoiceDock({
  isSupported,
  voiceState,
  isMuted,
  isLocked = false,
  onPrimaryAction,
  onStop,
  onToggleMute,
}: VoiceDockProps) {
  if (!isSupported) {
    return (
      <div className="border-border bg-surface-1/70 text-text-muted rounded-xl border px-3 py-2 text-xs">
        Voice is not supported in this browser. Text input is still available.
      </div>
    );
  }

  const primaryDisabled = isLocked || !['idle', 'error'].includes(voiceState);
  const canStop = !isLocked && !['idle', 'error'].includes(voiceState);
  const primaryActive = !isLocked && !['idle', 'error'].includes(voiceState);

  return (
    <div className="flex w-full max-w-[21rem] flex-col items-center gap-3 sm:max-w-[24rem]">
      <div className="flex w-full items-end justify-center gap-2.5 sm:gap-4">
        <VoiceControlButton label="Stop" size="secondary" disabled={!canStop} onClick={onStop} />
        <VoiceControlButton
          label={primaryLabel(voiceState, isLocked)}
          ariaLabel={primaryLabel(voiceState, isLocked)}
          size="primary"
          disabled={primaryDisabled}
          active={primaryActive}
          onClick={onPrimaryAction}
        />
        <VoiceControlButton
          label={isMuted ? 'Unmute' : 'Mute'}
          ariaLabel={isMuted ? 'Unmute assistant audio' : 'Mute assistant audio'}
          size="secondary"
          disabled={isLocked}
          active={isMuted}
          ariaPressed={isMuted}
          onClick={onToggleMute}
        />
      </div>
      <span className="text-text-muted text-[10px] tracking-[0.12em] uppercase">
        {stateLabel(voiceState, isLocked)}
      </span>
    </div>
  );
}
