import { Metadata } from 'next';
import ToolsClient from './ToolsClient';

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

export default function ToolsPage() {
  return <ToolsClient />;
}
