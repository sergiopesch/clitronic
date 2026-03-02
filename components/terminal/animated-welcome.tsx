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
    }, 900);
    return () => clearInterval(interval);
  }, []);

  const eyes = ROBOT_EYES[robotFrame];

  return (
    <div className={`mb-3 border-b border-cyan-900/30 pb-3 text-sm ${className}`}>
      <pre className="mb-2 text-xs leading-tight text-cyan-500/90">{`⚡ CLITRONIC
────────────────────────────────────────────────
electronics companion terminal        [${eyes}]`}</pre>
      <p className="text-xs text-gray-500">
        Type <span className="text-cyan-400">auth</span> to connect, then ask questions or run
        commands.
      </p>
      <p className="mt-1 text-[11px] text-gray-600">
        Commands: auth · help · identify · list · info resistor · clear
      </p>
    </div>
  );
}
