import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn("text-xs font-medium text-muted-foreground", className)}
        {...props}
      />
    );
  },
);
