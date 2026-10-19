import { useEffect, useState } from "react";
import type { ActorView } from "@coursematch/shared";
import { apiActivities } from "../api/client";

export function HomePage({ actor }: { actor: ActorView }) {
  const [items, setItems] = useState<{ activityId: string; title: string; lifecycle: string }[]>(
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
      <h1>工作台</h1>
      <p>共同底座已接通登录与活动列表；其余接口返回 501，由组员在各自模块实现。</p>
      {error && <p className="error">{error}</p>}
      <ul>
        {items.map((a) => (
          <li key={a.activityId}>
            {a.title} <small>({a.lifecycle})</small>
          </li>
        ))}
      </ul>
      {actor.role === "TEACHER" && (
        <p>石俊贤：从导航进入「活动配置」。罗子超：「冻结/结果」。</p>
      )}
      {actor.role === "STUDENT" && (
        <p>刘家铭：从导航进入「志愿」「我的结果」。</p>
      )}
    </div>
  );
}
