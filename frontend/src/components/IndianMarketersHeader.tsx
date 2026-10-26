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
  // Navigation: Home, Vision, Services, Tools (https://indianmarketers.in/tools), Blog, Contact us
  const [servicesMenuOpen, setServicesMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/images/indian-marketers-logo.png');
  const servicesBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* Header — matches live indianmarketers.in exactly:
          white bg, subtle border-bottom, 80px height,
          3-column grid: logo left | nav centered | CTA right */}
      <header className="sticky top-0 z-50 w-full bg-white border-b border-[#e5e7eb] transition-all">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-10 h-16 md:h-20 flex items-center justify-between gap-3 sm:gap-4">
          {/* COL 1: Logo — plain image, no card wrapper */}
          <a
            href={`${MAIN_SITE_URL}/`}
            aria-label="Indian Marketers Home"
            className="inline-flex items-center shrink-0"
          >
            <Image
              src={logoSrc}
              alt="Indian Marketers"
              width={150}
              height={54}
              priority
              unoptimized
              onError={() => setLogoSrc(INDIAN_MARKETERS_LOGO_FALLBACK)}
              className="h-8 sm:h-9 md:h-11 w-auto object-contain block"
            />
          </a>

          {/* COL 2: Nav — centered */}
          <nav
            aria-label="Main Navigation"
            className="hidden md:flex"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0,
              fontFamily: 'var(--im-font-body, inherit)',
              fontSize: '15px',
              fontWeight: 500,
              color: '#111827',
            }}
          >
            {HEADER_NAV_ITEMS.map((item, index) => {
              const isLast = index === HEADER_NAV_ITEMS.length - 1;

              const baseStyle: React.CSSProperties = {
                color: '#111827',
                textDecoration: 'none',
                padding: '6px 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: 'inherit',
              };

              const separatorEl = !isLast ? (
                <span
                  key={`sep-${index}`}
                  style={{ color: '#9ca3af', fontWeight: 300, userSelect: 'none', flexShrink: 0 }}
                  aria-hidden="true"
                >
                  |
                </span>
              ) : null;

              if (item.isMegaMenu) {
                return (
                  <React.Fragment key={item.label}>
                    <button
                      ref={servicesBtnRef}
                      type="button"
                      aria-haspopup="true"
                      aria-expanded={servicesMenuOpen}
                      onClick={() => setServicesMenuOpen(!servicesMenuOpen)}
                      style={{
                        ...baseStyle,
                        color: servicesMenuOpen ? '#47A048' : '#111827',
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#47A048')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = servicesMenuOpen ? '#47A048' : '#111827')}
                    >
                      <span>{item.label}</span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 320 512"
                        fill="currentColor"
                        style={{
                          marginLeft: '2px',
                          transform: servicesMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                        aria-hidden="true"
                      >
                        <path d="M31.3 192h257.3c17.8 0 26.7 21.5 14.1 34.1L174.1 354.8c-7.8 7.8-20.5 7.8-28.3 0L17.2 226.1C4.6 213.5 13.5 192 31.3 192z" />
                      </svg>
                    </button>
                    {separatorEl}
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={item.label}>
                  <a
                    href={item.href}
                    style={baseStyle}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#47A048')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#111827')}
                  >
                    {item.label}
                  </a>
                  {separatorEl}
                </React.Fragment>
              );
            })}
          </nav>

          {/* COL 3: CTA + mobile hamburger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {/* Desktop: Let's Talk pill */}
            <a
              href={LETS_TALK_LINK.href}
              className="hidden md:inline-flex"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                backgroundImage: 'linear-gradient(135deg, #67C258 0%, #47A048 100%)',
                borderRadius: '100px',
                padding: '11px 26px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '15px',
                fontFamily: 'inherit',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                lineHeight: '1.2',
                border: 'none',
                transition: 'opacity 0.2s, transform 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.opacity = '0.9';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.opacity = '1';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {LETS_TALK_LINK.label}
            </a>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex md:hidden p-2.5 min-w-[44px] min-h-[44px] items-center justify-center text-slate-800 hover:text-black hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Services Mega Menu Dropdown */}
        <IndianMarketersServicesMenu
          isOpen={servicesMenuOpen}
          onClose={() => setServicesMenuOpen(false)}
          triggerRef={servicesBtnRef}
        />
      </header>

      {/* Mobile Drawer */}
      <IndianMarketersMobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </>
  );
}
