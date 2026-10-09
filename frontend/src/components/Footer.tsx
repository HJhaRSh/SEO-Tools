import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 py-8 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} Indian Marketers. All rights reserved.
      </div>
    </footer>
  );
}
