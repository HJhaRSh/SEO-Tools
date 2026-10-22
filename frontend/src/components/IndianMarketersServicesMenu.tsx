'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SERVICES_MEGA_MENU } from '@/lib/indianMarketersNav';

interface IndianMarketersServicesMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export default function IndianMarketersServicesMenu({
  isOpen,
  onClose,
  triggerRef,
}: IndianMarketersServicesMenuProps) {
  const [activeTabId, setActiveTabId] = useState<string>(SERVICES_MEGA_MENU[0].id);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const currentCategory =
    SERVICES_MEGA_MENU.find((cat) => cat.id === activeTabId) || SERVICES_MEGA_MENU[0];

  return (
    <div
      ref={menuRef}
      id="e-n-menu-content-2483"
      role="region"
      aria-label="Services Mega Menu"
      className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] w-[95vw] max-w-[1160px] bg-[#fbfbfb] border border-[#e5e7eb] rounded-2xl shadow-2xl p-6 sm:p-8 z-50 transition-all duration-200 animate-in fade-in zoom-in-95 text-[#111827] font-[family-name:var(--im-font-body)]"
    >
      <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
        {/* Left column: Category tabs */}
        <div
          role="tablist"
          aria-label="Service categories"
          className="w-full md:w-[310px] shrink-0 flex flex-col gap-2.5"
        >
          {SERVICES_MEGA_MENU.map((category) => {
            const isActive = category.id === currentCategory.id;
            return (
              <button
                key={category.id}
                role="tab"
                id={`tab-${category.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${category.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTabId(category.id)}
                onMouseEnter={() => setActiveTabId(category.id)}
                className={`w-full text-left px-5 py-3.5 rounded-xl font-semibold text-[15px] transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#55b349] text-white shadow-sm'
                    : 'bg-[#eceef1] text-[#111827] hover:bg-[#e2e5e9]'
                }`}
              >
                {category.title}
              </button>
            );
          })}
        </div>

        {/* Right column: Items grid */}
        <div
          role="tabpanel"
          id={`panel-${currentCategory.id}`}
          aria-labelledby={`tab-${currentCategory.id}`}
          className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
        >
          {currentCategory.items.map((item, idx) => {
            const cardInner = (
              <>
                <span className="shrink-0 text-[#55b349] flex items-center justify-center w-6 h-6">
                  {/* FontAwesome Star SVG */}
                  <svg
                    aria-hidden="true"
                    className="w-5 h-5 fill-current"
                    viewBox="0 0 576 512"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M259.3 17.8L194 150.2 47.9 171.5c-26.2 3.8-36.7 36.1-17.7 54.6l105.7 103-25 145.5c-4.5 26.3 23.2 46 46.4 33.7L288 439.6l130.7 68.7c23.2 12.2 50.9-7.4 46.4-33.7l-25-145.5 105.7-103c19-18.5 8.5-50.8-17.7-54.6L382 150.2 316.7 17.8c-11.7-23.6-45.6-23.9-57.4 0z" />
                  </svg>
                </span>
                <span className="font-semibold text-[14px] leading-snug text-[#111827] flex-1">
                  {item.title}
                </span>
              </>
            );

            if (item.isClickable && item.href) {
              return (
                <a
                  key={idx}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 p-4 bg-white border border-[#e5e7eb] rounded-xl hover:border-[#55b349] hover:shadow-md transition-all duration-150 group text-[#111827]"
                >
                  {cardInner}
                </a>
              );
            }

            return (
              <div
                key={idx}
                className="flex items-center gap-3 p-4 bg-white border border-[#e5e7eb] rounded-xl select-none text-[#111827]"
              >
                {cardInner}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
