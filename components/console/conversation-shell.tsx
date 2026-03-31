'use client';

import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { UIRenderer } from '@/components/ui/ui-renderer';
import { VoiceDock } from '@/components/voice/voice-dock';
import { VoiceOrb } from '@/components/voice/voice-orb';
import { VoiceTranscriptStrip } from '@/components/voice/voice-transcript-strip';
import { useConversationState } from '@/hooks/useConversationState';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';

const IS_DEV = process.env.NODE_ENV === 'development';

export function ConversationShell() {
  const [hasStartedSession, setHasStartedSession] = useState(false);
  const {
    submit,
    displayedResponse,
    responseKey,
    isLoading: isRenderingCard,
    error: conversationError,
    guardDailyLimit,
    resetDailyUsage,
    cancelActiveRequest,
    clearDisplayedResponse,
    reset: resetConversationState,
  } = useConversationState();

  const handleFinalTranscript = useCallback(
    async ({ raw, cleaned }: { raw: string; cleaned: string }) => {
      await submit({
        text: cleaned,
        inputMode: 'voice',
        transcriptMeta: { raw, cleaned },
      });
    },
    [submit]
  );

  const handleVoiceTurnStart = useCallback(() => {
    cancelActiveRequest();
    clearDisplayedResponse();
  }, [cancelActiveRequest, clearDisplayedResponse]);

  const {
    isSupported,
    voiceState,
    isSpeaking,
    isMuted,
    setIsMuted,
    partialTranscript,
    finalTranscript,
    assistantPartialTranscript,
    assistantFinalTranscript,
    error: voiceError,
    inputLevel,
    outputLevel,
    startCapture,
    stopCapture,
    cancelCapture,
  } = useVoiceInteraction({
    onFinalTranscript: handleFinalTranscript,
    onTurnStart: handleVoiceTurnStart,
  });

  const showWelcome = !hasStartedSession;
  const liveVoiceActivity = ['capturing', 'transcribing', 'processing', 'speaking'].includes(
    voiceState
  );
  const userStreamText = partialTranscript || finalTranscript;
  const assistantStreamText = assistantPartialTranscript || assistantFinalTranscript;
  const showVoiceTranscriptStrip =
    Boolean(userStreamText.trim()) ||
    Boolean(assistantStreamText.trim()) ||
    liveVoiceActivity ||
    isSpeaking;
  const shouldRenderResponseCard = Boolean(
    displayedResponse &&
    (displayedResponse.ui ||
      displayedResponse.intent === 'rate_limit' ||
      (!assistantStreamText.trim() &&
        (displayedResponse.text || displayedResponse.voice?.spokenSummary)))
  );
  const showSimpleIdle =
    !voiceError &&
    !showWelcome &&
    !showVoiceTranscriptStrip &&
    !shouldRenderResponseCard &&
    !isRenderingCard;
  const hasRateLimitResponse = displayedResponse?.intent === 'rate_limit';

  const handlePrimaryVoiceAction = () => {
    if (!guardDailyLimit()) {
      setHasStartedSession(true);
      return;
    }
    setHasStartedSession(true);
    cancelActiveRequest();
    clearDisplayedResponse();
    void startCapture();
  };

  const handleStopVoiceAction = () => {
    setHasStartedSession(true);
    cancelActiveRequest();
    stopCapture();
  };

  const resetConversation = () => {
    setHasStartedSession(false);
    cancelActiveRequest();
    cancelCapture();
    if (IS_DEV) {
      resetDailyUsage();
    }
    resetConversationState();
  };

  useEffect(() => {
    const syncViewportHeight = () => {
      const vv = window.visualViewport;
      const nextHeight = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--vvh', `${nextHeight}px`);
    };

    syncViewportHeight();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncViewportHeight);
    vv?.addEventListener('scroll', syncViewportHeight);
    window.addEventListener('resize', syncViewportHeight);
    window.addEventListener('orientationchange', syncViewportHeight);

    return () => {
      vv?.removeEventListener('resize', syncViewportHeight);
      vv?.removeEventListener('scroll', syncViewportHeight);
      window.removeEventListener('resize', syncViewportHeight);
      window.removeEventListener('orientationchange', syncViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (!hasRateLimitResponse) return;
    cancelCapture();
  }, [cancelCapture, hasRateLimitResponse]);

  const contentLayoutClass =
    showWelcome || (!shouldRenderResponseCard && !showVoiceTranscriptStrip && !isRenderingCard)
      ? 'justify-center'
      : 'justify-end sm:justify-center';

  return (
    <main className="bg-surface-0 relative flex min-h-[var(--vvh)] flex-col overflow-x-clip sm:min-h-[100dvh]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-accent/[0.03] absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]" />
      </div>

      <header
        className={`relative z-10 flex items-center px-4 py-3 pt-[max(env(safe-area-inset-top),12px)] transition-opacity duration-200 sm:px-6 ${
          showWelcome ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={resetConversation}
          aria-label="Home"
          className="max-w-[130px] opacity-85 transition hover:opacity-100 sm:max-w-none"
        >
          <Logo scale={0.56} className="h-auto w-full sm:w-auto" />
        </button>
      </header>

      <div
        className={`relative z-10 flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-4 ${
          showWelcome ? 'pb-10' : 'pb-24'
        } ${contentLayoutClass} sm:px-6`}
      >
        {showWelcome && (
          <div className="animate-fade-in-up relative flex w-full max-w-3xl flex-col items-center gap-8">
            <div className="pointer-events-none absolute -top-6 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl sm:-top-8 sm:h-44 sm:w-44" />
            <Logo scale={1} className="h-auto w-full max-w-[280px] opacity-95 sm:max-w-[420px]" />
            <button
              type="button"
              aria-label="Press to talk"
              onClick={handlePrimaryVoiceAction}
              className="group relative h-[clamp(8.5rem,42vw,11rem)] w-[clamp(8.5rem,42vw,11rem)] touch-manipulation select-none rounded-full border border-cyan-300/25 bg-gradient-to-b from-cyan-400/20 to-cyan-500/10 shadow-[0_18px_60px_rgba(34,211,238,0.2)] transition duration-300 hover:scale-[1.02] hover:shadow-[0_24px_80px_rgba(34,211,238,0.28)]"
            >
              <span className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/20" />
              <span className="pointer-events-none absolute inset-4 rounded-full border border-cyan-200/20 transition-transform duration-300 group-hover:scale-[1.03]" />
              <span className="text-text-primary text-[11px] tracking-[0.12em] uppercase sm:text-sm">
                Press to talk
              </span>
            </button>
          </div>
        )}

        {!showWelcome && showVoiceTranscriptStrip && (
          <div className="mb-3 w-full max-w-3xl">
            <VoiceTranscriptStrip
              userText={userStreamText}
              agentText={assistantStreamText}
              showUserCursor={
                voiceState === 'listening' ||
                voiceState === 'capturing' ||
                voiceState === 'transcribing'
              }
              showAgentCursor={isSpeaking || Boolean(assistantPartialTranscript)}
              userStreaming={
                voiceState === 'listening' ||
                voiceState === 'capturing' ||
                voiceState === 'transcribing'
              }
              agentStreaming={isSpeaking || Boolean(assistantPartialTranscript)}
            />
          </div>
        )}

        {!showWelcome && isRenderingCard && !shouldRenderResponseCard && (
          <div className="text-text-muted mb-3 w-full max-w-3xl rounded-xl border border-cyan-300/20 bg-cyan-500/[0.06] px-4 py-2 text-xs">
            Building visual response...
          </div>
        )}

        {!showWelcome && shouldRenderResponseCard && displayedResponse && (
          <div className="animate-fade-in-up mb-3 w-full max-w-3xl">
            <UIRenderer key={responseKey} response={displayedResponse} />
          </div>
        )}

        {!showWelcome && conversationError && (
          <div className="border-error/20 bg-error/5 text-error mb-3 w-full max-w-3xl rounded-xl border px-4 py-3 text-sm">
            {conversationError}
          </div>
        )}

        {showSimpleIdle && (
          <div className="animate-fade-in-up flex w-full max-w-2xl flex-col items-center gap-5">
            <VoiceOrb state={voiceState} inputLevel={inputLevel} outputLevel={outputLevel} />
          </div>
        )}

        {voiceError && (
          <div className="animate-fade-in-up flex w-full max-w-2xl flex-col items-center gap-4">
            <div className="border-error/20 bg-error/5 text-error rounded-xl border px-5 py-4 text-center text-sm">
              {voiceError}
            </div>
            <button
              type="button"
              onClick={resetConversation}
              className="text-text-muted hover:text-text-primary text-xs transition"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <div
        className={`relative z-20 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),14px)] transition-opacity duration-200 sm:px-6 ${
          showWelcome ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <VoiceDock
          isSupported={isSupported}
          voiceState={voiceState}
          isMuted={isMuted}
          isLocked={hasRateLimitResponse}
          onPrimaryAction={handlePrimaryVoiceAction}
          onStop={handleStopVoiceAction}
          onToggleMute={() => setIsMuted((prev) => !prev)}
        />
      </div>
    </main>
  );
}
