"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

import IconButton from "./IconButton";

type Mode = "light" | "dark" | "system";
const NEXT: Record<Mode, Mode> = { light: "dark", dark: "system", system: "light" };

function apply(mode: Mode) {
  const el = document.documentElement;
  if (mode === "system") delete el.dataset.theme;
  else el.dataset.theme = mode;
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("scrummy-theme") as Mode | null) ?? "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(stored);
    setMounted(true);
  }, []);

  const cycle = () => {
    const next = NEXT[mode];
    setMode(next);
    if (next === "system") localStorage.removeItem("scrummy-theme");
    else localStorage.setItem("scrummy-theme", next);
    apply(next);
  };

  const Icon = !mounted ? Monitor : mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <IconButton label={mounted ? `Theme: ${mode}` : "Theme"} onClick={cycle}>
      <Icon size={16} />
    </IconButton>
  );
}
