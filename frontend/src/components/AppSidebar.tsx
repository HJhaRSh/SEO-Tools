'use client';

import React, { useState } from 'react';
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

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 select-none">
      
      {/* Brand & All Tools header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <Link href="/tools" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center font-bold text-base group-hover:bg-green-600 group-hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          </div>
          <div>
            <span className="font-black text-base text-slate-900 dark:text-white block tracking-tight leading-tight">All SEO Tools</span>
            <span className="text-xs text-slate-500 font-bold">14 Tools Suite</span>
          </div>
        </Link>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        )}
      </div>

      {/* Filter Quick Search */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800/60">
        <div className="relative">
          <input
            type="text"
            placeholder="Search tools..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full text-sm pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 font-medium"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Tools List by Category */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 font-sans">
        {filteredCategories.map((group) => {
          const isCollapsed = Boolean(collapsedCategories[group.category]);

          return (
            <div key={group.category} className="space-y-1.5">
              <button
                onClick={() => toggleCategory(group.category)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-extrabold uppercase tracking-wider text-xs transition-colors cursor-pointer"
              >
                <span>{group.category}</span>
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
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all group ${
                          isActive
                            ? 'bg-green-500/15 text-green-800 dark:text-green-300 font-extrabold shadow-xs'
                            : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-green-600 ring-2 ring-green-300' : 'bg-slate-400 dark:bg-slate-600 group-hover:bg-slate-600'
                            }`}
                          ></span>
                          <span className="truncate text-sm">{tool.name}</span>
                        </div>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-green-600"></span>
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

      {/* Footer shortcut */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-600 flex items-center justify-between">
        <span>Indian Marketers Suite</span>
        <Link href="/tools" className="font-bold text-green-700 hover:underline">
          View All &rarr;
        </Link>
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-80 flex-shrink-0 sticky top-20 h-[calc(100vh-5rem)] shadow-sm z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 lg:hidden transition-opacity"
        />
      )}

      {/* Mobile Offcanvas Drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white z-50 transform transition-transform duration-300 ease-in-out lg:hidden shadow-2xl ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
