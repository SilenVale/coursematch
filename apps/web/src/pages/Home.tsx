import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ActivityPhase, ActivitySummary, ActorView } from "@coursematch/shared";
import { apiActivities } from "../api/client";
import { PHASE_LABEL } from "./teacher/configUi";
import { TeacherHome } from "./teacher/TeacherHome";

export function HomePage({ actor }: { actor: ActorView }) {
  if (actor.role === "TEACHER") {
    return <TeacherHome />;
  }

  return <StudentHome />;
}

function phaseLabel(phase: ActivityPhase | undefined): string {
  return phase ? PHASE_LABEL[phase] : "";
}

function StudentHome() {
  const [items, setItems] = useState<ActivitySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiActivities()
      .then((res) => setItems(res.data.items))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const selected = items.find((a) => a.activityId === selectedId) ?? null;

  return (
    <div className="card">
      <h1 className="page-head">工作台</h1>
      <p className="lead">
        先在下方选中一门已发布的选课，再进入「选课填报」选班；截止后在「我的结果」查看分配。
      </p>
      {error && <p className="error">{error}</p>}

      <h2 className="section-title">可参与的选课</h2>
      {items.length === 0 ? (
        <p className="text-muted">暂无已发布的选课。</p>
      ) : (
        <ul className="activity-list">
          {items.map((a) => {
            const picked = selectedId === a.activityId;
            return (
              <li key={a.activityId}>
                <button
                  type="button"
                  className={`activity-list-pick${picked ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(a.activityId)}
                >
                  <strong>{a.title}</strong>
                  <span className="badge badge-muted">
                    {phaseLabel(a.phase) || a.lifecycle}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ marginTop: 16 }}>
        {selected ? (
          <Link
            to={`/student/preferences?activity=${encodeURIComponent(selected.activityId)}`}
            className="btn btn-primary"
          >
            选课填报 · {selected.title}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled title="请先在列表中点选一门选课">
            请先选择志愿
          </button>
        )}
      </p>
      {!selected && items.length > 0 && (
        <p className="text-muted" style={{ marginTop: 8, fontSize: 13 }}>
          点选「{items[0]?.title}」等课种后，再进入填报页，避免多门课时进错活动。
        </p>
      )}
    </div>
  );
}
