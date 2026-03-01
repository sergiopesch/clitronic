'use client';

import { useEffect, useState } from 'react';

interface AnimatedWelcomeProps {
  className?: string;
}

// Robot frames for subtle eye blink only
const ROBOT_EYES = ['◉ ◉', '◉ ◉', '◉ ◉', '─ ─', '◉ ◉'];

export function AnimatedWelcome({ className = '' }: AnimatedWelcomeProps) {
  const [robotFrame, setRobotFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRobotFrame((f) => (f + 1) % ROBOT_EYES.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const robotEyes = ROBOT_EYES[robotFrame];

  return (
    <div className={`font-mono select-text ${className}`}>
      {/* Pixel-style CLITRONIC logo with circuit connections */}
      <pre className="text-cyan-400 text-xs leading-[1.15] whitespace-pre">
{`
  ┌───────┐            ┌───┐  ┌───────────┐  ┌───────┐    ┌───────┐    ┌───┐   ┌───┐  ┌───┐    ┌───────┐
  │`}<span className="text-cyan-300">{`███████`}</span>{`│            │`}<span className="text-cyan-300">{`███`}</span>{`│  │`}<span className="text-cyan-300">{`███████████`}</span>{`│  │`}<span className="text-cyan-300">{`███████`}</span>{`│    │`}<span className="text-cyan-300">{`███████`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`│   │`}<span className="text-cyan-300">{`███`}</span>{`│  │`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███████`}</span>{`│
  │`}<span className="text-cyan-300">{`███`}</span>{`├───┘            │`}<span className="text-cyan-300">{`███`}</span>{`│  └───┤`}<span className="text-cyan-300">{`███`}</span>{`├───┘  │`}<span className="text-cyan-300">{`███`}</span>{`├───┘    │`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`├──┼`}<span className="text-cyan-300">{`███`}</span>{`┤  │`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`├───┘
  │`}<span className="text-cyan-300">{`███`}</span>{`│                │`}<span className="text-cyan-300">{`███`}</span>{`│      │`}<span className="text-cyan-300">{`███`}</span>{`│      │`}<span className="text-cyan-300">{`███`}</span>{`├───┐    │`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│  │`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`│
  │`}<span className="text-cyan-300">{`███`}</span>{`│    ┌───────┐   │`}<span className="text-cyan-300">{`███`}</span>{`│      │`}<span className="text-cyan-300">{`███`}</span>{`│      │`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│`}<span className="text-cyan-300">{`███`}</span>{`│  │`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███`}</span>{`│
  │`}<span className="text-cyan-300">{`███████`}</span>{`│   │`}<span className="text-cyan-300">{`███████`}</span>{`│   │`}<span className="text-cyan-300">{`███`}</span>{`│      │`}<span className="text-cyan-300">{`███`}</span>{`│      │`}<span className="text-cyan-300">{`███████`}</span>{`│    └`}<span className="text-cyan-300">{`███`}</span>{`┴`}<span className="text-cyan-300">{`███`}</span>{`┘    │`}<span className="text-cyan-300">{`███`}</span>{`│   │`}<span className="text-cyan-300">{`███`}</span>{`│  │`}<span className="text-cyan-300">{`███`}</span>{`│    │`}<span className="text-cyan-300">{`███████`}</span>{`│
  └───────┘   └───────┘   └───┘      └───┘      └───────┘                 └───┘   └───┘  └───┘    └───────┘
`}
      </pre>

      {/* Tagline */}
      <div className="text-center text-cyan-400/80 text-sm mb-3">
        ⚡ AI-Powered Electronics Companion ⚡
      </div>

      {/* Components row */}
      <pre className="text-cyan-500/80 text-xs leading-tight whitespace-pre">
{`   `}<span className="text-yellow-400">{`╱╲`}</span>{`                                                        `}<span className="text-cyan-400">{`╭───────╮`}</span>{`
  `}<span className="text-yellow-400">{`╱▓▓╲`}</span>{`    `}<span className="text-amber-500">{`──┤████├──`}</span>{`         `}<span className="text-green-400">{`┌─────┐`}</span>{`                  `}<span className="text-cyan-400">{`│ ${robotEyes} │`}</span>{`
  `}<span className="text-yellow-300">{`│▓▓│`}</span>{`                        `}<span className="text-green-400">{`─┤  ●  ├─`}</span>{`                 `}<span className="text-cyan-400">{`│  ◡   │`}</span>{`
  `}<span className="text-yellow-400">{`│▓▓│`}</span>{`                        `}<span className="text-green-400">{`─┤ IC  ├─`}</span>{`                 `}<span className="text-cyan-400">{`╰───────╯`}</span>{`
   `}<span className="text-yellow-500">{`╲╱`}</span>{`   ═══════●═══════════  `}<span className="text-green-400">{`─┤     ├─`}</span>{`  ═══════════  `}<span className="text-cyan-400">{`╭┴───────┴╮`}</span>{`
   `}<span className="text-yellow-600">{`││`}</span>{`                        `}<span className="text-green-400">{`└─────┘`}</span>{`                 `}<span className="text-cyan-400">{`│ ░░░░░░░ │`}</span>{`
   `}<span className="text-yellow-700">{`╧╧`}</span>{`                                                    `}<span className="text-cyan-400">{`╰─┬─────┬─╯`}</span>{`
  `}<span className="text-yellow-500/60">{`LED`}</span>{`       `}<span className="text-amber-500/60">{`RESISTOR`}</span>{`           `}<span className="text-green-500/60">{`IC`}</span>{`                       `}<span className="text-cyan-400">{`═╧═   ═╧═`}</span>{`
                                                          `}<span className="text-cyan-500/60">{`CHIP`}</span>
      </pre>

      {/* Commands section */}
      <div className="mt-3 pt-2 border-t border-cyan-800/30 text-xs">
        <span className="text-cyan-500">Commands:</span>{' '}
        <span className="text-gray-400">help</span> •{' '}
        <span className="text-gray-400">identify</span> •{' '}
        <span className="text-gray-400">list</span> •{' '}
        <span className="text-gray-400">info</span> •{' '}
        <span className="text-gray-400">clear</span>
        <span className="text-gray-600 ml-4">Drop an image to identify components!</span>
      </div>
    </div>
  );
}
