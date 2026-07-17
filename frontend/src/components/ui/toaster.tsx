import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import {
  Bell,
  CheckCircle2,
  CircleX,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

const toastVisuals: Record<
  'default' | 'success' | 'info' | 'warning' | 'destructive',
  { icon: LucideIcon; iconClassName: string; duration: number }
> = {
  default: {
    icon: Bell,
    iconClassName: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200',
    duration: 4500,
  },
  success: {
    icon: CheckCircle2,
    iconClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
    duration: 4000,
  },
  info: {
    icon: Info,
    iconClassName: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200',
    duration: 5500,
  },
  warning: {
    icon: TriangleAlert,
    iconClassName: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
    duration: 5500,
  },
  destructive: {
    icon: CircleX,
    iconClassName: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
    duration: 7500,
  },
};

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        dedupeKey: _dedupeKey,
        variant: toastVariant,
        duration,
        ...props
      }) {
        const variant = toastVariant ?? 'default';
        const visual = toastVisuals[variant];
        const Icon = visual.icon;

        return (
          <Toast key={id} variant={variant} duration={duration ?? visual.duration} {...props}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${visual.iconClassName}`}>
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
            <div className="grid min-w-0 flex-1 gap-1 pt-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action && <div className="self-center">{action}</div>}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
