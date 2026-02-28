import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clitronic - AI Hardware Companion',
  description:
    'Your multimodal AI companion for learning electronics. Identify components, understand circuits, and get hands-on guidance.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
