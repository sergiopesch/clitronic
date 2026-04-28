'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DAILY_LIMIT_DEFAULT, DAILY_LIMIT_MESSAGE } from '@/lib/ai/rate-limit';
import type { StructuredResponse, UIBlock } from '@/lib/ai/response-schema';

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
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(usage));
  } catch {}
  return usage.count;
}

function clearDailyUsage(): void {
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {}
}

/**
 * Summarize an assistant response for conversation history.
 * Instead of sending the full JSON blob, send a compact summary.
 */
function summarizeItems(items: string[] | { name: string }[]): string[] {
  return items
    .map((item) => (typeof item === 'string' ? item : item.name))
    .filter((value) => Boolean(value));
}

function summarizeUIBlock(ui: UIBlock): string {
  const parts: string[] = [`[Showed ${ui.component}]`];

  switch (ui.component) {
    case 'specCard':
      parts.push(ui.data.title);
      break;
    case 'comparisonCard': {
      const itemNames = summarizeItems(ui.data.items);
      if (itemNames.length > 0) parts.push(`Items: ${itemNames.join(', ')}`);
      break;
    }
    case 'explanationCard':
      parts.push(ui.data.title);
      break;
    case 'recommendationCard': {
      const itemNames = summarizeItems(ui.data.items);
      if (itemNames.length > 0) parts.push(`Items: ${itemNames.join(', ')}`);
      break;
    }
    case 'troubleshootingCard':
      parts.push(ui.data.issue);
      break;
    case 'calculationCard':
      parts.push(ui.data.title);
      break;
    case 'pinoutCard':
      parts.push(ui.data.component);
      break;
    case 'chartCard':
      parts.push(ui.data.title);
      break;
    case 'wiringCard':
      parts.push(ui.data.title);
      break;
    case 'imageBlock':
      parts.push(ui.data.caption);
      if (ui.data.searchQuery) {
        parts.push(`(searched: ${ui.data.searchQuery})`);
      }
      break;
  }

  return parts.join(' — ');
}

function summarizeAssistantResponse(structured: StructuredResponse): string {
  if (structured.mode === 'text' || !structured.ui) {
    return structured.text || '(responded with text)';
  }

  const parts = [summarizeUIBlock(structured.ui)];

  if (structured.text) parts.push(structured.text);
  return parts.join(' — ');
}

export function useConversationState() {
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [currentResponse, setCurrentResponse] = useState<StructuredResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseKey, setResponseKey] = useState(0);
  const [isDailyLimitReached, setIsDailyLimitReached] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsDailyLimitReached(getDailyUsage().count >= DAILY_LIMIT_DEFAULT);
  }, []);

  const showDailyLimitResponse = useCallback(() => {
    const limitResponse = buildDailyLimitResponse();
    setError(null);
    setCurrentResponse(limitResponse);
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
      if (!trimmedText || isLoading) return null;

      const usage = getDailyUsage();
      if (isDailyLimitReached || usage.count >= DAILY_LIMIT_DEFAULT) {
        return showDailyLimitResponse();
      }

      setError(null);
      setCurrentResponse(null);
      setIsLoading(true);

      const messages = [
        ...history.map((entry) => ({
          role: entry.role,
          content:
            entry.role === 'assistant' && entry.structured
              ? summarizeAssistantResponse(entry.structured)
              : entry.content,
        })),
        { role: 'user' as const, content: trimmedText },
      ];

      const controller = new AbortController();
      try {
        abortControllerRef.current = controller;
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

        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          throw new Error(payload.error ?? 'Request failed.');
        }

        const structured = (await res.json()) as StructuredResponse;
        if (structured.intent === 'rate_limit') {
          setCurrentResponse(structured);
          setResponseKey((k) => k + 1);
          setIsDailyLimitReached(true);
          return structured;
        }

        const nextCount = incrementDailyUsage();
        setIsDailyLimitReached(nextCount >= DAILY_LIMIT_DEFAULT);
        setCurrentResponse(structured);
        setResponseKey((k) => k + 1);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: trimmedText },
          { role: 'assistant', content: structured.text ?? '', structured },
        ]);

        return structured;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        return null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [history, isDailyLimitReached, isLoading, showDailyLimitResponse]
  );

  const cancelActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setError(null);
  }, []);

  const clearDisplayedResponse = useCallback(() => {
    setCurrentResponse(null);
    setError(null);
  }, []);

  const showHistoryResponse = useCallback(
    (historyIndex: number) => {
      const entry = history[historyIndex];
      if (entry?.role !== 'assistant' || !entry.structured) return false;

      setError(null);
      setCurrentResponse(entry.structured);
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
