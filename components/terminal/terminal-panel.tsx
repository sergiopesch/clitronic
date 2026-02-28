'use client';

import { useEffect, useRef, useState } from 'react';

const HELP_TEXT = `Clitronic Terminal - Hardware Companion

Commands:
  list [category]     List components (categories: passive, active, input, output)
  info <component>    Show component details
  ask <question>      Ask the AI companion a question
  help                Show this help message
  clear               Clear the terminal

Examples:
  list passive
  info resistor
  ask What resistor do I need for an LED?
`;

export function TerminalPanel() {
  const [lines, setLines] = useState<string[]>(["Clitronic v0.1.0 - Type 'help' for commands", '']);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const addLines = (...newLines: string[]) => {
    setLines((prev) => [...prev, ...newLines]);
  };

  const handleCommand = async (cmd: string) => {
    addLines(`> ${cmd}`);
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1).join(' ');

    if (!command) return;

    if (command === 'help') {
      addLines(HELP_TEXT);
      return;
    }

    if (command === 'clear') {
      setLines(["Clitronic v0.1.0 - Type 'help' for commands", '']);
      return;
    }

    if (command === 'list') {
      setIsProcessing(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: args
                  ? `List all ${args} components from your knowledge base. Be concise - just list the name and a one-line description for each.`
                  : 'List all components in your knowledge base. Be concise - just list the name and a one-line description for each, grouped by category.',
              },
            ],
          }),
        });
        const text = await readStreamAsText(res);
        addLines(text, '');
      } catch {
        addLines('Error: Failed to fetch component list', '');
      }
      setIsProcessing(false);
      return;
    }

    if (command === 'info') {
      if (!args) {
        addLines('Usage: info <component-name>', '');
        return;
      }
      setIsProcessing(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `Look up the component "${args}" and give me its full specs, pinout, circuit example, and tips. Use your lookup_component tool.`,
              },
            ],
          }),
        });
        const text = await readStreamAsText(res);
        addLines(text, '');
      } catch {
        addLines('Error: Failed to fetch component info', '');
      }
      setIsProcessing(false);
      return;
    }

    if (command === 'ask') {
      if (!args) {
        addLines('Usage: ask <your question>', '');
        return;
      }
      setIsProcessing(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: args }],
          }),
        });
        const text = await readStreamAsText(res);
        addLines(text, '');
      } catch {
        addLines('Error: Failed to get response', '');
      }
      setIsProcessing(false);
      return;
    }

    addLines(`Unknown command: ${command}. Type 'help' for available commands.`, '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleCommand(input);
      setInput('');
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-zinc-950 font-mono text-sm text-green-400"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex-1 overflow-y-auto p-4">
        {lines.map((line, i) => (
          <div key={i} className="leading-relaxed whitespace-pre-wrap">
            {line}
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="text-blue-400">clitronic&gt;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="flex-1 border-none bg-transparent text-green-400 outline-none"
            autoFocus
          />
          {isProcessing && <span className="animate-pulse text-yellow-400">thinking...</span>}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

async function readStreamAsText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return 'Error: No response body';

  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Parse the Vercel AI SDK data stream format
    // Lines look like: 0:"text content"\n
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('0:"')) {
        // Text delta
        try {
          const text = JSON.parse(line.slice(2));
          result += text;
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  return result || '(No response)';
}
