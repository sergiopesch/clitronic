import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clitronic - Electronics Companion',
  description:
    'An AI-native electronics companion that turns questions into structured visual cards for circuits, components, and maker hardware.',
  keywords: ['electronics', 'hardware', 'openai', 'next.js', 'ai ui', 'circuits', 'components'],
  authors: [{ name: 'Sergio Peschiera' }],
  creator: 'Sergio Peschiera',
  openGraph: {
    title: 'Clitronic - Electronics Companion',
    description:
      'Structured visual answers for electronics questions, from specs to wiring guides.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clitronic',
  },
  twitter: {
    card: 'summary',
    title: 'Clitronic - Electronics Companion',
    description: 'Ask electronics questions and get animated, structured visual responses.',
  },
  appleWebApp: {
    capable: true,
    title: 'Clitronic',
    statusBarStyle: 'black-translucent',
  },
  applicationName: 'Clitronic',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#05070a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface-0 text-text-primary min-h-screen antialiased">{children}</body>
    </html>
  );
}
