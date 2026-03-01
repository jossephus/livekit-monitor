import { useEffect, useState } from "react"
import { Laptop, Moon, Sun } from "lucide-react"
import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"
import {
  THEME_CHANGE_EVENT,
  applyTheme,
  getStoredThemeMode,
  setThemeMode,
  type ThemeMode,
} from "@/lib/theme"

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/rooms", label: "Rooms" },
  { to: "/sessions", label: "Sessions" },
  { to: "/egress", label: "Egress" },
  { to: "/ingress", label: "Ingress" },
  { to: "/settings", label: "Settings" },
]

export default function Sidebar() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredThemeMode())

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<ThemeMode>
      setThemeModeState(customEvent.detail)
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleSystemThemeChange = () => {
      if (getStoredThemeMode() === "system") {
        applyTheme("system")
      }
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener)
    mediaQuery.addEventListener("change", handleSystemThemeChange)

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener)
      mediaQuery.removeEventListener("change", handleSystemThemeChange)
    }
  }, [])

  const onThemeSelect = (mode: ThemeMode) => {
    setThemeModeState(mode)
    setThemeMode(mode)
  }

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-sidebar-border border-b px-7 py-8">
        <p className="text-2xl font-light lowercase tracking-[0.08em]">livekit</p>
        <p className="pt-1 text-xs uppercase tracking-[0.2em] text-sidebar-foreground/45">monitor</p>
      </div>
      <nav className="flex-1 space-y-1 px-5 py-8">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="block rounded-md px-2 py-2 text-xs uppercase tracking-[0.15em] transition-colors"
          >
            {({ isActive }) => (
              <span
                className={cn(
                  "flex items-center gap-3",
                  isActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground/75"
                )}
              >
                <span
                  className={cn(
                    "w-3 text-center text-[10px] leading-none",
                    isActive ? "text-[#A8A29E]" : "text-transparent"
                  )}
                >
                  ●
                </span>
                {item.label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-sidebar-border border-t px-7 py-5">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onThemeSelect("light")}
            aria-label="Use light theme"
            title="Light"
            className={cn(
              "rounded-md p-2 transition-colors",
              themeMode === "light"
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/50 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            )}
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onThemeSelect("dark")}
            aria-label="Use dark theme"
            title="Dark"
            className={cn(
              "rounded-md p-2 transition-colors",
              themeMode === "dark"
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/50 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            )}
          >
            <Moon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onThemeSelect("system")}
            aria-label="Use system theme"
            title="System"
            className={cn(
              "rounded-md p-2 transition-colors",
              themeMode === "system"
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/50 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
            )}
          >
            <Laptop className="h-4 w-4" />
          </button>
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/45">self-hosted · v1.0</div>
      </div>
    </aside>
  )
}
