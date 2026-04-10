import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

const TOAST_DURATION = 4000;

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={TOAST_DURATION}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="grid gap-1 w-full">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
            <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden rounded-b-md">
              <div
                className={`h-full toast-progress-bar ${
                  variant === "destructive"
                    ? "bg-destructive-foreground/30"
                    : "bg-primary/25"
                }`}
                style={{ "--toast-duration": `${TOAST_DURATION}ms` } as React.CSSProperties}
              />
            </div>
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
