import React from 'react';
import { RichResultMeta, ValidationIssue } from '@/lib/seo/schema/types';

interface SchemaValidationPanelProps {
  issues: ValidationIssue[];
  richResultMeta: RichResultMeta;
}

export default function SchemaValidationPanel({
  issues,
  richResultMeta,
}: SchemaValidationPanelProps) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  return (
    <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-6">
      {/* Rich Result Status Banner */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Google Feature Status:</span>
            <span className={`badge ${richResultMeta.badgeClass}`}>
              {richResultMeta.statusBadge}
            </span>
          </div>
          <a
            href={richResultMeta.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-green-600 hover:text-green-700 dark:text-green-400 hover:underline inline-flex items-center gap-1"
          >
            Google Documentation ↗
          </a>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {richResultMeta.note}
        </p>
      </div>

      {/* Validation Counts Summary */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Validation Checks:</span>
        {errors.length === 0 ? (
          <span className="badge badge-success">✓ Syntax & Required Properties Pass</span>
        ) : (
          <span className="badge badge-error">
            {errors.length} {errors.length === 1 ? 'Error' : 'Errors'} Found
          </span>
        )}
        {warnings.length > 0 && (
          <span className="badge badge-warning">
            {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
          </span>
        )}
      </div>

      {/* Issues List */}
      {issues.length > 0 && (
        <ul className="space-y-2 mt-3">
          {issues.map((issue, idx) => {
            const isErr = issue.severity === 'error';
            const isWarn = issue.severity === 'warning';
            const bgClass = isErr
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
              : isWarn
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
              : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300';

            const icon = isErr ? '❌' : isWarn ? '⚠️' : 'ℹ️';

            return (
              <li
                key={idx}
                className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${bgClass}`}
              >
                <span className="shrink-0">{icon}</span>
                <span className="leading-relaxed">{issue.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
