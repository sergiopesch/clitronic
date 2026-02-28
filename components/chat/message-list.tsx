"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  messages: UIMessage[];
  onSuggestionClick?: (text: string) => void;
}

export function MessageList({ messages, onSuggestionClick }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 text-5xl">&#9889;</div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Clitronic
        </h2>
        <p className="mt-2 max-w-md text-zinc-500 dark:text-zinc-400">
          Your AI companion for learning electronics. Ask about components,
          circuits, or upload a photo to identify parts.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {[
            "What resistor do I need for an LED?",
            "How does a transistor work?",
            "Explain voltage dividers",
            "What is a capacitor used for?",
          ].map((suggestion) => (
            <button
              key={suggestion}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              onClick={() => {
                const input = document.querySelector("textarea");
                if (input) {
                  const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                  )?.set;
                  setter?.call(input, suggestion);
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  input.focus();
                }
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
