import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { getActivity } from "./configApi";
import { PHASE_LABEL, LIFECYCLE_LABEL } from "./configUi";
import { CONFIGURE_NAV_LABEL } from "./teacherCourseUi";

const TABS = [
  { suffix: "overview", label: "概览" },
  { suffix: "configure", label: CONFIGURE_NAV_LABEL },
  { suffix: "results", label: "分配结果" },
] as const;

export function CourseLayout() {
  const { activityId } = useParams<{ activityId: string }>();
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [lifecycle, setLifecycle] = useState<string>("");

  useEffect(() => {
    if (!activityId) return;
    getActivity(activityId)
      .then((a) => {
        setTitle(a.title);
        setLifecycle(a.lifecycle);
        const phase =
          PHASE_LABEL[a.phase] !== LIFECYCLE_LABEL[a.lifecycle]
            ? PHASE_LABEL[a.phase]
            : LIFECYCLE_LABEL[a.lifecycle];
        setMeta(phase);
      })
      .catch(() => {
        setTitle("课种");
        setMeta("");
      });
  }, [activityId]);

  if (!activityId) {
    return <p className="error">缺少课程 ID</p>;
  }

  const base = `/teacher/courses/${activityId}`;

  return (
    <div className="course-layout">
      <div className="course-layout-head">
        <Link to="/" className="text-muted course-back">
          ← 返回工作台
        </Link>
        <h1 className="page-head">{title || "加载中…"}</h1>
        <div className="course-layout-actions">
          {meta && <span className="badge badge-muted">{meta}</span>}
          {lifecycle === "DRAFT" && (
            <Link to={`/teacher/assistant?activity=${activityId}`} className="btn btn-secondary btn-sm">
              用选课助理
            </Link>
          )}
        </div>
      </div>
      <nav className="course-tabs" aria-label="本轮选课">
        {TABS.map((tab) => (
          <NavLink
            key={tab.suffix}
            to={`${base}/${tab.suffix}`}
            className={({ isActive }) => `course-tab${isActive ? " is-active" : ""}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ activityId }} />
    </div>
  );
}
