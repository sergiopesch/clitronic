'use client';

import type { VoiceState } from '@/hooks/useVoiceInteraction';

interface VoiceDockProps {
  isSupported: boolean;
  voiceState: VoiceState;
  isMuted: boolean;
  isLocked?: boolean;
  compact?: boolean;
  onPrimaryAction: () => void;
  onToggleMute: () => void;
}

function stateLabel(state: VoiceState, isLocked: boolean, isMuted: boolean): string {
  if (isLocked) return 'Daily limit reached';
  if (isMuted) return 'Microphone muted';
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
  if (state === 'requesting_mic') return 'Cancel';
  if (state === 'connecting_realtime') return 'Cancel';
  if (state === 'listening') return 'Stop';
  if (state === 'capturing') return 'Stop';
  if (state === 'transcribing') return 'Stop';
  if (state === 'processing') return 'Stop';
  if (state === 'speaking') return 'Stop';
  if (state === 'error') return 'Try again';
  return 'Press to talk';
}

type VoiceControlButtonProps = {
  label: string;
  size: 'primary' | 'secondary';
  compact?: boolean;
  disabled?: boolean;
  active?: boolean;
  ariaPressed?: boolean;
  ariaLabel?: string;
  onClick: () => void;
};

function VoiceControlButton({
  label,
  size,
  compact = false,
  disabled = false,
  active = false,
  ariaPressed,
  ariaLabel,
  onClick,
}: VoiceControlButtonProps) {
  const isPrimary = size === 'primary';
  const sizeClass = isPrimary
    ? compact
      ? 'h-[clamp(4.75rem,22vw,6rem)] w-[clamp(4.75rem,22vw,6rem)]'
      : 'h-[clamp(6.5rem,30vw,8.5rem)] w-[clamp(6.5rem,30vw,8.5rem)]'
    : compact
      ? 'h-[clamp(3.25rem,16vw,4rem)] w-[clamp(3.25rem,16vw,4rem)]'
      : 'h-[clamp(3.875rem,18vw,5rem)] w-[clamp(3.875rem,18vw,5rem)]';
  const labelClass = isPrimary
    ? compact
      ? 'text-[9px] leading-tight tracking-[0.1em] sm:text-[10px]'
      : 'text-[11px] tracking-[0.12em] sm:text-xs'
    : compact
      ? 'text-[8px] leading-tight tracking-[0.09em] sm:text-[9px]'
      : 'text-[9px] tracking-[0.11em] sm:text-[10px]';
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
      className={`group relative flex shrink-0 touch-manipulation items-center justify-center rounded-full border bg-gradient-to-b text-center shadow-[0_18px_60px_rgba(34,211,238,0.18)] transition duration-300 select-none ${
        sizeClass
      } ${toneClass}`}
    >
      <span className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/18" />
      <span
        className={`pointer-events-none absolute rounded-full border border-cyan-200/20 transition-transform duration-300 ${
          isPrimary ? 'inset-4 group-hover:scale-[1.03]' : 'inset-2.5 group-hover:scale-[1.05]'
        }`}
      />
      <span className={`max-w-[4.25rem] px-2 font-medium uppercase sm:max-w-[5rem] ${labelClass}`}>
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
  compact = false,
  onPrimaryAction,
  onToggleMute,
}: VoiceDockProps) {
  if (!isSupported) {
    return (
      <div className="border-border bg-surface-1/70 text-text-muted rounded-xl border px-3 py-2 text-xs">
        Voice is not supported in this browser. Use the text box above instead.
      </div>
    );
  }

  const primaryDisabled = isLocked;
  const primaryActive = !isLocked && !['idle', 'error'].includes(voiceState);
  const canMuteMic =
    !isLocked && !['idle', 'error', 'requesting_mic', 'connecting_realtime'].includes(voiceState);

  return (
    <div
      className={`flex w-full flex-col items-center ${
        compact ? 'max-w-[12.5rem] gap-2 sm:max-w-[14rem]' : 'max-w-[16rem] gap-3 sm:max-w-[18rem]'
      }`}
    >
      <div
        className={`flex w-full items-end justify-center ${compact ? 'gap-2' : 'gap-2.5 sm:gap-4'}`}
      >
        <VoiceControlButton
          label={primaryLabel(voiceState, isLocked)}
          ariaLabel={primaryLabel(voiceState, isLocked)}
          size="primary"
          compact={compact}
          disabled={primaryDisabled}
          active={primaryActive}
          onClick={onPrimaryAction}
        />
        <VoiceControlButton
          label={isMuted ? 'Mic on' : 'Mute'}
          ariaLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          size="secondary"
          compact={compact}
          disabled={!canMuteMic}
          active={isMuted}
          ariaPressed={isMuted}
          onClick={onToggleMute}
        />
      </div>
      <span className="text-text-muted text-[10px] tracking-[0.12em] uppercase">
        {stateLabel(voiceState, isLocked, isMuted)}
      </span>
    </div>
  );
}
