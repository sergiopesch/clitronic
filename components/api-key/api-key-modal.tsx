'use client';

import { useState } from 'react';
import { useApiKey } from './api-key-provider';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const {
    authSource,
    isConfigured,
    clearApiKey,
    connectClaudeCode,
    connectOpenAICodex,
    claudeCodeAvailable,
    codexAvailable,
    isCheckingAuth,
  } = useApiKey();
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const connectClaude = async () => {
    setError(null);
    const result = await connectClaudeCode();
    if (!result.success) {
      setError(result.error || 'Failed to connect Claude Code');
      return;
    }
    onClose();
  };

  const connectCodex = async () => {
    setError(null);
    const result = await connectOpenAICodex();
    if (!result.success) {
      setError(result.error || 'Failed to connect OpenAI Codex');
      return;
    }
    onClose();
  };

  const connectedLabel =
    authSource === 'claude-code'
      ? 'Claude Code'
      : authSource === 'openai-codex'
        ? 'OpenAI Codex'
        : 'None';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Authentication</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Connect with Claude Code or OpenAI Codex. Users never need to paste API keys.
        </p>

        <div className="space-y-2">
          <button
            onClick={connectClaude}
            disabled={isCheckingAuth || claudeCodeAvailable === false}
            className="w-full rounded-lg border border-cyan-200 px-4 py-2 text-left text-sm text-cyan-700 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connect Claude Code
          </button>

          <button
            onClick={connectCodex}
            disabled={isCheckingAuth || codexAvailable === false}
            className="w-full rounded-lg border border-emerald-200 px-4 py-2 text-left text-sm text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connect OpenAI Codex
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {isConfigured && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Connected: <span className="font-medium">{connectedLabel}</span>
            <button onClick={clearApiKey} className="ml-3 text-xs text-red-600 underline">
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
