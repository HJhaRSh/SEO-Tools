export const MAIN_SITE_URL = 'https://indianmarketers.in';

export interface NavItem {
  label: string;
  href: string;
  isMegaMenu?: boolean;
  isButton?: boolean;
}

export interface ServiceItem {
  title: string;
  href?: string;
  isClickable: boolean;
}

export interface ServiceCategory {
  id: string;
  title: string;
  items: ServiceItem[];
}

export interface FooterLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface FooterGroup {
  title: string;
  links: FooterLink[];
}

export const HEADER_NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: `${MAIN_SITE_URL}/` },
  { label: 'Vision', href: `${MAIN_SITE_URL}/#vision` },
  { label: 'Services', href: '#services', isMegaMenu: true },
  { label: 'Blog', href: `${MAIN_SITE_URL}/blog/` },
  { label: 'Contact us', href: `${MAIN_SITE_URL}/contact-us/` },
];

export const LETS_TALK_LINK = {
  label: "Let's Talk",
  href: 'https://calendly.com/indianmarketers-marketing/discovery-call',
};

export const SERVICES_MEGA_MENU: ServiceCategory[] = [
  {
    id: 'ai-seo',
    title: 'AI & SEO Services',
    items: [
      {
        title: 'AI SEO / LLM Visibility',
        href: `${MAIN_SITE_URL}/seo-service/ai-seo-services/`,
        isClickable: true,
      },
      {
        title: 'App Store Optimisaton',
        href: `${MAIN_SITE_URL}/seo-service/app-store-optimization/`,
        isClickable: true,
      },
      {
        title: 'Local SEO',
        href: `${MAIN_SITE_URL}/seo-service/local-seo/`,
        isClickable: true,
      },
      {
        title: 'Enterprise SEO',
        href: `${MAIN_SITE_URL}/seo-service/enterprise-seo/`,
        isClickable: true,
      },
      {
        title: 'International SEO',
        href: `${MAIN_SITE_URL}/seo-service/international-seo/`,
        isClickable: true,
      },
      {
        title: 'E-Commerce SEO',
        href: `${MAIN_SITE_URL}/seo-service/ecommerce-seo/`,
        isClickable: true,
      },
    ],
  },
  {
    id: 'growth-consulting',
    title: 'Growth Consulting',
    items: [
      {
        title: 'SEO Consulting (AI & SEO)',
        href: `${MAIN_SITE_URL}/seo-solution/`,
        isClickable: true,
      },
      {
        title: 'Conversion Rate Optimisation',
        href: `${MAIN_SITE_URL}/seo-solution/conversion-rate-optimisation/`,
        isClickable: true,
      },
      {
        title: 'SEO Penalty recovery',
        href: `${MAIN_SITE_URL}/seo-solution/google-penalty-recovery/`,
        isClickable: true,
      },
      {
        title: 'Custom CMS development',
        href: `${MAIN_SITE_URL}/seo-solution/custom-cms-development/`,
        isClickable: true,
      },
    ],
  },
  {
    id: 'custom-engines',
    title: 'Custom AI Engines & CMS Development',
    items: [
      {
        title: 'Custom CMS Engine',
        isClickable: false,
      },
      {
        title: 'Custom AI Optimisation Engine',
        isClickable: false,
      },
      {
        title: 'Real-Time Visibility Engine',
        isClickable: false,
      },
      {
        title: 'Content Automation Engine',
        isClickable: false,
      },
      {
        title: 'Real-Time SEO QC Engine',
        isClickable: false,
      },
      {
        title: 'Predictive Intelligence Engine',
        isClickable: false,
      },
    ],
  },
];

export const FOOTER_SERVICES_GROUP: FooterGroup = {
  title: 'Services',
  links: [
    { label: 'SEO Services', href: `${MAIN_SITE_URL}/seo-service/` },
    { label: 'AI SEO Services', href: `${MAIN_SITE_URL}/seo-service/ai-seo-services/` },
    { label: 'ASO services', href: `${MAIN_SITE_URL}/seo-service/app-store-optimization/` },
    { label: 'Youtube SEO services', href: `${MAIN_SITE_URL}/seo-service/youtube-seo/` },
    { label: 'Local SEO Services', href: `${MAIN_SITE_URL}/seo-service/local-seo/` },
    { label: 'International SEO Services', href: `${MAIN_SITE_URL}/seo-service/international-seo/` },
  ],
};

export const FOOTER_INDUSTRY_GROUP: FooterGroup = {
  title: 'Industry',
  links: [
    { label: 'SEO for Ecommerce', href: `${MAIN_SITE_URL}/seo-service/ecommerce-seo/` },
    { label: 'SEO for Enterprise', href: `${MAIN_SITE_URL}/seo-service/enterprise-seo/` },
    { label: 'SEO for Lawyers', href: `${MAIN_SITE_URL}/seo-service/industry/lawyers/` },
    { label: 'SEO for healthcare', href: `${MAIN_SITE_URL}/seo-service/industry/healthcare/` },
    { label: 'SEO for Dentist', href: `${MAIN_SITE_URL}/seo-service/industry/dentists/` },
  ],
};

export const FOOTER_COMPANY_GROUP: FooterGroup = {
  title: 'Company',
  links: [
    { label: 'About Us', href: `${MAIN_SITE_URL}/about-us/` },
    { label: 'Contact Us', href: `${MAIN_SITE_URL}/contact-us/` },
    { label: 'Terms & condition', href: '#' },
    { label: 'Privacy policy', href: '#' },
  ],
};

export const FOOTER_RESOURCE_GROUP: FooterGroup = {
  title: 'Resource',
  links: [
    { label: 'Blog', href: `${MAIN_SITE_URL}/blog/` },
    { label: 'Case Studies', href: `${MAIN_SITE_URL}/case-studies/` },
    { label: 'Sitemap', href: '#' },
  ],
};

export const FOOTER_ADDRESS_DATA = {
  title: 'Address',
  mapsEmbedUrl: 'https://maps.google.com/maps?q=Indian%20marketers&t=m&z=12&output=embed&iwloc=near',
  addressText: 'Kandivali West, Mumbai',
  addressUrl: 'https://maps.google.com/maps?q=Indian%20marketers',
  phone: '+91 7045717717',
  phoneUrl: 'tel:+917045717717',
  email: 'marketing@indianmarketers.in',
  emailUrl: 'mailto:marketing@indianmarketers.in',
};

export const FOOTER_SOCIAL_LINKS = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/www.indianmarketers.in/',
    ariaLabel: 'Facebook',
  },
  {
    name: 'X-twitter',
    href: 'https://x.com/indianmarketer3',
    ariaLabel: 'X-twitter',
  },
  {
    name: 'Linkedin',
    href: 'https://www.linkedin.com/company/indian-marketers/',
    ariaLabel: 'Linkedin',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/indianmarketers/',
    ariaLabel: 'Instagram',
  },
];

export const FOOTER_BOTTOM_DATA = {
  allRightsReserved: 'All Rights Reserved.',
  copyright: 'Copyright © 2025',
  ourPartners: 'OUR Partners',
};
