'use client';

import { useEffect, useState } from 'react';

interface AnimatedWelcomeProps {
  className?: string;
}

// Sparkle positions (will animate)
const SPARKLE_POSITIONS = [
  { x: 5, y: 1, char: '✦' },
  { x: 35, y: 0, char: '⚡' },
  { x: 65, y: 1, char: '✧' },
  { x: 12, y: 5, char: '●' },
  { x: 55, y: 3, char: '✦' },
  { x: 72, y: 6, char: '⚡' },
  { x: 8, y: 10, char: '✧' },
  { x: 40, y: 8, char: '●' },
  { x: 60, y: 12, char: '✦' },
  { x: 25, y: 14, char: '⚡' },
];

// Robot frames for animation
const ROBOT_EYES = ['◉   ◉', '─   ─', '◠   ◠', '◉   ◉', '◉   ◉'];
const ROBOT_MOUTHS = ['  ▽  ', '  ◡  ', '  ▽  ', '  ◡  ', '  ─  '];

// LED glow animation
const LED_CHARS = ['▓', '▒', '░', '▒'];

export function AnimatedWelcome({ className = '' }: AnimatedWelcomeProps) {
  const [robotFrame, setRobotFrame] = useState(0);
  const [ledFrame, setLedFrame] = useState(0);
  const [sparkles, setSparkles] = useState(SPARKLE_POSITIONS);
  const [electronPos, setElectronPos] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  // Robot blink animation
  useEffect(() => {
    const interval = setInterval(() => {
      setRobotFrame((f) => (f + 1) % ROBOT_EYES.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // LED glow animation
  useEffect(() => {
    const interval = setInterval(() => {
      setLedFrame((f) => (f + 1) % LED_CHARS.length);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Sparkle twinkle animation
  useEffect(() => {
    const interval = setInterval(() => {
      setSparkles((prev) =>
        prev.map((s) => ({
          ...s,
          char: Math.random() > 0.7
            ? ['✦', '✧', '⚡', '●', '○', '·'][Math.floor(Math.random() * 6)]
            : s.char,
        }))
      );
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Electron flow animation
  useEffect(() => {
    const interval = setInterval(() => {
      setElectronPos((p) => (p + 1) % 40);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((c) => !c);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  const ledChar = LED_CHARS[ledFrame];
  const robotEyes = ROBOT_EYES[robotFrame];
  const robotMouth = ROBOT_MOUTHS[robotFrame];

  // Generate electron trail
  const electronTrail = '─'.repeat(electronPos) + '●' + '─'.repeat(Math.max(0, 39 - electronPos));

  return (
    <div className={`relative font-mono text-xs leading-tight select-text ${className}`}>
      {/* Sparkles layer */}
      <div className="absolute inset-0 pointer-events-none">
        {sparkles.map((s, i) => (
          <span
            key={i}
            className="absolute text-cyan-500/50 transition-opacity duration-300"
            style={{ left: `${s.x}ch`, top: `${s.y * 1.3}em` }}
          >
            {s.char}
          </span>
        ))}
      </div>

      {/* Main content */}
      <pre className="text-cyan-500/90">
{`
         ─────┬───────────────────────────────────┬─────
              │                                   │
    `}<span className="text-yellow-400">{`╱╲`}</span>{`   ─────┼───────────────────────────────────┼─────        `}<span className="text-cyan-400">{`╭───────╮`}</span>{`
   `}<span className="text-yellow-400">{`╱${ledChar}${ledChar}╲`}</span>{`       │                                   │             `}<span className="text-cyan-400">{`│ ${robotEyes} │`}</span>{`
   `}<span className="text-yellow-300">{`│${ledChar}${ledChar}│`}</span>{`  ═════╪═══════════════════════════════════╪═════        `}<span className="text-cyan-400">{`│${robotMouth}│`}</span>{`
   `}<span className="text-yellow-400">{`│${ledChar}${ledChar}│`}</span>{`       │     `}<span className="text-cyan-300 font-bold">{`C L I T R O N I C`}</span>{`         │             `}<span className="text-cyan-400">{`╰───────╯`}</span>{`
    `}<span className="text-yellow-500">{`╲╱`}</span>{`   ─────┼───────────────────────────────────┼─────       `}<span className="text-cyan-400">{`╭┴───────┴╮`}</span>{`
    `}<span className="text-yellow-600">{`││`}</span>{`        │  `}<span className="text-cyan-400/80">{`⚡ AI Electronics Companion ⚡`}</span>{`   │            `}<span className="text-cyan-400">{`│ ░░░░░░░ │`}</span>{`
    `}<span className="text-yellow-700">{`╧╧`}</span>{`   ─────┴───────────────────────────────────┴─────       `}<span className="text-cyan-400">{`│ ░░░░░░░ │`}</span>{`
   `}<span className="text-yellow-500/70">{`LED`}</span>{`                                                         `}<span className="text-cyan-400">{`╰─┬─────┬─╯`}</span>{`
                                                                 `}<span className="text-cyan-400">{`│     │`}</span>{`
         `}<span className="text-amber-600">{`──┤████├──`}</span>{`             `}<span className="text-green-400">{`┌─────┐`}</span>{`                     `}<span className="text-cyan-400">{`═╧═   ═╧═`}</span>{`
         `}<span className="text-amber-500/70">{`Resistor`}</span>{`              `}<span className="text-green-400">{`─┤  ●  ├─`}</span>{`                     `}<span className="text-cyan-500/70">{`CHIP`}</span>{`
                                `}<span className="text-green-400">{`─┤ IC  ├─`}</span>{`
   `}<span className="text-cyan-600/40">{electronTrail}</span>{`   `}<span className="text-green-400">{`─┤     ├─`}</span>{`
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
      <div className="mt-1 text-gray-600">
        {showCursor && <span className="text-cyan-400">▌</span>}
      </div>
    </div>
  );
}
