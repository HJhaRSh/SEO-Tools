'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  HEADER_NAV_ITEMS,
  LETS_TALK_LINK,
  SERVICES_MEGA_MENU,
  MAIN_SITE_URL,
} from '@/lib/indianMarketersNav';

interface IndianMarketersMobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IndianMarketersMobileMenu({
  isOpen,
  onClose,
}: IndianMarketersMobileMenuProps) {
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number>(0);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setServicesExpanded(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentCategory = SERVICES_MEGA_MENU[activeCategoryIndex] || SERVICES_MEGA_MENU[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mobile Navigation Menu"
      className="fixed inset-0 z-50 bg-[#f9fafb] flex flex-col overflow-y-auto animate-in fade-in slide-in-from-top duration-200"
    >
      {/* Mobile Header Bar inside drawer */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <a href={`${MAIN_SITE_URL}/`} onClick={onClose} className="inline-block">
          <Image
            src="/images/indian-marketers-logo.png"
            alt="Indian Marketers"
            width={120}
            height={28}
            className="h-7 w-auto object-contain"
            style={{ width: 'auto' }}
            priority
          />
        </a>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="p-2 text-gray-700 hover:text-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
        >
          {/* Close X SVG */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav items list */}
      <nav className="flex-1 px-6 py-8 flex flex-col items-center gap-6 text-center text-[#111827]">
        {HEADER_NAV_ITEMS.map((item) => {
          if (item.isMegaMenu) {
            return (
              <div key={item.label} className="w-full flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setServicesExpanded(!servicesExpanded)}
                  aria-expanded={servicesExpanded}
                  className="flex items-center justify-center gap-2 text-lg font-medium text-[#111827] hover:text-[#55b349] transition-colors py-1 cursor-pointer"
                >
                  <span>{item.label}</span>
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${
                      servicesExpanded ? 'rotate-180 text-[#55b349]' : 'text-gray-500'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 320 512"
                  >
                    <path d="M31.3 192h257.3c17.8 0 26.7 21.5 14.1 34.1L174.1 354.8c-7.8 7.8-20.5 7.8-28.3 0L17.2 226.1C4.6 213.5 13.5 192 31.3 192z" />
                  </svg>
                </button>

                {/* Submenu Accordion */}
                {servicesExpanded && (
                  <div className="w-full max-w-sm mt-4 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm text-left">
                    {/* Category tabs */}
                    <div className="flex flex-col gap-2 mb-4">
                      {SERVICES_MEGA_MENU.map((cat, idx) => {
                        const isCatActive = idx === activeCategoryIndex;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setActiveCategoryIndex(idx)}
                            className={`w-full text-left px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer ${
                              isCatActive
                                ? 'bg-[#55b349] text-white'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {cat.title}
                          </button>
                        );
                      })}
                    </div>

                    {/* Category items */}
                    <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {currentCategory.items.map((srv, sIdx) => {
                        const itemContent = (
                          <>
                            <span className="text-[#55b349] shrink-0">
                              <svg
                                className="w-4 h-4 fill-current"
                                viewBox="0 0 576 512"
                              >
                                <path d="M259.3 17.8L194 150.2 47.9 171.5c-26.2 3.8-36.7 36.1-17.7 54.6l105.7 103-25 145.5c-4.5 26.3 23.2 46 46.4 33.7L288 439.6l130.7 68.7c23.2 12.2 50.9-7.4 46.4-33.7l-25-145.5 105.7-103c19-18.5 8.5-50.8-17.7-54.6L382 150.2 316.7 17.8c-11.7-23.6-45.6-23.9-57.4 0z" />
                              </svg>
                            </span>
                            <span className="text-xs font-semibold text-gray-800 leading-snug">
                              {srv.title}
                            </span>
                          </>
                        );

                        if (srv.isClickable && srv.href) {
                          return (
                            <a
                              key={sIdx}
                              href={srv.href}
                              onClick={onClose}
                              className="flex items-center gap-2.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:border-[#55b349] transition-colors"
                            >
                              {itemContent}
                            </a>
                          );
                        }

                        return (
                          <div
                            key={sIdx}
                            className="flex items-center gap-2.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg select-none"
                          >
                            {itemContent}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <a
              key={item.label}
              href={item.href}
              onClick={onClose}
              className="text-lg font-medium text-[#111827] hover:text-[#55b349] transition-colors py-1"
            >
              {item.label}
            </a>
          );
        })}

        {/* Let's Talk CTA button */}
        <div className="pt-4 w-full max-w-xs">
          <a
            href={LETS_TALK_LINK.href}
            onClick={onClose}
            className="block w-full py-3 px-6 rounded-full bg-[#65a30d] hover:bg-[#558a0a] text-white font-semibold text-center transition-colors shadow-sm"
          >
            {LETS_TALK_LINK.label}
          </a>
        </div>
      </nav>
    </div>
  );
}
