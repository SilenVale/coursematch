import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ActorView } from "@coursematch/shared";
import { apiActivities } from "../api/client";

export function HomePage({ actor }: { actor: ActorView }) {
  const [items, setItems] = useState<{ activityId: string; title: string; lifecycle: string; phase?: string }[]>(
    [],
  );
  const [error, setError] = useState("");

  useEffect(() => {
    apiActivities()
      .then((res) => setItems(res.data.items))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const nextLink =
    actor.role === "TEACHER"
      ? { to: "/teacher/config", label: "进入活动配置" }
      : { to: "/student/preferences", label: "填写志愿" };

  return (
    <div className="card">
      <h1 className="page-head">工作台</h1>
      <p className="lead">
        V1 主链已接通：配置与发布、志愿、冻结与主分配、本人结果与教师汇总。从侧栏或下方入口继续操作。
      </p>
      {error && <p className="error">{error}</p>}
      <p>
        <Link to={nextLink.to} className="btn btn-primary">
          {nextLink.label}
        </Link>
      </p>
      <h2 className="section-title">我的活动</h2>
      {items.length === 0 ? (
        <p className="text-muted">暂无可见活动。</p>
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
