import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-24">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="flex flex-col items-center">
              <div className="flex gap-1 mb-0.5">
                <div className="w-2.5 h-2.5 bg-green-400"></div>
                <div className="w-2.5 h-2.5 bg-blue-800"></div>
              </div>
              <span className="font-bold text-lg tracking-wider text-blue-900 leading-none">INDIAN</span>
              <span className="text-[10px] tracking-[0.2em] text-slate-500 font-medium leading-none mt-1">MARKETERS</span>
            </Link>
          </div>
          
          <div className="flex items-center text-slate-500 font-medium">
             SEO Tools
          </div>
        </div>
      </div>
    </header>
  );
}
