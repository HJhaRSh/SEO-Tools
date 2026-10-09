import Link from 'next/link';

interface HeaderProps {
  onOpenMobileSidebar?: () => void;
}

export default function Header({ onOpenMobileSidebar }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger button */}
            {onOpenMobileSidebar && (
              <button
                type="button"
                onClick={onOpenMobileSidebar}
                className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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
                <div className="w-2.5 h-2.5 bg-green-400"></div>
                <div className="w-2.5 h-2.5 bg-blue-800"></div>
              </div>
              <span className="font-bold text-lg tracking-wider text-blue-900 leading-none">INDIAN</span>
              <span className="text-[10px] tracking-[0.2em] text-slate-500 font-medium leading-none mt-1">MARKETERS</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <Link
              href="/tools"
              className="text-sm font-semibold text-slate-700 hover:text-green-600 transition-colors"
            >
              All Tools
            </Link>
            <span className="inline-block px-3 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">
              SEO Suite
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
