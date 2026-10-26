'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import IndianMarketersHeader from '@/components/IndianMarketersHeader';
import IndianMarketersFooter from '@/components/IndianMarketersFooter';
import AppSidebar from '@/components/AppSidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--im-bg)] text-[var(--im-text)]">
      {/* Live Indian Marketers Header */}
      <IndianMarketersHeader />

      {/* Mobile Tools Navigation Sub-Bar (Visible only on mobile/tablet) */}
      <div className="lg:hidden w-full bg-white border-b border-[var(--im-border)] px-4 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
        <Link
          href="/tools"
          className="inline-flex items-center gap-2 text-xs font-bold text-[var(--im-heading)] hover:text-[#4caf50] transition-colors"
        >
          <span className="w-6 h-6 rounded-md bg-[#f0fdf4] text-[#4caf50] flex items-center justify-center text-xs font-black">
            ⚡
          </span>
          <span>SEO Tools Suite</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--im-bg-soft)] border border-[var(--im-border)] text-xs font-semibold text-[var(--im-heading)] hover:border-[#4caf50] hover:text-[#4caf50] active:bg-gray-100 transition-all cursor-pointer"
          aria-label="Browse tools menu"
        >
          <svg className="w-3.5 h-3.5 text-[#4caf50]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>All Tools (15)</span>
        </button>
      </div>

      {/* Floating mobile tools menu button (with safe-area bottom offset) */}
      <div className="lg:hidden fixed bottom-safe right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-[#4caf50] to-[#388e3c] hover:from-[#43a047] hover:to-[#2e7d32] text-white font-semibold text-xs shadow-xl active:scale-95 transition-all cursor-pointer ring-2 ring-white/60"
          aria-label="Open SEO Tools menu"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Tools Menu</span>
        </button>
      </div>

      {/* Tools Content with Sidebar */}
      <div className="flex-1 flex w-full">
        <AppSidebar
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 px-3.5 py-4 sm:p-6 lg:p-8 w-full bg-[var(--im-bg-soft)] pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Live Indian Marketers Footer */}
      <IndianMarketersFooter />
    </div>
  );
}
