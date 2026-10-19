import Link from 'next/link';

interface HeaderProps {
  onOpenMobileSidebar?: () => void;
}

export default function Header({ onOpenMobileSidebar }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-[var(--im-secondary)] text-[var(--im-on-dark)] border-b border-white/10 transition-colors duration-300">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger button */}
            {onOpenMobileSidebar && (
              <button
                type="button"
                onClick={onOpenMobileSidebar}
                className="lg:hidden p-2 rounded-[var(--im-radius-sm)] text-[var(--im-on-dark)] hover:text-[var(--im-primary)] hover:bg-white/10 transition-colors"
                aria-label="Open sidebar menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            {/* Brand Logo */}
            <Link href="/" className="flex flex-col items-center">
              <div className="flex gap-1 mb-0.5">
                <div className="w-2.5 h-2.5 bg-[var(--im-primary)]"></div>
                <div className="w-2.5 h-2.5 bg-[var(--im-on-dark)]"></div>
              </div>
              <span className="font-bold text-lg tracking-wider text-[var(--im-on-dark)] leading-none">INDIAN</span>
              <span className="text-[10px] tracking-[0.2em] text-[var(--im-text-muted)] font-medium leading-none mt-1">MARKETERS</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <Link
              href="/tools"
              className="text-sm font-medium text-[var(--im-on-dark)] hover:text-[var(--im-primary)] transition-colors"
            >
              All Tools
            </Link>
            <span className="inline-block px-3 py-1 text-xs font-semibold text-[var(--im-secondary)] bg-[var(--im-primary)] rounded-[var(--im-radius-pill)]">
              SEO Suite
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
