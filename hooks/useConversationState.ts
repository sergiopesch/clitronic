'use client';

import { useCallback, useRef, useState } from 'react';
import { serializeStructuredResponseContext } from '@/lib/ai/conversation-context';
import { DAILY_LIMIT_DEFAULT, DAILY_LIMIT_MESSAGE } from '@/lib/ai/rate-limit';
import { decodeStructuredResponse } from '@/lib/ai/response-contract';
import type { StructuredResponse } from '@/lib/ai/response-schema';
import { isActiveRequest } from './conversation-request-state';

export type ConversationEntry = {
  role: 'user' | 'assistant';
  content: string;
  structured?: StructuredResponse;
};

type SubmitInput = {
  text: string;
  inputMode?: 'text' | 'voice';
  transcriptMeta?: {
    raw?: string;
    cleaned?: string;
  };
};

const RATE_LIMIT_KEY =
  process.env.NODE_ENV === 'development' ? 'clitronic_daily_dev' : 'clitronic_daily';

function buildDailyLimitResponse(): StructuredResponse {
  return {
    intent: 'rate_limit',
    mode: 'text',
    ui: null,
    text: DAILY_LIMIT_MESSAGE,
    behavior: null,
    voice: null,
  };
}

function getDailyUsage(): { count: number; date: string } {
  if (typeof window === 'undefined') {
    return { count: 0, date: new Date().toDateString() };
  }
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { count: number; date: string };
      if (parsed.date === new Date().toDateString()) return parsed;
    }
  } catch {}
  return { count: 0, date: new Date().toDateString() };
}

function incrementDailyUsage(): number {
  const usage = getDailyUsage();
  usage.count++;
  if (typeof window === 'undefined') return usage.count;
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(usage));
  } catch {}
  return usage.count;
}

function clearDailyUsage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {}
}

export function useConversationState() {
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [currentResponse, setCurrentResponse] = useState<StructuredResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseKey, setResponseKey] = useState(0);
  const [displayedAssistantIndex, setDisplayedAssistantIndex] = useState<number | null>(null);
  const [isDailyLimitReached, setIsDailyLimitReached] = useState(
    () => getDailyUsage().count >= DAILY_LIMIT_DEFAULT
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  const showDailyLimitResponse = useCallback(() => {
    const limitResponse = buildDailyLimitResponse();
    setError(null);
    setCurrentResponse(limitResponse);
    setDisplayedAssistantIndex(null);
    setResponseKey((k) => k + 1);
    setIsDailyLimitReached(true);
    return limitResponse;
  }, []);

  const guardDailyLimit = useCallback(() => {
    const usage = getDailyUsage();
    if (isDailyLimitReached || usage.count >= DAILY_LIMIT_DEFAULT) {
      showDailyLimitResponse();
      return false;
    }
    return true;
  }, [isDailyLimitReached, showDailyLimitResponse]);

  const submit = useCallback(
    async ({
      text,
      inputMode = 'text',
      transcriptMeta,
    }: SubmitInput): Promise<StructuredResponse | null> => {
      const trimmedText = text.trim();
      if (!trimmedText || abortControllerRef.current) return null;

      const usage = getDailyUsage();
      if (isDailyLimitReached || usage.count >= DAILY_LIMIT_DEFAULT) {
        return showDailyLimitResponse();
      }

      const messages = [
        ...history.map((entry) => ({
          role: entry.role,
          content:
            entry.role === 'assistant' && entry.structured
              ? serializeStructuredResponseContext(entry.structured)
              : entry.content,
        })),
        { role: 'user' as const, content: trimmedText },
      ];

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);
      setCurrentResponse(null);
      setDisplayedAssistantIndex(null);
      setIsLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            inputMode,
            transcriptMeta,
          }),
          signal: controller.signal,
        });
        if (!isActiveRequest(abortControllerRef.current, controller)) return null;

        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          if (!isActiveRequest(abortControllerRef.current, controller)) return null;
          throw new Error(payload.error ?? 'Request failed.');
        }

        const payload: unknown = await res.json().catch(() => null);
        if (!isActiveRequest(abortControllerRef.current, controller)) return null;
        const structured = decodeStructuredResponse(payload);
        if (!isActiveRequest(abortControllerRef.current, controller)) return null;
        if (structured.intent === 'rate_limit') {
          setCurrentResponse(structured);
          setDisplayedAssistantIndex(null);
          setResponseKey((k) => k + 1);
          setIsDailyLimitReached(true);
          return structured;
        }

        const nextCount = incrementDailyUsage();
        setIsDailyLimitReached(nextCount >= DAILY_LIMIT_DEFAULT);
        setCurrentResponse(structured);
        setDisplayedAssistantIndex(history.length + 1);
        setResponseKey((k) => k + 1);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: trimmedText },
          { role: 'assistant', content: structured.text ?? '', structured },
        ]);

        return structured;
      } catch (err) {
        if (
          (err instanceof Error && err.name === 'AbortError') ||
          !isActiveRequest(abortControllerRef.current, controller)
        ) {
          return null;
        }
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        return null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [history, isDailyLimitReached, showDailyLimitResponse]
  );

  const cancelActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setError(null);
  }, []);

  const clearDisplayedResponse = useCallback(() => {
    setCurrentResponse(null);
    setDisplayedAssistantIndex(null);
    setError(null);
  }, []);

  const showHistoryResponse = useCallback(
    (historyIndex: number) => {
      const entry = history[historyIndex];
      if (entry?.role !== 'assistant' || !entry.structured) return false;

      setError(null);
      setCurrentResponse(entry.structured);
      setDisplayedAssistantIndex(historyIndex);
      setResponseKey((k) => k + 1);
      return true;
    },
    [history]
  );

  const resetDailyUsage = useCallback(() => {
    clearDailyUsage();
    setIsDailyLimitReached(false);
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setHistory([]);
    setCurrentResponse(null);
    setDisplayedAssistantIndex(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    isLoading,
    error,
    history,
    responseKey,
    isDailyLimitReached,
    displayedResponse: currentResponse,
    displayedAssistantIndex,
    guardDailyLimit,
    showDailyLimitResponse,
    resetDailyUsage,
    cancelActiveRequest,
    clearDisplayedResponse,
    showHistoryResponse,
    submit,
    reset,
  };
}
