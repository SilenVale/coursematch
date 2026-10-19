export function ResultsPlaceholder() {
  return (
    <div className="card">
      <h1>学生 · 我的结果</h1>
      <p>负责人：刘家铭。只读服务端结果；区分已分配、全落选、未提交；无补选入口。</p>
      <p>与罗子超的结果接口协同：<code>apps/api/src/routes/activities/results.ts</code></p>
    </div>
  );
}
