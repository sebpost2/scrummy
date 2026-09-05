import type { ButtonHTMLAttributes, ReactNode } from "react";

export default function IconButton({
  label,
  children,
  type,
  className,
  ...rest
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={`icon-button${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
