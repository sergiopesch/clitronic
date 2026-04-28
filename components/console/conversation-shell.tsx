'use client';

import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { UIRenderer } from '@/components/ui/ui-renderer';
import { VoiceDock } from '@/components/voice/voice-dock';
import { VoiceOrb } from '@/components/voice/voice-orb';
import { VoiceTranscriptStrip } from '@/components/voice/voice-transcript-strip';
import { useConversationState } from '@/hooks/useConversationState';
import { useVoiceInteraction } from '@/hooks/useVoiceInteraction';
import type { ConversationEntry } from '@/hooks/useConversationState';
import type { StructuredResponse } from '@/lib/ai/response-schema';

const IS_DEV = process.env.NODE_ENV === 'development';

const WELCOME_EXAMPLES = [
  'What resistor for a red LED on 5V?',
  'Compare Arduino Uno vs Raspberry Pi Pico',
  'My LED is not blinking',
  'Show ESP32 pinout',
];

function TextComposer({
  value,
  disabled,
  compact = false,
  onChange,
  onSubmit,
}: {
  value: string;
  disabled: boolean;
  compact?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <form
      className="border-border bg-surface-1/90 box-border flex items-center gap-2 rounded-2xl border p-2 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-md"
      style={{
        width: 'calc(100vw - 2rem)',
        maxWidth: compact ? '32rem' : '48rem',
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <label htmlFor={compact ? 'welcome-text-prompt' : 'text-prompt'} className="sr-only">
        Ask an electronics question
      </label>
      <input
        id={compact ? 'welcome-text-prompt' : 'text-prompt'}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask about circuits, pinouts, wiring..."
        className="text-text-primary placeholder:text-text-muted min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-55 sm:text-base"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-accent text-surface-0 hover:bg-accent-dim disabled:bg-surface-3 disabled:text-text-muted border-border min-h-11 w-14 shrink-0 rounded-xl border border-transparent text-sm font-semibold transition disabled:cursor-not-allowed disabled:border"
      >
        Ask
      </button>
    </form>
  );
}

function WelcomeExamples({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid w-full max-w-xl grid-cols-1 gap-2 px-1 sm:grid-cols-2">
      {WELCOME_EXAMPLES.map((example) => (
        <button
          key={example}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(example)}
          className="border-border bg-surface-1/50 text-text-secondary hover:border-accent/30 hover:bg-accent/[0.04] hover:text-text-primary disabled:text-text-muted rounded-xl border px-3 py-2.5 text-left text-xs leading-snug transition disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
        >
          {example}
        </button>
      ))}
    </div>
  );
}

function describeAssistantEntry(entry: ConversationEntry): string {
  const structured = entry.structured;
  if (!structured?.ui) return entry.content || 'Answered in text';

  switch (structured.ui.component) {
    case 'specCard':
      return `Showed specs for ${structured.ui.data.title}`;
    case 'comparisonCard':
      return `Compared ${structured.ui.data.items.join(' vs ')}`;
    case 'explanationCard':
      return `Explained ${structured.ui.data.title}`;
    case 'recommendationCard':
      return `Recommended ${structured.ui.data.items.map((item) => item.name).join(', ')}`;
    case 'troubleshootingCard':
      return `Troubleshot ${structured.ui.data.issue}`;
    case 'calculationCard':
      return `Calculated ${structured.ui.data.result.label}: ${structured.ui.data.result.value}`;
    case 'pinoutCard':
      return `Showed pinout for ${structured.ui.data.component}`;
    case 'chartCard':
      return `Charted ${structured.ui.data.title}`;
    case 'wiringCard':
      return `Showed wiring steps for ${structured.ui.data.title}`;
    case 'imageBlock':
      return `Showed ${structured.ui.data.caption}`;
  }
}

function buildPreviousTurns(history: ConversationEntry[]) {
  const turns: { user: string; assistant: string; assistantIndex: number }[] = [];

  for (let i = 0; i < history.length - 1; i += 2) {
    const user = history[i];
    const assistant = history[i + 1];
    if (user?.role !== 'user' || assistant?.role !== 'assistant') continue;
    turns.push({
      user: user.content,
      assistant: describeAssistantEntry(assistant),
      assistantIndex: i + 1,
    });
  }

  return turns.slice(0, -1).slice(-2);
}

function RecentTurns({
  history,
  onSelect,
}: {
  history: ConversationEntry[];
  onSelect: (assistantIndex: number) => void;
}) {
  const turns = buildPreviousTurns(history);
  if (turns.length === 0) return null;

  return (
    <div className="mb-3 w-full max-w-3xl space-y-1.5">
      {turns.map((turn, index) => (
        <button
          key={`${turn.user}-${index}`}
          type="button"
          onClick={() => onSelect(turn.assistantIndex)}
          className="border-border bg-surface-1/45 hover:border-accent/30 hover:bg-surface-1/65 block w-full rounded-xl border px-3 py-2.5 text-left transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex gap-2 text-[11px] leading-relaxed sm:text-xs">
                <span className="text-accent shrink-0 font-mono">You</span>
                <span className="text-text-secondary min-w-0 truncate">{turn.user}</span>
              </div>
              <div className="mt-1 flex gap-2 text-[11px] leading-relaxed sm:text-xs">
                <span className="text-success shrink-0 font-mono">AI</span>
                <span className="text-text-muted min-w-0 truncate">{turn.assistant}</span>
              </div>
            </div>
            <span className="text-text-muted mt-0.5 shrink-0 text-[10px] font-medium tracking-[0.1em] uppercase">
              Open
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

type FollowUpAction = {
  label: string;
  prompt: string;
};

function getResponseSubject(response: StructuredResponse): string {
  if (!response.ui) return 'that answer';

  switch (response.ui.component) {
    case 'specCard':
      return response.ui.data.title;
    case 'comparisonCard':
      return response.ui.data.items.join(' vs ');
    case 'explanationCard':
      return response.ui.data.title;
    case 'recommendationCard':
      return response.ui.data.items.map((item) => item.name).join(', ');
    case 'troubleshootingCard':
      return response.ui.data.issue;
    case 'calculationCard':
      return response.ui.data.title;
    case 'pinoutCard':
      return response.ui.data.component;
    case 'chartCard':
      return response.ui.data.title;
    case 'wiringCard':
      return response.ui.data.title;
    case 'imageBlock':
      return response.ui.data.caption;
  }
}

function buildFollowUpActions(response: StructuredResponse | null): FollowUpAction[] {
  if (!response || response.intent === 'rate_limit') return [];

  const subject = getResponseSubject(response);

  if (!response.ui) {
    return [
      { label: 'Show visual', prompt: `Show a visual card for ${subject}` },
      { label: 'Explain simpler', prompt: `Explain ${subject} more simply` },
      { label: 'Safety check', prompt: `Give me the safety checks for ${subject}` },
    ];
  }

  switch (response.ui.component) {
    case 'calculationCard':
      return [
        { label: 'Explain formula', prompt: `Explain the formula for ${subject}` },
        { label: 'Show wiring', prompt: `Show wiring steps for ${subject}` },
        { label: 'Safety check', prompt: `What safety checks matter for ${subject}?` },
      ];
    case 'pinoutCard':
      return [
        { label: 'Show wiring', prompt: `Show wiring steps using ${subject}` },
        { label: 'Explain pins', prompt: `Explain the important pins on ${subject}` },
        { label: 'Show image', prompt: `Show me what ${subject} looks like` },
      ];
    case 'wiringCard':
      return [
        { label: 'Parts list', prompt: `Make a parts list for ${subject}` },
        { label: 'Explain steps', prompt: `Explain each wiring step for ${subject}` },
        { label: 'Safety check', prompt: `Review the safety checks for ${subject}` },
      ];
    case 'troubleshootingCard':
      return [
        { label: 'Likely cause', prompt: `What is the most likely cause for ${subject}?` },
        { label: 'Next checks', prompt: `Give me the next checks for ${subject}` },
        { label: 'Show wiring', prompt: `Show wiring guidance for ${subject}` },
      ];
    case 'recommendationCard':
      return [
        { label: 'Compare these', prompt: `Compare the recommended options for ${subject}` },
        { label: 'Show wiring', prompt: `Show wiring guidance for ${subject}` },
        { label: 'Safety check', prompt: `What safety constraints matter for ${subject}?` },
      ];
    case 'comparisonCard':
      return [
        { label: 'Pick one', prompt: `Recommend one option from ${subject}` },
        { label: 'Compare specs', prompt: `Compare the key specs for ${subject}` },
        { label: 'Show image', prompt: `Show images for ${subject}` },
      ];
    case 'imageBlock':
      return [
        { label: 'Explain this', prompt: `Explain ${subject}` },
        { label: 'Show another', prompt: `Show another image of ${subject}` },
        { label: 'Find pinout', prompt: `Show the pinout for ${subject}` },
      ];
    default:
      return [
        { label: 'Explain simpler', prompt: `Explain ${subject} more simply` },
        { label: 'Show image', prompt: `Show me what ${subject} looks like` },
        { label: 'Safety check', prompt: `What safety checks matter for ${subject}?` },
      ];
  }
}

function FollowUpActions({
  response,
  disabled,
  onSelect,
}: {
  response: StructuredResponse | null;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const actions = buildFollowUpActions(response);
  if (actions.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Follow-up actions"
      className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(action.prompt)}
          className="border-border bg-surface-1/60 text-text-secondary hover:border-accent/30 hover:bg-accent/[0.04] hover:text-text-primary disabled:text-text-muted shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function ConversationShell() {
  const [hasStartedSession, setHasStartedSession] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const {
    submit,
    displayedResponse,
    responseKey,
    history: conversationHistory,
    isLoading: isRenderingCard,
    error: conversationError,
    guardDailyLimit,
    resetDailyUsage,
    cancelActiveRequest,
    clearDisplayedResponse,
    showHistoryResponse,
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
  const activeVoiceState = !['idle', 'error'].includes(voiceState);

  const submitTextPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRenderingCard) return;
      setHasStartedSession(true);
      cancelActiveRequest();
      cancelCapture();
      setTextDraft('');
      void submit({ text: trimmed, inputMode: 'text' });
    },
    [cancelActiveRequest, cancelCapture, isRenderingCard, submit]
  );

  const handlePrimaryVoiceAction = () => {
    if (activeVoiceState) {
      handleStopVoiceAction();
      return;
    }
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

  const handleTextSubmit = useCallback(() => {
    submitTextPrompt(textDraft);
  }, [submitTextPrompt, textDraft]);

  const handleSelectPreviousTurn = useCallback(
    (assistantIndex: number) => {
      cancelActiveRequest();
      cancelCapture();
      showHistoryResponse(assistantIndex);
    },
    [cancelActiveRequest, cancelCapture, showHistoryResponse]
  );

  const resetConversation = () => {
    setHasStartedSession(false);
    setTextDraft('');
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
  const compactBottomControls =
    shouldRenderResponseCard ||
    showVoiceTranscriptStrip ||
    isRenderingCard ||
    Boolean(conversationError);
  const contentBottomPaddingClass = showWelcome
    ? 'pb-10'
    : compactBottomControls
      ? 'pb-4 sm:pb-8'
      : 'pb-8 sm:pb-10';

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
        className={`relative z-10 flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-4 ${contentBottomPaddingClass} ${contentLayoutClass} sm:px-6`}
      >
        {showWelcome && (
          <div className="animate-fade-in-up relative flex w-full max-w-3xl flex-col items-center gap-6 sm:gap-8">
            <div className="pointer-events-none absolute -top-6 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl sm:-top-8 sm:h-44 sm:w-44" />
            <Logo scale={0.62} className="h-auto opacity-95 sm:hidden" />
            <Logo scale={1} className="hidden h-auto opacity-95 sm:block" />
            <button
              type="button"
              aria-label="Press to talk"
              onClick={handlePrimaryVoiceAction}
              className="group relative h-[clamp(8.5rem,42vw,11rem)] w-[clamp(8.5rem,42vw,11rem)] touch-manipulation rounded-full border border-cyan-300/25 bg-gradient-to-b from-cyan-400/20 to-cyan-500/10 shadow-[0_18px_60px_rgba(34,211,238,0.2)] transition duration-300 select-none hover:scale-[1.02] hover:shadow-[0_24px_80px_rgba(34,211,238,0.28)]"
            >
              <span className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/20" />
              <span className="pointer-events-none absolute inset-4 rounded-full border border-cyan-200/20 transition-transform duration-300 group-hover:scale-[1.03]" />
              <span className="text-text-primary text-[11px] tracking-[0.12em] uppercase sm:text-sm">
                Press to talk
              </span>
            </button>
            <TextComposer
              value={textDraft}
              disabled={isRenderingCard}
              compact
              onChange={setTextDraft}
              onSubmit={handleTextSubmit}
            />
            <WelcomeExamples disabled={isRenderingCard} onSelect={submitTextPrompt} />
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

        {!showWelcome && !showVoiceTranscriptStrip && (
          <RecentTurns history={conversationHistory} onSelect={handleSelectPreviousTurn} />
        )}

        {!showWelcome && isRenderingCard && !shouldRenderResponseCard && (
          <div className="text-text-muted mb-3 w-full max-w-3xl rounded-xl border border-cyan-300/20 bg-cyan-500/[0.06] px-4 py-2 text-xs">
            Building visual response...
          </div>
        )}

        {!showWelcome && shouldRenderResponseCard && displayedResponse && (
          <div className="animate-fade-in-up mb-3 w-full max-w-3xl">
            <UIRenderer key={responseKey} response={displayedResponse} />
            <FollowUpActions
              response={displayedResponse}
              disabled={isRenderingCard || hasRateLimitResponse}
              onSelect={submitTextPrompt}
            />
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

      {!showWelcome && (
        <div className="border-border/50 bg-surface-0/92 relative z-20 flex shrink-0 flex-col items-center gap-2.5 border-t px-3 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] backdrop-blur-md sm:gap-3 sm:px-6">
          <TextComposer
            value={textDraft}
            disabled={isRenderingCard || hasRateLimitResponse}
            onChange={setTextDraft}
            onSubmit={handleTextSubmit}
          />
          <VoiceDock
            isSupported={isSupported}
            voiceState={voiceState}
            isMuted={isMuted}
            isLocked={hasRateLimitResponse}
            compact={compactBottomControls}
            onPrimaryAction={handlePrimaryVoiceAction}
            onToggleMute={() => setIsMuted((prev) => !prev)}
          />
        </div>
      )}
    </main>
  );
}
