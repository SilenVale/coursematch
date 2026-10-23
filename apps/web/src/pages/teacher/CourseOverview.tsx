import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { ActivityView } from "@coursematch/shared";
import { getActivity } from "./configApi";
import { formatBeijing, LIFECYCLE_LABEL, PHASE_LABEL } from "./configUi";
import { teacherNextAction } from "./teacherCourseUi";

type Ctx = { activityId: string };

export function CourseOverview() {
  const { activityId } = useOutletContext<Ctx>();
  const [activity, setActivity] = useState<ActivityView | null>(null);

  useEffect(() => {
    getActivity(activityId).then(setActivity).catch(() => setActivity(null));
  }, [activityId]);

  if (!activity) {
    return <p className="text-muted">加载中…</p>;
  }

  const next = teacherNextAction(activity);
  const phaseText =
    PHASE_LABEL[activity.phase] !== LIFECYCLE_LABEL[activity.lifecycle]
      ? PHASE_LABEL[activity.phase]
      : LIFECYCLE_LABEL[activity.lifecycle];

  return (
    <div className="card course-overview">
      <p className="lead">
        当前状态：<strong>{phaseText}</strong>。开始 {formatBeijing(activity.startAt)}，截止{" "}
        {formatBeijing(activity.deadlineAt)}，每人最多 {activity.maxPreferences} 个志愿。
      </p>
      <p className="text-muted">{activity.description || "（未填写说明）"}</p>
      <p>
        <Link to={next.to} className="btn btn-primary">
          {next.label}
        </Link>
      </p>
      <ol className="course-steps text-muted">
        <li>课程设置：基本信息、名单 CSV、题目与名额</li>
        <li>发布选课：学生在「志愿填报」中提交有序志愿</li>
        <li>截止后：分配结果 → 冻结快照 → 主分配 → 关闭</li>
      </ol>
    </div>
  );
}
