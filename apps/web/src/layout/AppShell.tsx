import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { UserMenu } from "../components/UserMenu";

const TEACHER_NAV = [
  { to: "/", label: "工作台", end: true },
  { to: "/teacher/assistant", label: "选课助理" },
] as const;

const STUDENT_NAV = [
  { to: "/", label: "工作台", end: true },
  { to: "/student/preferences", label: "志愿填报" },
  { to: "/student/results", label: "我的结果" },
] as const;

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/teacher/assistant")) return "选课助理";
  if (pathname.startsWith("/teacher/courses")) return "选课任务";
  if (pathname.startsWith("/student/preferences")) return "志愿填报";
  if (pathname.startsWith("/student/results")) return "我的结果";
  return "工作台";
}

export function AppShell({
  actor,
  onLogout,
  children,
}: {
  actor: ActorView;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const nav = actor.role === "TEACHER" ? TEACHER_NAV : STUDENT_NAV;
  const roleLabel = actor.role === "TEACHER" ? "教师" : "学生";

  return (
    <div className="app">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
              <path
                d="M8 12h16v2H8v-2zm0 5h12v2H8v-2zm0 5h10v2H8v-2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">CourseMatch</span>
            <span className="brand-sub">选课与分配</span>
          </div>
        </div>

        <nav className="sb-groups">
          <div className="sb-group">
            <div className="sb-label">{roleLabel}端</div>
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) => `sb-item${isActive ? " is-active" : ""}`}
              >
                <span className="sb-text">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>

      <div className="inset">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb-muted">CourseMatch</span>
            <span className="crumb-sep" aria-hidden>/</span>
            <span aria-current="page">{pageTitle(pathname)}</span>
          </div>
          <div className="topbar-actions">
            <UserMenu actor={actor} onLogout={onLogout} />
          </div>
        </header>
        <main className="main">
          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}
