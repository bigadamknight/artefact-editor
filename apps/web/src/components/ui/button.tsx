import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

type Variant = "default" | "secondary" | "ghost" | "outline";
type Size = "default" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  default:
    "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
  secondary: "bg-muted text-foreground hover:bg-muted/80 disabled:opacity-50",
  ghost: "hover:bg-muted disabled:opacity-50",
  outline:
    "border border-border bg-background hover:bg-muted disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-7 px-2 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
