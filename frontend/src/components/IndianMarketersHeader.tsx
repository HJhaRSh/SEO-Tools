'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import {
  HEADER_NAV_ITEMS,
  LETS_TALK_LINK,
  MAIN_SITE_URL,
  INDIAN_MARKETERS_LOGO_FALLBACK,
} from '@/lib/indianMarketersNav';
import IndianMarketersServicesMenu from './IndianMarketersServicesMenu';
import IndianMarketersMobileMenu from './IndianMarketersMobileMenu';

export default function IndianMarketersHeader() {
  const [servicesMenuOpen, setServicesMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/images/indian-marketers-logo.png');
  const servicesBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white transition-all duration-300 shadow-none border-b border-transparent">
        <div className="max-w-[1520px] w-full mx-auto px-6 sm:px-10 xl:px-14 h-[88px] flex items-center justify-between relative">
          
          {/* Brand Logo */}
          <div className="flex items-center shrink-0">
            <a
              href={`${MAIN_SITE_URL}/`}
              className="inline-block transition-opacity hover:opacity-90"
              aria-label="Indian Marketers Home"
            >
              <Image
                src={logoSrc}
                alt="Indian Marketers"
                width={246}
                height={160}
                priority
                unoptimized
                onError={() => setLogoSrc(INDIAN_MARKETERS_LOGO_FALLBACK)}
                className="h-[42px] w-auto object-contain"
                style={{ width: 'auto', height: '42px' }}
              />
            </a>
          </div>

          {/* Desktop Navigation */}
          <nav
            aria-label="Main Navigation"
            className="hidden md:flex items-center font-[family-name:var(--im-font-body)] text-[16px] font-medium text-[#222222]"
          >
            {HEADER_NAV_ITEMS.map((item, index) => {
              const isLast = index === HEADER_NAV_ITEMS.length - 1;

              if (item.isMegaMenu) {
                return (
                  <React.Fragment key={item.label}>
                    <button
                      ref={servicesBtnRef}
                      type="button"
                      id="e-n-menu-dropdown-icon-2483"
                      aria-haspopup="true"
                      aria-expanded={servicesMenuOpen}
                      aria-controls="e-n-menu-content-2483"
                      onClick={() => setServicesMenuOpen(!servicesMenuOpen)}
                      className={`inline-flex items-center px-2 py-2 hover:text-[#47A048] transition-colors cursor-pointer ${
                        servicesMenuOpen ? 'text-[#47A048]' : 'text-[#222222]'
                      }`}
                    >
                      <span>{item.label}</span>
                      <svg
                        className={`w-2.5 h-2.5 ml-1.5 transition-transform duration-200 ${
                          servicesMenuOpen ? 'rotate-180 text-[#47A048]' : 'fill-current'
                        }`}
                        viewBox="0 0 320 512"
                        aria-hidden="true"
                      >
                        <path d="M31.3 192h257.3c17.8 0 26.7 21.5 14.1 34.1L174.1 354.8c-7.8 7.8-20.5 7.8-28.3 0L17.2 226.1C4.6 213.5 13.5 192 31.3 192z" />
                      </svg>
                      <span className="sr-only">
                        {servicesMenuOpen ? 'Close Services' : 'Open Services'}
                      </span>
                    </button>

                    {!isLast && (
                      <span className="text-[#a3a3a3] mx-4 font-normal select-none" aria-hidden="true">
                        |
                      </span>
                    )}
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={item.label}>
                  <a
                    href={item.href}
                    className="px-2 py-2 hover:text-[#47A048] transition-colors"
                  >
                    {item.label}
                  </a>

                  {!isLast && (
                    <span className="text-[#a3a3a3] mx-4 font-normal select-none" aria-hidden="true">
                      |
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Desktop Right CTA: Let's Talk matching live site exact CSS */}
          <div className="hidden md:flex items-center">
            <a
              href={LETS_TALK_LINK.href}
              className="inline-flex items-center justify-center font-[family-name:var(--im-font-body)] text-[16px] font-medium text-white shadow-none transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:opacity-90"
              style={{
                backgroundImage: 'linear-gradient(135deg, #67C258 0%, #47A048 100%)',
                borderRadius: '100px',
                padding: '0.9rem 2rem',
                lineHeight: '1.2',
                border: 'none',
                color: '#ffffff',
              }}
            >
              {LETS_TALK_LINK.label}
            </a>
          </div>

          {/* Mobile Hamburger Trigger */}
          <div className="flex md:hidden items-center">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Services Mega Menu Dropdown */}
          <IndianMarketersServicesMenu
            isOpen={servicesMenuOpen}
            onClose={() => setServicesMenuOpen(false)}
            triggerRef={servicesBtnRef}
          />
        </div>
      </header>

      {/* Mobile Drawer */}
      <IndianMarketersMobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </>
  );
}
