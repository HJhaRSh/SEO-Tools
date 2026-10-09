'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AppSidebar from '@/components/AppSidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Header onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
      
      <div className="flex-1 flex w-full">
        <AppSidebar
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 w-full">
          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
}
