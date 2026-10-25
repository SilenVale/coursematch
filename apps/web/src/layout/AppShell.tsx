import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { NavIcon } from "../components/NavIcon";
import { UserMenu } from "../components/UserMenu";
import { useTopbarScroll } from "./useTopbarScroll";

type NavItem = {
  to: string;
  label: string;
  icon: "layout-dashboard" | "list-checks" | "clipboard-list" | "plus-square";
  end?: boolean;
};

const TEACHER_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "工作台",
    items: [
      { to: "/", label: "我的选课任务", icon: "layout-dashboard", end: true },
      { to: "/teacher/courses/new", label: "新建选课任务", icon: "plus-square" },
    ],
  },
];

const STUDENT_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "选课",
    items: [
      { to: "/", label: "工作台", icon: "layout-dashboard", end: true },
      { to: "/student/preferences", label: "志愿填报", icon: "clipboard-list" },
      { to: "/student/results", label: "我的结果", icon: "list-checks" },
    ],
  },
];

function crumbGroup(actor: ActorView): string {
  return actor.role === "TEACHER" ? "教师" : "学生";
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/teacher/courses/new")) return "新建选课任务";
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
  const groups = actor.role === "TEACHER" ? TEACHER_GROUPS : STUDENT_GROUPS;
  const { mainRef, scrolled } = useTopbarScroll();

  return (
    <div className="app">
      <aside className="sidebar" aria-label="主导航">
        <div className="sb-top">
          <div className="ws-switch" aria-label="CourseMatch 工作区">
            <div className="brand-mark" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M6 8h12M6 12h10M6 16h8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="ws-text">
              <span className="ws-name">CourseMatch</span>
              <span className="ws-sub">选课与分配 · 演示</span>
            </div>
          </div>
        </div>

        <div className="sb-scroll">
          {groups.map((group) => (
            <div className="sb-group" key={group.label}>
              <div className="sb-label">{group.label}</div>
              <nav className="sb-nav" aria-label={group.label}>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) => `sb-item${isActive ? " is-active" : ""}`}
                  >
                    <NavIcon name={item.icon} />
                    <span className="sb-text">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="sb-foot">
          <div className="target-card">
            <p className="target-card-title">流程提示</p>
            <p className="target-card-body">
              {actor.role === "TEACHER"
                ? "发布 → 学生填报 → 截止后冻结并主分配。"
                : "截止前保存志愿；分配后在「我的结果」查看。"}
            </p>
          </div>
        </div>
      </aside>

      <div className="inset">
        <header className={`topbar${scrolled ? " scrolled" : ""}`}>
          <div className="crumbs">
            <span className="crumb-muted">{crumbGroup(actor)}</span>
            <span className="crumb-sep" aria-hidden>
              /
            </span>
            <span aria-current="page">{pageTitle(pathname)}</span>
          </div>
          <div className="topbar-actions">
            <UserMenu actor={actor} onLogout={onLogout} />
          </div>
        </header>
        <main className="main" ref={mainRef}>
          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}
