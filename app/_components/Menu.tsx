"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MenuCtx = createContext<{ close: () => void }>({ close: () => {} });

export default function Menu({
  trigger,
  children,
  align = "end",
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className="menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu__panel menu__panel--${align}`} role="menu">
          <MenuCtx.Provider value={{ close: () => setOpen(false) }}>
            {children}
          </MenuCtx.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  href,
  danger,
}: {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const { close } = useContext(MenuCtx);
  const cls = `menu__item${danger ? " menu__item--danger" : ""}`;
  const handle = () => {
    onSelect?.();
    close();
  };
  if (href) {
    return (
      <Link href={href} role="menuitem" className={cls} onClick={handle}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" className={cls} onClick={handle}>
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu__sep" role="separator" />;
}
