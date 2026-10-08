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
}

export default function ToolLayout({
  title,
  description,
  category,
  breadcrumbs,
  children,
  aboutText,
  howItWorks,
  faq
}: ToolLayoutProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      
      {/* Back link */}
      <div className="mb-6">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
          <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </div>
          Back to all tools
        </Link>
      </div>

      {/* Header */}
      <div className="mb-10 text-center sm:text-left bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[50px] rounded-full -z-10 pointer-events-none"></div>
        <div className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-4 border border-blue-100 dark:border-blue-800/50">
          {category}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">{title}</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">{description}</p>
      </div>

      {/* Main Tool Content */}
      <div className="mb-16">
        {children}
      </div>

      {/* Info Section */}
      <div className="grid gap-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 lg:p-12 rounded-3xl">
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">About this tool</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm md:text-base">
            {aboutText}
          </p>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">How it works</h2>
          </div>
          <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-3 space-y-6">
            {howItWorks.map((step, idx) => (
              <li key={idx} className="pl-6 relative">
                <span className="absolute -left-3.5 top-0 w-7 h-7 bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                  {idx + 1}
                </span>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {faq.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {faq.map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{item.question}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
