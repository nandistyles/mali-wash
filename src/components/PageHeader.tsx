import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export default function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7 animate-in-up">
      <div className="space-y-2">
        {eyebrow && <p className="mali-eyebrow">{eyebrow}</p>}
        <h1 className="mali-title">{title}</h1>
        <p className="mali-subtitle">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
