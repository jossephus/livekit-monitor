import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/rooms", label: "Rooms" },
  { to: "/sessions", label: "Sessions" },
  { to: "/egress", label: "Egress" },
  { to: "/ingress", label: "Ingress" },
  { to: "/settings", label: "Settings" },
]

export default function Sidebar() {
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
      <div className="border-sidebar-border border-t px-7 py-5 text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/45">
        self-hosted · v1.0
      </div>
    </aside>
  )
}
