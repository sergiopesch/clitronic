"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export function ChatContainer() {
  const { messages, sendMessage, status } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSend = async (text: string, imageDataUrl?: string) => {
    if (!text.trim() && !imageDataUrl) return;

    if (imageDataUrl) {
      await sendMessage({
        text,
        files: [
          {
            type: "file" as const,
            url: imageDataUrl,
            mediaType: "image/jpeg",
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
    </div>
  );
}
