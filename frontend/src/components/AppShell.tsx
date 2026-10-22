'use client';

import React, { useState } from 'react';
import IndianMarketersHeader from '@/components/IndianMarketersHeader';
import IndianMarketersFooter from '@/components/IndianMarketersFooter';
import AppSidebar from '@/components/AppSidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--im-bg)] text-[var(--im-text)]">
      {/* Live Indian Marketers Header */}
      <IndianMarketersHeader />

      {/* Floating mobile tools menu button (only visible on mobile/tablet) */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#4caf50] text-white font-medium text-xs shadow-lg hover:bg-[#43a047] transition-all cursor-pointer active:scale-95"
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
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 w-full bg-[var(--im-bg-soft)]">
          {children}
        </main>
      </div>

      {/* Live Indian Marketers Footer */}
      <IndianMarketersFooter />
    </div>
  );
}
