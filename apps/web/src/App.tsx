import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogout, apiMe } from "./api/client";
import { AppShell } from "./layout/AppShell";
import { LoginPage } from "./pages/Login";
import { ActivityConfigPage } from "./pages/teacher/ActivityConfigPage";
import { FreezeAllocationPage } from "./pages/teacher/FreezeAllocationPage";
import { PreferencesPage } from "./pages/student/PreferencesPage";
import { ResultsPage } from "./pages/student/ResultsPage";
import { HomePage } from "./pages/Home";

function AuthenticatedRoutes({
  actor,
  onLogout,
}: {
  actor: ActorView;
  onLogout: () => void;
}) {
  return (
    <AppShell actor={actor} onLogout={onLogout}>
      <Routes>
        <Route path="/" element={<HomePage actor={actor} />} />
        <Route
          path="/teacher/config"
          element={
            actor.role === "TEACHER" ? <ActivityConfigPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/teacher/freeze"
          element={
            actor.role === "TEACHER" ? <FreezeAllocationPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/student/preferences"
          element={
            actor.role === "STUDENT" ? <PreferencesPage /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/student/results"
          element={
            actor.role === "STUDENT" ? <ResultsPage /> : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  const [actor, setActor] = useState<ActorView | null | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    apiMe()
      .then(setActor)
      .catch(() => setActor(null));
  }, []);

  const handleLogout = async () => {
    await apiLogout();
    setActor(null);
    navigate("/login");
  };

  if (actor === undefined) {
    return <div className="loading-screen">加载中…</div>;
  }

  if (!actor) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setActor} />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location }} />} />
      </Routes>
    );
  }

  if (location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }

  return <AuthenticatedRoutes actor={actor} onLogout={handleLogout} />;
}
