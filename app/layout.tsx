import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clitronic - Local Electronics Console',
  description:
    'Console-first local electronics chat for testing the core interaction loop without provider auth or remote model calls.',
  keywords: [
    'electronics',
    'hardware',
    'local llm',
    'llama.cpp',
    'console ui',
    'circuits',
    'components',
  ],
  authors: [{ name: 'Sergio Peschiera' }],
  creator: 'Sergio Peschiera',
  openGraph: {
    title: 'Clitronic - Local Electronics Console',
    description:
      'A console-first local chat MVP for electronics thinking, learning, and future tool use.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clitronic',
  },
  twitter: {
    card: 'summary',
    title: 'Clitronic - Local Electronics Console',
    description:
      'Console-first local electronics chat for testing the interaction loop before tools and workbench layers return.',
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
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-0 text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
