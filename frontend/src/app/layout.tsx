import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--im-font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SEO Tools | Indian Marketers',
  description: 'Free and practical tools to analyse, troubleshoot and improve your website\'s SEO.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="bg-[var(--im-bg)] text-[var(--im-text)] antialiased font-sans">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
