import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "filled" | "tinted" | "gray" | "plain" | "destructive" | "success";
type Size = "large" | "medium" | "small";

const variants: Record<Variant, string> = {
  filled: "bg-ios-blue text-white",
  success: "bg-ios-green text-white",
  destructive: "bg-ios-red/15 text-ios-red",
  tinted: "bg-ios-blue/15 text-ios-blue",
  gray: "bg-fill-3 text-label",
  plain: "bg-transparent text-ios-blue",
};
const sizes: Record<Size, string> = {
  large: "h-[50px] rounded-[14px] px-5 text-headline font-semibold w-full",
  medium: "h-11 rounded-xl px-4 text-body font-semibold",
  small: "h-8 rounded-full px-3.5 text-subhead font-semibold",
};

export type IosButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

/** iOS 17+ button styles (filled / tinted / gray / plain). */
export const Button = forwardRef<HTMLButtonElement, IosButtonProps>(function Button(
  { variant = "filled", size = "large", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "pressable inline-flex items-center justify-center gap-2 disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
