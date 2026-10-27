'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAVIGATION_TOOLS } from '@/lib/toolsList';

interface AppSidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export default function AppSidebar({ isOpenMobile, onCloseMobile }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = useState('');

  // Lock body scroll when mobile sidebar drawer is open
  useEffect(() => {
    if (isOpenMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpenMobile]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpenMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseMobile) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpenMobile, onCloseMobile]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  const filteredCategories = NAVIGATION_TOOLS.map(cat => {
    const matchingTools = cat.tools.filter(t =>
      t.name.toLowerCase().includes(filterQuery.toLowerCase())
    );
    return {
      ...cat,
      tools: matchingTools
    };
  }).filter(cat => cat.tools.length > 0);

  const totalTools = NAVIGATION_TOOLS.reduce((acc, cat) => acc + cat.tools.length, 0);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[var(--im-surface)] border-r border-[var(--im-border)] text-[var(--im-text)] select-none">
      
      {/* Brand & All Tools header */}
      <div className="p-5 border-b border-[var(--im-border)] flex items-center justify-between">
        <Link href="/tools" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-[var(--im-radius-sm)] bg-[var(--im-accent-tint)] text-[var(--im-secondary)] flex items-center justify-center font-bold text-base transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          </div>
          <div>
            <span className="font-bold text-base text-[var(--im-heading)] block tracking-tight leading-tight">All SEO Tools</span>
            <span className="text-xs text-[var(--im-text-muted)] font-medium">{totalTools} Tools Suite</span>
          </div>
        </Link>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-[var(--im-radius-sm)] text-[var(--im-text-muted)] hover:text-[var(--im-heading)] hover:bg-[var(--im-bg-soft)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        )}
      </div>

      {/* Filter Quick Search */}
      <div className="p-4 border-b border-[var(--im-border)]">
        <div className="relative">
          <input
            type="text"
            placeholder="Search tools..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full text-sm pl-9 pr-3 py-2.5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-[var(--im-radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--im-accent-tint)] focus:border-[var(--im-primary-deep)] text-[var(--im-text)] placeholder:text-[var(--im-text-muted)] font-medium"
          />
          <svg className="w-4 h-4 text-[var(--im-text-muted)] absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-3 top-2.5 text-[var(--im-text-muted)] hover:text-[var(--im-heading)] text-sm font-bold"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Tools List by Category */}
      <div className="flex-1 overflow-y-auto touch-scroll overscroll-contain p-4 pb-safe space-y-5">
        {filteredCategories.map((group) => {
          const isCollapsed = Boolean(collapsedCategories[group.category]);

          return (
            <div key={group.category} className="space-y-1.5">
              <button
                onClick={() => toggleCategory(group.category)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-[var(--im-radius-sm)] text-[var(--im-text-muted)] hover:text-[var(--im-heading)] hover:bg-[var(--im-bg-soft)] font-semibold uppercase tracking-wider text-xs transition-colors cursor-pointer"
              >
                <span className="truncate whitespace-nowrap">{group.category}</span>
                <svg
                  className={`w-3.5 h-3.5 transform transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              {!isCollapsed && (
                <div className="space-y-1 pl-1">
                  {group.tools.map((tool) => {
                    const isActive = pathname === tool.href;

                    return (
                      <Link
                        key={tool.name}
                        href={tool.href}
                        onClick={onCloseMobile}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-[var(--im-radius-sm)] font-medium transition-all group ${
                          isActive
                            ? 'bg-[#f0fdf4] text-[#15803d] font-semibold border-l-2 border-[#47A048]'
                            : 'text-[#374151] hover:text-[#111827] hover:bg-[#f9fafb]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-[#47A048] ring-2 ring-[#bbf7d0]' : 'bg-[#d1d5db] group-hover:bg-[#9ca3af]'
                            }`}
                          ></span>
                          <span className="truncate text-sm">{tool.name}</span>
                        </div>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#47A048]"></span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-80 flex-shrink-0 sticky top-20 h-[calc(100vh-5rem)] shadow-[var(--im-shadow-sm)] z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-[var(--im-secondary)]/50 backdrop-blur-xs z-50 lg:hidden transition-opacity"
        />
      )}

      {/* Mobile Offcanvas Drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-[var(--im-surface)] z-50 transform transition-transform duration-300 ease-in-out lg:hidden shadow-[var(--im-shadow-lg)] ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
