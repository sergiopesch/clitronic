'use client';

import { useEffect, useState } from 'react';

interface AnimatedWelcomeProps {
  className?: string;
}

const ROBOT_EYES = ['● ●', '● ●', '● ●', '─ ─', '● ●'];

export function AnimatedWelcome({ className = '' }: AnimatedWelcomeProps) {
  const [robotFrame, setRobotFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRobotFrame((f) => (f + 1) % ROBOT_EYES.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const eyes = ROBOT_EYES[robotFrame];

  return (
    <div
      className={`mx-auto mb-4 w-full max-w-3xl rounded-xl border border-cyan-900/30 bg-[#0f1722]/65 p-4 font-mono shadow-[0_0_0_1px_rgba(34,211,238,0.08)] backdrop-blur-sm select-text ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-cyan-400 uppercase">Clitronic</p>
          <h2 className="text-base font-semibold tracking-[0.03em] text-cyan-200">
            Electronics Companion Terminal
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Ask practical electronics questions, identify parts from photos, and get build guidance.
          </p>
        </div>

        <pre className="leading-none text-cyan-300/90">{`╭─────╮
│ ${eyes} │
╰─┬─┬─╯
  ╵ ╵`}</pre>
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md border border-cyan-900/40 bg-[#0b1220] p-2">
          <p className="text-cyan-300">1. Connect Auth</p>
          <p className="mt-1 text-gray-500">Run `auth` and choose Claude Code or OpenAI Codex.</p>
        </div>
        <div className="rounded-md border border-cyan-900/40 bg-[#0b1220] p-2">
          <p className="text-cyan-300">2. Ask or Run Commands</p>
          <p className="mt-1 text-gray-500">Try `list`, `info resistor`, or any electronics question.</p>
        </div>
        <div className="rounded-md border border-cyan-900/40 bg-[#0b1220] p-2">
          <p className="text-cyan-300">3. Identify Components</p>
          <p className="mt-1 text-gray-500">Use `identify`, paste a screenshot, or drag in a photo.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-cyan-900/30 pt-3 text-xs">
        {['auth', 'help', 'identify', 'list', 'info resistor', 'clear'].map((command) => (
          <span
            key={command}
            className="rounded border border-gray-700/70 bg-gray-900/70 px-2 py-1 text-[11px] text-gray-300"
          >
            {command}
          </span>
        ))}
      </div>
    </div>
  );
}
