import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { getActivity } from "./configApi";
import { PHASE_LABEL, LIFECYCLE_LABEL } from "./configUi";

const TABS = [
  { suffix: "overview", label: "概览" },
  { suffix: "configure", label: "课程设置" },
  { suffix: "results", label: "分配结果" },
] as const;

export function CourseLayout() {
  const { activityId } = useParams<{ activityId: string }>();
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");

  useEffect(() => {
    if (!activityId) return;
    getActivity(activityId)
      .then((a) => {
        setTitle(a.title);
        const phase =
          PHASE_LABEL[a.phase] !== LIFECYCLE_LABEL[a.lifecycle]
            ? PHASE_LABEL[a.phase]
            : LIFECYCLE_LABEL[a.lifecycle];
        setMeta(phase);
      })
      .catch(() => {
        setTitle("选课任务");
        setMeta("");
      });
  }, [activityId]);

  if (!activityId) {
    return <p className="error">缺少选课任务 ID</p>;
  }

  const base = `/teacher/courses/${activityId}`;

  return (
    <div className="course-layout">
      <div className="course-layout-head">
        <Link to="/" className="text-muted course-back">
          ← 返回工作台
        </Link>
        <h1 className="page-head">{title || "加载中…"}</h1>
        {meta && <span className="badge badge-muted">{meta}</span>}
      </div>
      <nav className="course-tabs" aria-label="本次选课">
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
