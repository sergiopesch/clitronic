import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clitronic - AI Hardware Companion',
  description:
    'Your multimodal AI companion for learning electronics. Identify components, understand circuits, and get hands-on guidance.',
  keywords: [
    'electronics',
    'hardware',
    'AI',
    'components',
    'circuits',
    'Arduino',
    'Raspberry Pi',
    'resistor',
    'LED',
    'capacitor',
  ],
  authors: [{ name: 'Sergio Peschiera' }],
  creator: 'Sergio Peschiera',
  openGraph: {
    title: 'Clitronic - AI Hardware Companion',
    description:
      'Your multimodal AI companion for learning electronics. Identify components, understand circuits, and get hands-on guidance.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clitronic',
  },
  twitter: {
    card: 'summary',
    title: 'Clitronic - AI Hardware Companion',
    description:
      'Your multimodal AI companion for learning electronics. Identify components, understand circuits, and get hands-on guidance.',
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
  themeColor: '#0d1117',
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
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
