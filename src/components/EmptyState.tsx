import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
};

export default function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state text-center ${compact ? 'min-h-[12rem]' : ''}`}>
      <div className="max-w-sm px-6 py-8">
        <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-700 grid place-items-center mx-auto mb-4 shadow-sm ring-1 ring-brand-200">
          <Icon className="w-6 h-6" strokeWidth={1.9} />
        </div>
        <h3 className="text-lg font-extrabold text-ink-900">{title}</h3>
        <p className="text-sm text-ink-500 leading-relaxed mt-1.5">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
