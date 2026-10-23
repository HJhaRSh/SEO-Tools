import type { Metadata } from 'next';
import { IBM_Plex_Sans, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--im-font-body',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--im-font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SEO Tools | Indian Marketers',
  description: 'Free and practical tools to analyse, troubleshoot and improve your website\'s SEO.',
  icons: {
    icon: [
      { url: '/tools/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/tools/images/indian-marketers-logo.png', type: 'image/png' },
      { url: '/tools/favicon.ico', sizes: 'any' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/tools/icon.svg',
    apple: '/tools/images/indian-marketers-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${plusJakartaSans.variable}`}>
      <body className="bg-[var(--im-bg)] text-[var(--im-text)] antialiased font-sans">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
