import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogout } from "../api/client";
import { DEMO_ACCOUNTS } from "../demoAccounts";

export function UserMenu({ actor, onLogout }: { actor: ActorView; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const roleLabel = actor.role === "TEACHER" ? "教师" : "学生";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function logout() {
    await apiLogout();
    onLogout();
    navigate("/login");
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="av av-init" aria-hidden>
          {actor.displayName.slice(0, 1)}
        </span>
        <span className="user-menu-label">
          {actor.displayName}
          <span className="user-menu-role">{roleLabel}</span>
        </span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-section">切换账号</div>
          {DEMO_ACCOUNTS.map((row) => (
            <button
              key={row.id}
              type="button"
              className="user-menu-item"
              onClick={() => {
                setOpen(false);
                void (async () => {
                  await apiLogout();
                  onLogout();
                  navigate(`/login?prefill=${encodeURIComponent(row.id)}`);
                })();
              }}
            >
              {row.title}
              <span className="user-menu-hint">{row.hint}</span>
            </button>
          ))}
          <button type="button" className="user-menu-item" onClick={() => void logout()}>
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
