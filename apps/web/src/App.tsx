import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiLogout, apiMe } from "./api/client";
import { AppShell } from "./layout/AppShell";
import { LandingPage } from "./pages/landing/LandingPage";
import { LoginPage } from "./pages/Login";
import { ActivityConfigurePage } from "./pages/teacher/ActivityConfigPage";
import { CourseLayout } from "./pages/teacher/CourseLayout";
import { CourseOverview } from "./pages/teacher/CourseOverview";
import { CreateCoursePage } from "./pages/teacher/CreateCoursePage";
import { FreezeAllocationPage } from "./pages/teacher/FreezeAllocationPage";
import { TeacherAssistantPage } from "./pages/teacher/TeacherAssistantPage";
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
        <Route path="/app" element={<HomePage actor={actor} />} />
        <Route path="/teacher/courses/new" element={<CreateCoursePage />} />
        <Route
          path="/teacher/assistant"
          element={
            actor.role === "TEACHER" ? <TeacherAssistantPage /> : <Navigate to="/app" replace />
          }
        />
        <Route path="/teacher/courses/:activityId" element={<CourseLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<CourseOverview />} />
          <Route path="configure" element={<ActivityConfigurePage />} />
          <Route path="results" element={<FreezeAllocationPage />} />
        </Route>
        <Route path="/teacher/config" element={<Navigate to="/app" replace />} />
        <Route path="/teacher/freeze" element={<Navigate to="/app" replace />} />
        <Route
          path="/student/preferences"
          element={
            actor.role === "STUDENT" ? <PreferencesPage /> : <Navigate to="/app" replace />
          }
        />
        <Route
          path="/student/results"
          element={
            actor.role === "STUDENT" ? <ResultsPage /> : <Navigate to="/app" replace />
          }
        />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
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

  const handleLogin = (a: ActorView) => {
    setActor(a);
    navigate("/app", { replace: true });
  };

  const handleLogout = async () => {
    await apiLogout();
    setActor(null);
    navigate("/login", { replace: true });
  };

  if (actor === undefined) {
    return <div className="loading-screen">加载中…</div>;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          actor ? <Navigate to="/app" replace /> : <LoginPage onLogin={handleLogin} />
        }
      />
      <Route
        path="*"
        element={
          actor ? (
            <AuthenticatedRoutes actor={actor} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace state={{ from: location }} />
          )
        }
      />
    </Routes>
  );
}
