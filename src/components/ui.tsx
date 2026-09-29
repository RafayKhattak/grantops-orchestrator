import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger" | "success";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[6px] px-3 text-[13px] font-medium tracking-tight transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        variant === "primary" && "bg-ink text-paper hover:bg-shell",
        variant === "quiet" && "border border-line-strong bg-paper text-ink hover:border-ink",
        variant === "danger" && "border border-danger/30 bg-paper text-danger hover:bg-danger hover:text-paper",
        variant === "success" && "bg-good text-paper hover:bg-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-[13px] text-ink">
      <span className="mb-1.5 block font-medium">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "w-full rounded-[6px] border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-ink";
