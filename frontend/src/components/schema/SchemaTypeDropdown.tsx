'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SupportedSchemaType } from '@/lib/seo/schema/types';
import { SUPPORTED_SCHEMA_TYPES } from '@/lib/seo/schema/constants';

interface SchemaTypeDropdownProps {
  value: SupportedSchemaType;
  onChange: (value: SupportedSchemaType) => void;
}

export default function SchemaTypeDropdown({ value, onChange }: SchemaTypeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Currently selected schema item
  const selectedItem = useMemo(() => {
    return (
      SUPPORTED_SCHEMA_TYPES.find((t) => t.id === value) ||
      SUPPORTED_SCHEMA_TYPES[0]
    );
  }, [value]);

  // Filtered schema types by search query
  const filteredTypes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SUPPORTED_SCHEMA_TYPES;
    return SUPPORTED_SCHEMA_TYPES.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Group filtered types by category
  const groupedTypes = useMemo(() => {
    const map = new Map<string, typeof SUPPORTED_SCHEMA_TYPES>();
    for (const item of filteredTypes) {
      if (!map.has(item.group)) {
        map.set(item.group, []);
      }
      map.get(item.group)!.push(item);
    }
    return Array.from(map.entries());
  }, [filteredTypes]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Handle keyboard events (Escape to close)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (typeId: SupportedSchemaType) => {
    onChange(typeId);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={dropdownRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button (Always styled cleanly, replaces native select) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl p-3.5 shadow-xs transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 flex items-center justify-between gap-3 cursor-pointer group"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight truncate">
              {selectedItem.label}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              {selectedItem.group}
            </span>
          </div>
          {selectedItem.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {selectedItem.description}
            </p>
          )}
        </div>

        {/* Chevron Icon (Rotates 180deg when open) */}
        <div className="shrink-0 p-1 rounded-lg text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors">
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown Menu (Strictly opens downward with top-full mt-2) */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Quick Search Header */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <div className="relative flex items-center">
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search schema type (e.g. Article, FAQ, Product, Job)..."
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 focus:border-slate-400 dark:focus:border-slate-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Grouped Schema Options List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {groupedTypes.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No schema types match &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              groupedTypes.map(([groupName, items]) => (
                <div key={groupName} className="py-1">
                  {/* Category Group Header */}
                  <div className="px-3 py-1.5 text-[10px] font-black tracking-wider text-slate-400 dark:text-slate-500 uppercase bg-slate-50/70 dark:bg-slate-950/40 sticky top-0 backdrop-blur-xs z-10 flex items-center justify-between">
                    <span>{groupName}</span>
                    <span className="text-[9px] font-normal lowercase">{items.length} types</span>
                  </div>

                  {/* Category Items */}
                  <div className="px-1 space-y-0.5 mt-0.5">
                    {items.map((item) => {
                      const isSelected = item.id === value;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelect(item.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {item.label}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5 font-normal">
                                {item.description}
                              </p>
                            )}
                          </div>

                          {/* Selected Checkmark */}
                          {isSelected && (
                            <svg className="w-4 h-4 text-slate-800 dark:text-slate-200 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
