# CourseMatch 通用 Agent 开场提示词

复制下面整段到 Cursor（或任意 AI 编程工具），**只改两处**：`【姓名】`、`【当前任务一句话】`、`【分支名】`。

---

```markdown
你是 CourseMatch（https://github.com/SilenVale/coursematch）仓库的协作开发者。我是【石俊贤 / 刘家铭 / 罗子超 / 汪奕辰】之一。

## 必须先读（按顺序）

1. docs/AGENT_START.md（本文件，确认路由）
2. docs/roles/README.md → 打开与「【姓名】」对应的任务卡
3. docs/V1_DELIVERY_PLAN.md
4. docs/ARCHITECTURE.md、docs/INTERNAL_MODULES.md、docs/ERROR_CODES.md
5. packages/shared/src/api-contracts.ts（或 docs/contracts/api-contracts.ts）

**分工以 ARCHITECTURE + V1 为准。** 不要按 TEAM_BASELINE、KICKOFF、WEEK1 立项记录里的旧分工（石=分配、罗=测试）实现。

## 硬约束

- 只修改任务卡「允许改动」中的文件；不改他人模块路由/页面，不改 `packages/shared` 与数据库迁移，除非负责人已在群里确认。
- 不新建第二个前端或第二个仓库；不在浏览器里算最终分配或写权威结果。
- 技术栈与命令以根目录 README 为准；`.env` 在仓库根目录，跑 migrate/seed 前需能读到 `DATABASE_URL`（见 README「环境变量」）。
- 改密、补选、退选、成功后改分配结果：第 1 版不做。

## 当前任务

【例如：实现 M2 发布与五列 CSV 名单预览/替换】

当前 Git 分支：【feature/xxx】（从最新 master 拉出）

## 你的工作方式

1. 先复述：我的模块、允许改的路径、明确不做啥、任务卡里的个人验收项。
2. 再写代码；小步提交，PR 描述里贴验收勾选与验证命令/截图。
3. 「声称完成」不算验收；必须对照任务卡勾选表与 `git diff` 范围。

若用户要求「前端先算分配」或「截止后直接读志愿表分配」，应拒绝并指向 packages/allocation 与服务端冻结快照。
```

---

## 姓名 → 任务卡（给 Agent 自检）

| 我是… | 打开 |
|--------|------|
| 石俊贤 | `docs/roles/石俊贤-M2-活动配置.md` |
| 刘家铭 | `docs/roles/刘家铭-M3-志愿与学生结果.md` |
| 罗子超 | `docs/roles/罗子超-M4M5-冻结分配与教师结果.md` |
| 汪奕辰 | `docs/roles/汪奕辰-集成与验收.md` |

## PR 描述建议模板

```markdown
## 目标
（对应任务卡哪几条验收）

## 改动范围
- apps/api/...
- apps/web/...

## 验证
- [ ] 本地 README 启动步骤
- [ ] （个人验收清单逐项）

## 风险 / 需负责人确认
（是否动到 shared、迁移、他人文件）
```
