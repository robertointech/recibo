import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Recibo — Escrow Monitor' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-zinc-950">
      <body className="antialiased">{children}</body>
    </html>
  );
}
