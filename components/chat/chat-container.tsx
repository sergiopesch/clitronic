'use client';

import { useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { useApiKey, ApiKeyModal } from '../api-key';

export function ChatContainer() {
  const { apiKey, isConfigured } = useApiKey();
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);

  // Create transport with API key in headers
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/chat',
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
    });
  }, [apiKey]);

  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSend = async (text: string, imageDataUrl?: string) => {
    if (!text.trim() && !imageDataUrl) return;

    // Prompt for API key if not configured
    if (!isConfigured) {
      setShowKeyPrompt(true);
      return;
    }

    if (imageDataUrl) {
      await sendMessage({
        text,
        files: [
          {
            type: 'file' as const,
            url: imageDataUrl,
            mediaType: 'image/jpeg',
          },
        ],
      });
    } else {
      await sendMessage({ text });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={messages as UIMessage[]} />
      <ChatInput onSend={handleSend} isLoading={isLoading} />
      <ApiKeyModal isOpen={showKeyPrompt} onClose={() => setShowKeyPrompt(false)} />
    </div>
  );
}
