import Link from 'next/link';
import React from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface ToolLayoutProps {
  title: string;
  description: string;
  category: string;
  breadcrumbs: Breadcrumb[];
  children: React.ReactNode; 
  aboutText: string;
  howItWorks: string[];
  faq: { question: string; answer: string }[];
  fullWidth?: boolean;
}

export default function ToolLayout({
  title,
  description,
  category,
  breadcrumbs,
  children,
  aboutText,
  howItWorks,
  faq,
  fullWidth = true
}: ToolLayoutProps) {
  return (
    <div className="w-full py-4 lg:py-6">
      
      {/* Back link */}
      <div className="mb-6">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--im-text-muted)] hover:text-[var(--im-heading)] transition-colors group">
          <div className="p-1.5 rounded-full bg-[var(--im-surface)] border border-[var(--im-border)] group-hover:border-[var(--im-primary-deep)] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </div>
          Back to all tools
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8 bg-[var(--im-secondary)] text-[var(--im-on-dark)] p-8 sm:p-10 rounded-[var(--im-radius-lg)] shadow-[var(--im-shadow-md)] relative overflow-hidden">
        <div className="inline-block px-3.5 py-1 rounded-[var(--im-radius-pill)] bg-[var(--im-primary)] text-[var(--im-secondary)] text-xs font-semibold uppercase tracking-wider mb-4">
          {category}
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[var(--im-on-dark)] mb-3 tracking-tight">{title}</h1>
        <p className="text-base sm:text-lg text-[var(--im-on-dark)]/85 max-w-3xl leading-relaxed">{description}</p>
      </div>

      {/* Main Tool Content */}
      <div className="mb-14">
        {children}
      </div>

      {/* Info Section */}
      <div className="grid gap-10 bg-[var(--im-surface)] border border-[var(--im-border)] p-8 lg:p-12 rounded-[var(--im-radius-lg)] shadow-[var(--im-shadow-sm)]">
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[var(--im-heading)]">About this tool</h2>
          </div>
          <p className="text-[var(--im-text)] leading-relaxed text-base">
            {aboutText}
          </p>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[var(--im-heading)]">How it works</h2>
          </div>
          <ol className="relative border-l-2 border-[var(--im-border)] ml-3.5 space-y-6">
            {howItWorks.map((step, idx) => (
              <li key={idx} className="pl-8 relative">
                <span className="absolute -left-4 top-0.5 w-8 h-8 bg-[var(--im-surface)] border-2 border-[var(--im-primary-deep)] rounded-full flex items-center justify-center text-xs font-bold text-[var(--im-secondary)] shadow-xs">
                  {idx + 1}
                </span>
                <p className="text-base text-[var(--im-text)] pt-0.5 leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {faq.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-[var(--im-heading)]">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {faq.map((item, idx) => (
                <div key={idx} className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-[var(--im-radius-md)] p-6 shadow-xs">
                  <h3 className="text-base font-semibold text-[var(--im-heading)] mb-2">{item.question}</h3>
                  <p className="text-[var(--im-text)] text-sm sm:text-base leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
