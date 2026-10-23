import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiActivities } from "../api/client";
import { TeacherHome } from "./teacher/TeacherHome";

export function HomePage({ actor }: { actor: ActorView }) {
  if (actor.role === "TEACHER") {
    return <TeacherHome />;
  }

  return <StudentHome />;
}

function StudentHome() {
  const [items, setItems] = useState<{ activityId: string; title: string; lifecycle: string; phase?: string }[]>(
    [],
  );
  const [error, setError] = useState("");

  useEffect(() => {
    apiActivities()
      .then((res) => setItems(res.data.items))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <div className="card">
      <h1 className="page-head">工作台</h1>
      <p className="lead">在截止前填报有序志愿；分配完成后在「我的结果」查看。</p>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to="/student/preferences" className="btn btn-primary">
          志愿填报
        </Link>
      </p>
      <h2 className="section-title">可参与的选课</h2>
      {items.length === 0 ? (
        <p className="text-muted">暂无可选课程。</p>
      ) : (
        <ul className="activity-list">
          {items.map((a) => (
            <li key={a.activityId}>
              <span>
                <strong>{a.title}</strong>
              </span>
              <span className="badge badge-muted">{a.lifecycle}{a.phase ? ` · ${a.phase}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
