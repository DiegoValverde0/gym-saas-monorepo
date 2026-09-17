import { ReactNode } from "react";
import { toast as baseToast } from "@/components/ui/toast";

type ToastOptions = {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  action?: ReactNode;
  duration?: number;
};

export const useToast = () => {
  const toast = ({ title, description, variant = 'default', action, duration = 5000 }: ToastOptions) => {
    // Map variant to base-ui type
    let type = undefined;
    if (variant === 'destructive') type = 'error';
    if (variant === 'success') type = 'success';
    if (variant === 'warning') type = 'warning';
    if (variant === 'info') type = 'info';

    (baseToast as { add: (options: Record<string, unknown>) => void }).add({
      title,
      description,
      type,
      action,
      duration,
    });
  };

  return { toast };
};
