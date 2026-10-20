import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-fill text-white hover:bg-primary-fill-hover",
  secondary: "bg-surface-raised text-ink border border-line hover:border-line-strong hover:bg-surface-hover",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-raised",
  danger: "bg-crit/14 text-crit border border-crit/40 hover:bg-crit/22",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap",
        "transition-[background-color,border-color,color,transform] duration-(--duration-fast) ease-(--ease-out)",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
}
