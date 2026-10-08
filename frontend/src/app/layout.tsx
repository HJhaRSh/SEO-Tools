import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

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
    <html lang="en">
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Header />
          <main style={{ flex: 1, padding: '40px 0' }}>
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
