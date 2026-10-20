# M2 活动配置 PR 描述（草稿）

> 分支：`feat/m2-activity-config`（从 `master` @ `ef7c1a9` 拉出）
> 作者：石俊贤
> 用途：直接粘贴到 GitHub Pull Request 描述框。

## 目标

对应任务卡 [石俊贤-M2-活动配置.md](../roles/石俊贤-M2-活动配置.md) 的 11 个接口与教师端配置页，
覆盖 [V1_DELIVERY_PLAN.md §1.1](../V1_DELIVERY_PLAN.md) 教师侧主链的第一段。

## 改动范围

### 后端（`apps/api/src/routes/activities/`）

| 文件 | 说明 |
|---|---|
| `config.ts` | 主路由，11 个接口全部实现 |
| `config-roster.ts` | CSV 五列解析与逐行校验（纯函数） |
| `config-roster.test.ts` | 20 条单测 |
| `config-topics.ts` | 题目字段/资格校验与视图映射（纯函数） |
| `config-topics.test.ts` | 21 条单测 |
| `config-topics-db.ts` | 题目相关数据库操作（拆出是为了让纯函数可单测） |

三个新文件均以 `config` 为前缀，符合任务卡「若 M2 需要私有 helper：`apps/api/src/routes/activities/` 下以 `config` 为前缀的新文件（须 PR 说明）」。

### 前端（`apps/web/src/pages/teacher/`）

| 文件 | 说明 |
|---|---|
| `ActivityConfigPage.tsx` | 页面骨架：活动侧栏、新建草稿、面板编排 |
| `ActivityBasicsForm.tsx` | 基本信息，只提交改动过的字段 |
| `RosterPanel.tsx` | 选文件/粘贴 CSV → 预览 → 确认整份替换 → 名单筛选 |
| `TopicPanel.tsx` | 题目 CRUD、资格模式、限定学生选择 |
| `PublishPanel.tsx` | 发布前检查清单、发布、带原因作废 |
| `configApi.ts` | M2 请求层（未改 M1 的 `api/client.ts`） |
| `configUi.tsx` | 错误横幅、逐行错误表、北京时间格式化 |
| `teacher-config.css` | 样式，作用域限定在 `.cm-config` 内 |

`apps/web/src/App.tsx` 仅改 2 行（导入 + 路由组件替换）。`ActivityConfigPlaceholder.tsx` 已删除。

### 未改动

`stubs.ts`、`packages/shared/`、`packages/allocation/`、`apps/api/src/db/migrations/`、
`role-guard.ts`、`csrf.ts`、`apps/api/src/app.ts`、`apps/api/package.json`。

## 验证

### 单元测试

```bash
npx vitest run --root apps/api
```

```
✓ src/routes/activities/config-roster.test.ts (20 tests)
✓ src/routes/activities/config-topics.test.ts (21 tests)
Test Files  2 passed (2)
     Tests  41 passed (41)
```

### 类型与构建

```bash
npx tsc -p apps/api/tsconfig.json --noEmit   # 通过
npm run build -w @coursematch/web            # 通过
```

### 接口端到端（PGlite + 真实 pg 驱动 + Fastify.inject）

活动与名单 **26/28 通过**；题目与发布 **26/26 通过**。
未通过的 2 条见下方「已知阻塞」，均由本 PR 范围外的问题导致。

活动与名单覆盖：创建草稿、版本冲突 409、编辑版本 +1、预览不写库、
坏 CSV 返回 `IMPORT_INVALID` + `rowErrors`、失败后旧名单完好、按班级/关键字筛选、
他人活动 404、发布后 `CONFIG_LOCKED`、发布后简介仍可改、非 CSV 415、未登录 404。

题目与发布覆盖：ALL / EXPLICIT 创建、EXPLICIT 空名单 400、capacity=0 400、
外来 participantId 400、列表与标签/关键字筛选、修改容量、ALL↔EXPLICIT 切换、
删除题目、草稿对学生 404、发布成功、发布后新增题目 409、学生视角不含限定名单、
重复发布 409。

### 浏览器手动验证（Edge 无头 + CDP 真实点击）

- 粘贴 CSV → 预览（新增 2 / 保留 2 / 移除 0，逐行标注）→ 确认替换 → 名单 4 人、v3→v4
- 坏 CSV → 3 条逐行错误，旧名单 4 人完好，「确认替换」保持禁用
- 新建题目（ALL）→ 列表出现，版本 +1
- 新建题目（EXPLICIT）→ 勾选学生 → 「限定 1 人」
- 发布前检查 5 项全绿 → 发布成功 → 题目区锁定、发布按钮禁用
- 作废：填原因 → 状态 VOID、版本 +1

## 已知阻塞（需要负责人处理，不在本 PR 范围）

### 1. `stubs.ts` 与本模块路由冲突（**阻塞启动**）

`stubs.ts` 注册了与本模块完全相同的 11 条路径，且已在 `app.ts` 中注册。
实测：

```
FST_ERR_DUPLICATED_ROUTE: Method 'POST' already declared for route '/api/activities'
```

**影响**：合并后服务无法启动。需要把 `stubs.ts` 改为只注册尚未实现的路径，
或按模块条件注册。`stubs.ts` 与 `app.ts` 不在 M2 允许改动范围内，本 PR 未改。

本地验证时我用了临时脚本（只注册 auth + 只读 + config 路由）绕开，该脚本未提交。

### 2. 缺少 `topic` 表迁移

题目 CRUD 与 publish 依赖两张新表。建议的迁移（请负责人确认后加入 `migrations/`）：

```sql
ALTER TABLE activity ADD COLUMN IF NOT EXISTS void_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE IF NOT EXISTS topic (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  capacity INT NOT NULL CHECK (capacity > 0),
  eligibility_mode TEXT NOT NULL DEFAULT 'ALL'
    CHECK (eligibility_mode IN ('ALL', 'EXPLICIT')),
  eligibility_description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_eligible_participant (
  topic_id UUID NOT NULL REFERENCES topic (id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participant (id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_activity ON topic (activity_id);
CREATE INDEX IF NOT EXISTS idx_topic_eligible_topic ON topic_eligible_participant (topic_id);
```

`void_at` / `void_reason` 是作废接口需要的，目前缺失导致 `POST .../void` 返回 500。

### 3. CSRF 保护未生效（**安全问题，与本 PR 无关但请优先处理**）

用真实 `buildApp()` 测试：

```
POST /api/auth/logout
Origin: http://evil.example.com
→ 200 {"data":{"loggedOut":true}}     # 期望 403 REQUEST_ORIGIN_FORBIDDEN
```

原因：`app.register(csrfPlugin)` 内 `addHook` 的作用域只覆盖插件内部注册的路由，
`authRoutes` 等注册在根作用域，钩子没盖到。修法是在根作用域 `app.addHook`，
或用 `fastify-plugin` 包装 `csrfPlugin`。

### 4. CSV 上传通道待定

契约写的是 `RosterInput { file: Blob }`（暗示 multipart），但 `apps/api/package.json`
没有 `@fastify/multipart`，且 `EdgeHttpFailure` 只定义了 `413 | 415`。

本 PR 实现为两种都支持：

- `Content-Type: text/csv` + 裸 body（当前可用）；
- `multipart/form-data` + `req.file()`（依赖装上后自动生效，未装时返回明确的 503）。

需要与负责人确认最终采用哪种，再收敛到一种。

## 风险

- 本 PR 新增 3 个后端文件与 8 个前端文件，但全部在任务卡允许的路径内。
- 题目相关接口在 `topic` 表落地前会返回 500（表不存在），前端展示为「待接入」。
- `allowedActions` 由本模块在写接口回包中计算，`read.ts`（只读接口）仍返回 `[]`，
  两处口径需要在负责人统一后收敛。
