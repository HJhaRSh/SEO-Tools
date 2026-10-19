import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--im-border)] py-8 bg-[var(--im-bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-[var(--im-text-muted)]">
        &copy; {new Date().getFullYear()} Indian Marketers. All rights reserved.
      </div>
    </footer>
  );
}
