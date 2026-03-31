'use client';

import { useId } from 'react';

/**
 * Pixel-grid logo for Clitronic.
 * Each letter is defined on a 5-row grid using rectangular blocks.
 * Blue-to-cyan gradient across the full word.
 */

// Each letter: array of [col, row, width] blocks on a 5-row grid
// col/row are 0-indexed, width in grid units
type Block = [number, number, number];

const LETTERS: Record<string, { width: number; blocks: Block[] }> = {
  C: {
    width: 4,
    blocks: [
      [0, 0, 4],
      [0, 1, 1],
      [0, 2, 1],
      [0, 3, 1],
      [0, 4, 4],
    ],
  },
  L: {
    width: 4,
    blocks: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 2, 1],
      [0, 3, 1],
      [0, 4, 4],
    ],
  },
  I: {
    width: 3,
    blocks: [
      [0, 0, 3],
      [1, 1, 1],
      [1, 2, 1],
      [1, 3, 1],
      [0, 4, 3],
    ],
  },
  T: {
    width: 5,
    blocks: [
      [0, 0, 5],
      [2, 1, 1],
      [2, 2, 1],
      [2, 3, 1],
      [2, 4, 1],
    ],
  },
  R: {
    width: 4,
    blocks: [
      [0, 0, 4],
      [0, 1, 1],
      [3, 1, 1],
      [0, 2, 4],
      [0, 3, 1],
      [2, 3, 1],
      [0, 4, 1],
      [3, 4, 1],
    ],
  },
  O: {
    width: 4,
    blocks: [
      [0, 0, 4],
      [0, 1, 1],
      [3, 1, 1],
      [0, 2, 1],
      [3, 2, 1],
      [0, 3, 1],
      [3, 3, 1],
      [0, 4, 4],
    ],
  },
  N: {
    width: 4,
    blocks: [
      [0, 0, 1],
      [3, 0, 1],
      [0, 1, 2],
      [3, 1, 1],
      [0, 2, 1],
      [1, 2, 1],
      [3, 2, 1],
      [0, 3, 1],
      [2, 3, 2],
      [0, 4, 1],
      [3, 4, 1],
    ],
  },
};

const WORD = ['C', 'L', 'I', 'T', 'R', 'O', 'N', 'I', 'C'];
const CELL = 6; // px per grid cell
const GAP = 1.5; // gap between cells
const LETTER_GAP = 3; // extra gap between letters

interface LogoProps {
  scale?: number;
  className?: string;
}

export function Logo({ scale = 1, className }: LogoProps) {
  const gradientId = `clitronic-grad-${useId().replace(/:/g, '')}`;
  // Calculate total width
  let totalCols = 0;
  for (let i = 0; i < WORD.length; i++) {
    const letter = LETTERS[WORD[i]];
    totalCols += letter.width;
    if (i < WORD.length - 1) totalCols += LETTER_GAP / CELL;
  }

  const svgW = totalCols * (CELL + GAP) * scale;
  const svgH = 5 * (CELL + GAP) * scale;
  // Build blocks with absolute x positions
  const allBlocks: { x: number; y: number; w: number }[] = [];
  let offsetX = 0;

  for (let i = 0; i < WORD.length; i++) {
    const letter = LETTERS[WORD[i]];
    for (const [col, row, width] of letter.blocks) {
      allBlocks.push({
        x: (offsetX + col) * (CELL + GAP),
        y: row * (CELL + GAP),
        w: width * (CELL + GAP) - GAP,
      });
    }
    offsetX += letter.width;
    if (i < WORD.length - 1) offsetX += LETTER_GAP / CELL;
  }

  return (
    <svg
      viewBox={`0 0 ${svgW / scale} ${svgH / scale}`}
      width={svgW}
      height={svgH}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: '100%' }}
      role="img"
      aria-label="Clitronic"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e7ae6" />
          <stop offset="40%" stopColor="#22b8e8" />
          <stop offset="100%" stopColor="#22e8ee" />
        </linearGradient>
      </defs>
      {allBlocks.map((block, i) => (
        <rect
          key={i}
          x={block.x}
          y={block.y}
          width={block.w}
          height={CELL - GAP}
          rx={1}
          fill={`url(#${gradientId})`}
        />
      ))}
    </svg>
  );
}
