'use client';

import dynamic from 'next/dynamic';

const LocalConsole = dynamic(
  () => import('@/components/console/local-console').then((mod) => mod.LocalConsole),
  { ssr: false }
);

export function HomeClient() {
  return <LocalConsole />;
}
