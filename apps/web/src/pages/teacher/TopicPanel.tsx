/**
 * 石俊贤 · M2 题目面板。
 *
 * 题目接口（GET/POST/PATCH/DELETE .../topics）依赖 `topic` 表，
 * 该表尚未进入迁移，服务端当前返回 501。本面板在 501 时展示明确说明，
 * 而不是把错误当成「空列表」——否则教师会误以为题目真的没配。
 */
import { useCallback, useEffect, useState } from "react";
import type { TeacherTopicView } from "@coursematch/shared";
import { ApiError, listTopics } from "./configApi";
import { Badge, ErrorBanner, toApiError } from "./configUi";

export function TopicPanel({
  activityId,
  editable,
}: {
  activityId: string;
  editable: boolean;
}) {
  const [topics, setTopics] = useState<TeacherTopicView[]>([]);
  const [heatSource, setHeatSource] = useState<"LIVE" | "FROZEN">("LIVE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPending(false);
    try {
      const res = await listTopics(activityId);
      // 教师视角一定是 TeacherTopicView（带 eligibleParticipantIds）。
      setTopics(res.items as TeacherTopicView[]);
      setHeatSource(res.heatSource);
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.notImplemented) {
        setPending(true);
        setTopics([]);
      } else {
        setError(apiError);
      }
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCapacity = topics.reduce((sum, t) => sum + t.capacity, 0);

  return (
    <section className="cm-panel">
      <header className="cm-panel-head">
        <h2>题目与名额</h2>
        <span className="cm-muted">
          {loading
            ? "加载中…"
            : pending
              ? "待接入"
              : `${topics.length} 个题目，合计容量 ${totalCapacity}`}
        </span>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {pending ? (
        <div className="cm-pending">
          <p>
            <strong>题目接口尚未实现（HTTP 501）。</strong>
          </p>
          <p>
            <code>GET/POST/PATCH/DELETE /api/activities/:activityId/topics</code> 依赖
            <code> topic </code>表，该表还没有进入数据库迁移。迁移补齐后本面板会自动接上，
            无需改动页面。
          </p>
          <p className="cm-muted">
            在题目可配置之前，活动不满足发布条件（见下方「发布前检查」）。
          </p>
        </div>
      ) : topics.length === 0 ? (
        <p className="cm-empty">
          还没有题目。每个题目需要名称、简介、标签、容量和资格条件；名额必须是正整数。
        </p>
      ) : (
        <div className="cm-table-wrap">
          <table>
            <thead>
              <tr>
                <th>题目</th>
                <th>标签</th>
                <th>容量</th>
                <th>资格</th>
                <th>热度</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.topicId}>
                  <td>
                    <strong>{t.title}</strong>
                    {t.description && (
                      <div className="cm-muted cm-topic-desc">{t.description}</div>
                    )}
                  </td>
                  <td>
                    {t.tags.length === 0 ? (
                      <span className="cm-muted">—</span>
                    ) : (
                      t.tags.map((tag) => (
                        <span key={tag} className="cm-tag">
                          {tag}
                        </span>
                      ))
                    )}
                  </td>
                  <td>{t.capacity}</td>
                  <td>
                    <Badge tone={t.eligibilityMode === "ALL" ? "muted" : "warn"}>
                      {t.eligibilityMode === "ALL"
                        ? "名单内全体"
                        : `限定 ${t.eligibleParticipantIds?.length ?? 0} 人`}
                    </Badge>
                    {t.eligibilityDescription && (
                      <div className="cm-muted cm-topic-desc">{t.eligibilityDescription}</div>
                    )}
                  </td>
                  <td>
                    {t.heat.preferenceCount}
                    <span className="cm-muted"> 人选择</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cm-actions">
        <button type="button" onClick={() => void load()} disabled={loading}>
          刷新
        </button>
        {!pending && (
          <button type="button" disabled={!editable}>
            新增题目
          </button>
        )}
        {!editable && <span className="cm-muted">活动已发布，题目不可修改</span>}
      </div>

      {heatSource === "FROZEN" && (
        <p className="cm-muted">热度取自冻结快照，不再实时变化。</p>
      )}
    </section>
  );
}
