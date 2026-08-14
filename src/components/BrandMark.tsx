import { CarFront } from 'lucide-react';
import { cn } from '../lib/utils';

type BrandMarkProps = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
  module?: string;
};

export default function BrandMark({ compact = false, inverse = false, className, module = 'Wash' }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)} aria-label={`Mali Holdings ${module}`}>
      <div className={cn(
        'relative grid place-items-center shrink-0 rounded-2xl shadow-lg',
        compact ? 'w-10 h-10' : 'w-12 h-12',
        inverse ? 'bg-white text-brand-900' : 'brand-gradient text-white'
      )}>
        <CarFront className={compact ? 'w-5 h-5' : 'w-6 h-6'} strokeWidth={2.2} />
        <span className={cn(
          'absolute -right-1 -bottom-1 rounded-full bg-accent-300 ring-2 grid place-items-center text-brand-950 font-black',
          inverse ? 'ring-brand-900' : 'ring-white',
          compact ? 'w-3.5 h-3.5 text-[7px]' : 'w-4 h-4 text-[8px]'
        )}>M</span>
      </div>
      {!compact && (
        <div className="leading-none min-w-0">
          <div className={cn(
            'text-[11px] font-extrabold uppercase tracking-[0.19em]',
            inverse ? 'text-brand-100' : 'text-brand-700'
          )}>Mali Holdings</div>
          <div className={cn(
            'mt-1.5 text-xl font-black tracking-[-0.035em]',
            inverse ? 'text-white' : 'text-ink-950'
          )}>{module}</div>
        </div>
      )}
    </div>
  );
}
