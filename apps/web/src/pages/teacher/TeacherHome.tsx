import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ActivitySummary } from "@coursematch/shared";
import { apiActivities } from "../../api/client";
import { formatBeijing } from "./configUi";
import { lifecycleShort, teacherNextAction } from "./teacherCourseUi";

export function TeacherHome() {
  const [items, setItems] = useState<ActivitySummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiActivities()
      .then((res) => setItems(res.data.items))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card teacher-home">
      <div className="teacher-home-head">
        <div>
          <h1 className="page-head">我的选课任务</h1>
          <p className="lead">创建并发布选课，学生在截止前填报志愿；截止后在「分配结果」中冻结并主分配。</p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/teacher/assistant")}
          >
            用助理创建
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate("/teacher/courses/new")}
          >
            新建选课任务
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="text-muted">加载中…</p>}

      {!loading && items.length === 0 && (
        <div className="teacher-empty">
          <p>还没有选课任务。点击「新建选课任务」从基本信息、名单与题目开始配置。</p>
          <p className="text-muted">
            演示：使用右上角切换 <code>teacher_ready</code> 查看已配置示例；<code>teacher_blank</code> 为空账号。
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="table-wrap">
          <table className="data-table teacher-course-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>状态</th>
                <th>截止时间</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const next = teacherNextAction(a);
                return (
                  <tr key={a.activityId}>
                    <td>
                      <Link to={next.to} className="link-strong">
                        {a.title}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-muted">{lifecycleShort(a.lifecycle, a.phase)}</span>
                    </td>
                    <td className="text-muted">{formatBeijing(a.deadlineAt)}</td>
                    <td>
                      <Link to={next.to} className="btn btn-sm">
                        {next.label}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
