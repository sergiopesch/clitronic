'use client';

import { useEffect, useState } from 'react';

interface AnimatedWelcomeProps {
  className?: string;
}

// Static sparkle positions
const SPARKLES = [
  { x: 5, y: 1, char: '✦' },
  { x: 35, y: 0, char: '⚡' },
  { x: 65, y: 1, char: '✧' },
  { x: 55, y: 3, char: '✦' },
  { x: 72, y: 6, char: '⚡' },
  { x: 8, y: 10, char: '✧' },
  { x: 60, y: 12, char: '✦' },
];

// Robot frames for subtle eye blink only
const ROBOT_EYES = ['◉   ◉', '◉   ◉', '◉   ◉', '─   ─', '◉   ◉'];

export function AnimatedWelcome({ className = '' }: AnimatedWelcomeProps) {
  const [robotFrame, setRobotFrame] = useState(0);

  // Only animate robot eyes (subtle blink)
  useEffect(() => {
    const interval = setInterval(() => {
      setRobotFrame((f) => (f + 1) % ROBOT_EYES.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const robotEyes = ROBOT_EYES[robotFrame];

  return (
    <div className={`relative font-mono text-xs leading-tight select-text ${className}`}>
      {/* Static sparkles layer */}
      <div className="absolute inset-0 pointer-events-none">
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="absolute text-cyan-500/40"
            style={{ left: `${s.x}ch`, top: `${s.y * 1.3}em` }}
          >
            {s.char}
          </span>
        ))}
      </div>

      {/* Main content - static layout */}
      <pre className="text-cyan-500/90 whitespace-pre">
{`
         ─────┬───────────────────────────────────┬─────
              │                                   │
    `}<span className="text-yellow-400">{`╱╲`}</span>{`   ─────┼───────────────────────────────────┼─────        `}<span className="text-cyan-400">{`╭───────╮`}</span>{`
   `}<span className="text-yellow-400">{`╱▓▓╲`}</span>{`       │                                   │             `}<span className="text-cyan-400">{`│ ${robotEyes} │`}</span>{`
   `}<span className="text-yellow-300">{`│▓▓│`}</span>{`  ═════╪═══════════════════════════════════╪═════        `}<span className="text-cyan-400">{`│  ▽   │`}</span>{`
   `}<span className="text-yellow-400">{`│▓▓│`}</span>{`       │     `}<span className="text-cyan-300 font-bold">{`C L I T R O N I C`}</span>{`         │             `}<span className="text-cyan-400">{`╰───────╯`}</span>{`
    `}<span className="text-yellow-500">{`╲╱`}</span>{`   ─────┼───────────────────────────────────┼─────       `}<span className="text-cyan-400">{`╭┴───────┴╮`}</span>{`
    `}<span className="text-yellow-600">{`││`}</span>{`        │  `}<span className="text-cyan-400/80">{`⚡ AI Electronics Companion ⚡`}</span>{`   │            `}<span className="text-cyan-400">{`│ ░░░░░░░ │`}</span>{`
    `}<span className="text-yellow-700">{`╧╧`}</span>{`   ─────┴───────────────────────────────────┴─────       `}<span className="text-cyan-400">{`│ ░░░░░░░ │`}</span>{`
   `}<span className="text-yellow-500/70">{`LED`}</span>{`                                                         `}<span className="text-cyan-400">{`╰─┬─────┬─╯`}</span>{`
                                                                 `}<span className="text-cyan-400">{`│     │`}</span>{`
         `}<span className="text-amber-600">{`──┤████├──`}</span>{`             `}<span className="text-green-400">{`┌─────┐`}</span>{`                     `}<span className="text-cyan-400">{`═╧═   ═╧═`}</span>{`
         `}<span className="text-amber-500/70">{`Resistor`}</span>{`              `}<span className="text-green-400">{`─┤  ●  ├─`}</span>{`                     `}<span className="text-cyan-500/70">{`CHIP`}</span>{`
                                `}<span className="text-green-400">{`─┤ IC  ├─`}</span>{`
   `}<span className="text-cyan-600/40">{`────────────●─────────────────`}</span>{`   `}<span className="text-green-400">{`─┤     ├─`}</span>{`
                                `}<span className="text-green-400">{`└─────┘`}</span>{`
`}
      </pre>

      {/* Commands section */}
      <div className="mt-2 text-cyan-600/80">
        <span className="text-cyan-500">Commands:</span>{' '}
        <span className="text-gray-400">help</span> •{' '}
        <span className="text-gray-400">identify</span> •{' '}
        <span className="text-gray-400">list</span> •{' '}
        <span className="text-gray-400">info</span> •{' '}
        <span className="text-gray-400">clear</span>
      </div>
      <div className="text-cyan-600/60">
        Or ask anything about electronics! Drop an image to identify.
      </div>
    </div>
  );
}
