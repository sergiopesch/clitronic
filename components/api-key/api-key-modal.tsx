'use client';

import { useState } from 'react';
import { useApiKey } from './api-key-provider';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const { apiKey, setApiKey, clearApiKey, isConfigured } = useApiKey();
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (inputValue.trim()) {
      setApiKey(inputValue.trim());
      setInputValue('');
      onClose();
    }
  };

  const handleRemove = () => {
    clearApiKey();
    setInputValue('');
  };

  const maskedKey = apiKey ? `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">API Key Settings</h2>
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

        {isConfigured ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-medium text-green-800">API Key Configured</span>
              </div>
              <p className="mt-2 font-mono text-sm text-green-700">
                {showKey ? apiKey : maskedKey}
              </p>
              <button
                onClick={() => setShowKey(!showKey)}
                className="mt-1 text-xs text-green-600 underline"
              >
                {showKey ? 'Hide' : 'Show'} full key
              </button>
            </div>

            <button
              onClick={handleRemove}
              className="w-full rounded-lg border border-red-200 px-4 py-2 text-red-600 transition-colors hover:bg-red-50"
            >
              Remove API Key
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter your Anthropic API key to start chatting. Your key is stored locally in your
              browser and never sent to our servers.
            </p>

            <div>
              <label htmlFor="api-key" className="mb-1 block text-sm font-medium text-gray-700">
                API Key
              </label>
              <input
                id="api-key"
                type="password"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="sk-ant-..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!inputValue.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save API Key
            </button>

            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-blue-600 hover:underline"
            >
              Get an API key from Anthropic →
            </a>
          </div>
        )}

        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <div className="text-xs text-gray-500">
              <p className="font-medium text-gray-700">Security</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>Stored only in your browser&apos;s localStorage</li>
                <li>Never sent to or stored on our servers</li>
                <li>Sent directly to Anthropic&apos;s API over HTTPS</li>
                <li>You can remove it anytime</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
