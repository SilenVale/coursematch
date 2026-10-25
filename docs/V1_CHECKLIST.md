# V1 优秀线勾选表（§1.4）

> 答辩前由负责人汇总；每项须有可复核证据（链接/截图/PR）。  
> 未勾满须在报告中写清未测范围与原因，勿写「已通过」。

| # | 交付项 | 负责人 | 通过？ | 证据（PR / 录屏 / 文档 / URL） |
|---|--------|--------|--------|--------------------------------|
| 1 | 主链端到端 | 汪奕辰汇总 | ☐ | [v1-e2e-runbook.md](./testing/v1-e2e-runbook.md) 执行记录： |
| 2 | 分配规则正确 | 罗子超 | ☑ | [M4/M5 测试报告](./testing/luozichao-m4m5-test-report.md) + `allocation-bridge.test.ts` P1 回归；主分配与轮次解释一致 |
| 3 | 服务端权威 | 三人 PR + 联调 | ☐ | 越权用例（runbook §6）： |
| 4 | 截止与冻结 | 刘 + 罗 | ☑ | [M4/M5 测试报告](./testing/luozichao-m4m5-test-report.md)：截止前 409、无 READY 快照 409、4 人唯一 lottery、完整快照、重复冻结同一 snapshotId |
| 5 | CSV 与发布 | 石俊贤 | ☐ | [m2-test-cases.md](./testing/m2-test-cases.md) · 集成测试 PR #28（`TC-M2-xxx`）+ Dev 实机： |
| 6 | 契约一致 | 各 PR review | ☐ | |
| 7 | 可公开体验 HTTPS | 汪奕辰 | ☑ | [https://coursematch-dev.onrender.com](https://coursematch-dev.onrender.com) · `GET /api/health` → 200 · README 已更新 |
| 8 | 过程与质量 | 全员 | ☐ | 测试计划；组外试用 ≥1 次；各人可识别 PR： |

## 成员 PR 索引（示例，合并后填写）

| 成员 | 模块 | PR |
|------|------|-----|
| 石俊贤 | M2 + 集成测试 | #18, #21, #28 |
| 刘家铭 | M3 + 学生结果 | #22, #23 |
| 罗子超 | M4/M5 教师 | #19 |
| 汪奕辰 | 集成 / Render Dev / 勾选表 | #27, #29, demo URL PR |

## 组外试用记录（模板）

| 日期 | 参与者 | 操作摘要 | 反馈原话 | 是否改需求 |
|------|--------|----------|----------|------------|
| | | | | |
