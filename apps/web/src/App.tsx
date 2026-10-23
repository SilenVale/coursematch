import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogout, apiMe } from "./api/client";
import { LoginPage } from "./pages/Login";
import { ActivityConfigPage } from "./pages/teacher/ActivityConfigPage";
import { FreezeAllocationPlaceholder } from "./pages/teacher/FreezeAllocationPlaceholder";
import { PreferencesPage } from "./pages/student/PreferencesPage";
import { ResultsPlaceholder } from "./pages/student/ResultsPlaceholder";
import { HomePage } from "./pages/Home";

export function App() {
  const [actor, setActor] = useState<ActorView | null | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    apiMe().then(setActor);
  }, []);

  if (actor === undefined) {
    return <div className="shell">加载中…</div>;
  }

  return (
    <div className="shell">
      <header className="card" style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <strong>CourseMatch</strong>
          {actor && (
            <span style={{ marginLeft: 12, color: "#555" }}>
              {actor.displayName}（{actor.role === "TEACHER" ? "教师" : "学生"}）
            </span>
          )}
        </div>
        <nav>
          {actor ? (
            <>
              <Link to="/">首页</Link>
              {actor.role === "TEACHER" ? (
                <>
                  {" · "}
                  <Link to="/teacher/config">活动配置</Link>
                  {" · "}
                  <Link to="/teacher/freeze">冻结/结果</Link>
                </>
              ) : (
                <>
                  {" · "}
                  <Link to="/student/preferences">志愿</Link>
                  {" · "}
                  <Link to="/student/results">我的结果</Link>
                </>
              )}
              {" · "}
              <button
                type="button"
                onClick={async () => {
                  await apiLogout();
                  setActor(null);
                  navigate("/login");
                }}
              >
                退出
              </button>
            </>
          ) : (
            <Link to="/login">登录</Link>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setActor} />} />
        <Route
          path="/"
          element={actor ? <HomePage actor={actor} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/teacher/config"
          element={
            actor?.role === "TEACHER" ? (
              <ActivityConfigPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/teacher/freeze"
          element={
            actor?.role === "TEACHER" ? (
              <FreezeAllocationPlaceholder />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/student/preferences"
          element={
            actor?.role === "STUDENT" ? (
              <PreferencesPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/student/results"
          element={
            actor?.role === "STUDENT" ? (
              <ResultsPlaceholder />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
      </Routes>
    </div>
  );
}
