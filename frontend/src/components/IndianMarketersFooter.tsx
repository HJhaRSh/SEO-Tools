'use client';

import React from 'react';
import Image from 'next/image';
import {
  MAIN_SITE_URL,
  FOOTER_SERVICES_GROUP,
  FOOTER_INDUSTRY_GROUP,
  FOOTER_COMPANY_GROUP,
  FOOTER_RESOURCE_GROUP,
  FOOTER_ADDRESS_DATA,
  FOOTER_SOCIAL_LINKS,
  FOOTER_BOTTOM_DATA,
  INDIAN_MARKETERS_LOGO_FALLBACK,
} from '@/lib/indianMarketersNav';

export default function IndianMarketersFooter() {
  return (
    <footer className="w-full bg-white text-[#222222] border-t border-[#e5e7eb] pt-10 sm:pt-14 pb-8 sm:pb-12 transition-colors font-[family-name:var(--im-font-body)]">
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 xl:px-12">
        
        {/* Main 5 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-7 sm:gap-8 lg:gap-8">
          
          {/* Column 1: Services */}
          <div>
            <h3 className="font-semibold text-base text-[#111827] mb-4">
              {FOOTER_SERVICES_GROUP.title}
            </h3>
            <ul className="space-y-2.5">
              {FOOTER_SERVICES_GROUP.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] text-[#4b5563] hover:text-[#47A048] transition-colors leading-relaxed block"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2: Industry */}
          <div>
            <h3 className="font-semibold text-base text-[#111827] mb-4">
              {FOOTER_INDUSTRY_GROUP.title}
            </h3>
            <ul className="space-y-2.5">
              {FOOTER_INDUSTRY_GROUP.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] text-[#4b5563] hover:text-[#47A048] transition-colors leading-relaxed block"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Company */}
          <div>
            <h3 className="font-semibold text-base text-[#111827] mb-4">
              {FOOTER_COMPANY_GROUP.title}
            </h3>
            <ul className="space-y-2.5">
              {FOOTER_COMPANY_GROUP.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] text-[#4b5563] hover:text-[#47A048] transition-colors leading-relaxed block"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Resource */}
          <div>
            <h3 className="font-semibold text-base text-[#111827] mb-4">
              {FOOTER_RESOURCE_GROUP.title}
            </h3>
            <ul className="space-y-2.5">
              {FOOTER_RESOURCE_GROUP.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] text-[#4b5563] hover:text-[#47A048] transition-colors leading-relaxed block"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 5: Address */}
          <div>
            <h3 className="font-semibold text-base text-[#111827] mb-4">
              {FOOTER_ADDRESS_DATA.title}
            </h3>

            {/* Google Maps Embed */}
            <div className="w-full h-28 rounded-lg overflow-hidden border border-gray-200 mb-3 shadow-xs">
              <iframe
                loading="lazy"
                src={FOOTER_ADDRESS_DATA.mapsEmbedUrl}
                title="Indian marketers"
                aria-label="Indian marketers location map"
                className="w-full h-full border-0"
              />
            </div>

            {/* Contact Information List */}
            <ul className="space-y-2 text-[14px] text-[#4b5563]">
              {/* Location */}
              <li className="flex items-start gap-2.5">
                <span className="text-[#47A048] shrink-0 mt-0.5">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 384 512">
                    <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0zM192 272c44.183 0 80-35.817 80-80s-35.817-80-80-80-80 35.817-80 80 35.817 80 80 80z" />
                  </svg>
                </span>
                <a
                  href={FOOTER_ADDRESS_DATA.addressUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#47A048] transition-colors"
                >
                  {FOOTER_ADDRESS_DATA.addressText}
                </a>
              </li>

              {/* Phone */}
              <li className="flex items-center gap-2.5">
                <span className="text-[#47A048] shrink-0">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 512 512">
                    <path d="M497.39 361.8l-112-48a24 24 0 0 0-28 6.9l-49.6 60.6A370.66 370.66 0 0 1 130.6 204.1l60.6-49.6a23.94 23.94 0 0 0 6.9-28l-48-112A24.16 24.16 0 0 0 122.6.61l-104 24A24 24 0 0 0 0 48c0 256.5 207.9 464 464 464a24 24 0 0 0 23.4-18.6l24-104a24.29 24.29 0 0 0-14.01-27.6z" />
                  </svg>
                </span>
                <a
                  href={FOOTER_ADDRESS_DATA.phoneUrl}
                  className="hover:text-[#47A048] transition-colors"
                >
                  {FOOTER_ADDRESS_DATA.phone}
                </a>
              </li>

              {/* Email */}
              <li className="flex items-center gap-2.5">
                <span className="text-[#47A048] shrink-0">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 512 512">
                    <path d="M502.3 190.8c3.9-3.1 9.7-.2 9.7 4.7V400c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V195.5c0-5 5.7-7.8 9.7-4.7 22.4 17.4 52.1 39.5 154.1 113.6 21.1 15.4 56.7 47.8 92.2 47.6 35.7.3 72-32.8 92.3-47.6 102-74.1 131.6-96.3 154-113.6zM256 320c23.2.4 56.6-29.2 73.4-41.4 132.7-96.3 142.8-104.7 173.4-128.7 5.8-4.5 9.2-11.5 9.2-18.9v-19c0-26.5-21.5-48-48-48H48C21.5 64 0 85.5 0 112v19c0 7.4 3.4 14.3 9.2 18.9 30.6 23.9 40.7 32.4 173.4 128.7 16.8 12.2 50.2 41.8 73.4 41.4z" />
                  </svg>
                </span>
                <a
                  href={FOOTER_ADDRESS_DATA.emailUrl}
                  className="hover:text-[#47A048] transition-colors"
                >
                  {FOOTER_ADDRESS_DATA.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#e5e7eb] my-8" />

        {/* Bottom Bar matching live site exact layout */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 text-center sm:text-left">
          
          {/* Left: Logo + All Rights Reserved + OUR Partners */}
          <div className="flex flex-col items-center sm:items-start">
            <a
              href={`${MAIN_SITE_URL}/`}
              className="inline-block transition-opacity hover:opacity-90 mb-2"
              aria-label="Indian Marketers Home"
            >
              <Image
                src="/images/indian-marketers-logo.png"
                alt="Indian Marketers"
                width={246}
                height={160}
                unoptimized
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  e.currentTarget.src = INDIAN_MARKETERS_LOGO_FALLBACK;
                }}
                className="h-[36px] sm:h-[42px] w-auto object-contain"
                style={{ width: 'auto' }}
              />
            </a>
            <span className="text-[14px] sm:text-[15px] text-[#222222] font-normal leading-normal">
              {FOOTER_BOTTOM_DATA.allRightsReserved}
            </span>
            <span className="text-[15px] sm:text-[16px] text-[#222222] font-normal mt-4 sm:mt-6 block">
              {FOOTER_BOTTOM_DATA.ourPartners}
            </span>
          </div>

          {/* Right: Exact 4 Social Icons with rounded squircle shape + Copyright */}
          <div className="flex flex-col items-center sm:items-end">
            <div className="flex items-center gap-[10px] justify-center sm:justify-end">
              {/* Facebook */}
              <a
                href={FOOTER_SOCIAL_LINKS[0].href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={FOOTER_SOCIAL_LINKS[0].ariaLabel}
                className="w-[36px] h-[36px] rounded-[6px] bg-[#3b5998] hover:opacity-90 text-white flex items-center justify-center transition-opacity"
              >
                <svg className="w-[18px] h-[18px] fill-white" viewBox="0 0 512 512">
                  <path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z" />
                </svg>
              </a>

              {/* X / Twitter */}
              <a
                href={FOOTER_SOCIAL_LINKS[1].href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={FOOTER_SOCIAL_LINKS[1].ariaLabel}
                className="w-[36px] h-[36px] rounded-[6px] bg-black hover:opacity-90 text-white flex items-center justify-center transition-opacity"
              >
                <svg className="w-[16px] h-[16px] fill-white" viewBox="0 0 512 512">
                  <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z" />
                </svg>
              </a>

              {/* LinkedIn */}
              <a
                href={FOOTER_SOCIAL_LINKS[2].href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={FOOTER_SOCIAL_LINKS[2].ariaLabel}
                className="w-[36px] h-[36px] rounded-[6px] bg-[#0077b5] hover:opacity-90 text-white flex items-center justify-center transition-opacity"
              >
                <svg className="w-[17px] h-[17px] fill-white" viewBox="0 0 448 512">
                  <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
                </svg>
              </a>

              {/* Instagram: Elementor official #262626 dark charcoal background with camera glyph */}
              <a
                href={FOOTER_SOCIAL_LINKS[3].href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={FOOTER_SOCIAL_LINKS[3].ariaLabel}
                className="w-[36px] h-[36px] rounded-[6px] bg-[#262626] hover:opacity-90 text-white flex items-center justify-center transition-opacity"
              >
                <svg className="w-[18px] h-[18px] fill-white" viewBox="0 0 448 512">
                  <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1z" />
                </svg>
              </a>
            </div>
            <span className="text-[13px] sm:text-[15px] text-[#222222] font-normal text-center sm:text-right mt-2 block">
              {FOOTER_BOTTOM_DATA.copyright}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
