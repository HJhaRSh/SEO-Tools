import { Metadata } from 'next';
import ToolsClient from './ToolsClient';

export const metadata: Metadata = {
  title: 'SEO Tools | Indian Marketers',
  description: 'Free and practical tools to analyse, troubleshoot and improve your website\'s SEO.',
};

export default function ToolsPage() {
  return <ToolsClient />;
}
