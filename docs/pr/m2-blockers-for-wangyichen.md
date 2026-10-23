# 给汪奕辰的消息（可直接复制到群里）

---

奕辰，M2（活动配置）的代码写完了，本地跑通了，但有 4 件事卡在你这边，其中第 1 条会让服务起不来，麻烦优先看一下。

分支 `feat/m2-activity-config`，11 个接口和教师配置页都实现了，41 条单测 + 接口端到端 + 浏览器手动验证都过了。

## 1. stubs.ts 重复路由，合并后服务起不来（最急）

`stubs.ts` 里注册了 M2 全部 11 条路径，我在 `config.ts` 里一注册就撞车：

```
FST_ERR_DUPLICATED_ROUTE: Method 'POST' already declared for route '/api/activities'
```

`config.ts` 顶部的注释写的是「在 stub 路由基础上替换实现」，看起来设计意图就是随模块落地逐步摘 stub。但 `stubs.ts` 和 `app.ts` 都是你的文件，我没动。

建议改成按模块注册，比如把 stub 拆成 `activityStubRoutesFor(module)` 或者在 `app.ts` 里按「谁实现了就注册谁的」来组装。你定方案，我配合改 `config.ts` 的导出形式。

我本地验证时是临时写了个脚本只注册 auth + 只读 + config 路由绕过去的，那个脚本没提交。

## 2. 缺 topic 表迁移

题目 CRUD 和 publish 都依赖它，现在表不存在会 500。建议的迁移我写在 `docs/pr/m2-activity-config.md` 里了，摘要：

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
```

`void_at` / `void_reason` 是作废接口要用的，契约里 `VoidView` 要回 `voidAt`，现在这两列没有，`POST .../void` 直接 500。

`topic_eligible_participant` 用 `participant_id` 而不是 `student_profile_id`，是因为契约里 `TopicInput.eligibleParticipantIds` 就是 `ParticipantView.participantId`。这里有个副作用要注意：名单整份替换后 `participant.id` 会变，旧的限定引用会悬空——我在 publish 的齐备性检查里加了兜底，遇到悬空会拒绝发布并提示重新指定。

## 3. CSRF 现在没生效（安全问题，跟 M2 无关但比较严重）

我用真实的 `buildApp()` 打了这个请求：

```
POST /api/auth/logout
Origin: http://evil.example.com
→ 200 {"data":{"loggedOut":true}}
```

期望是 403 `REQUEST_ORIGIN_FORBIDDEN`。

原因在 `app.ts`：

```ts
await app.register(csrfPlugin);   // 插件内 addHook 只作用于该插件作用域
await app.register(authRoutes);   // 这些路由在根作用域，钩子没盖到
```

Fastify 的 `register` 是封装的，插件里的 `addHook` 只对它内部注册的路由生效。两个修法：

- 把 `app.addHook("preHandler", ...)` 挪到根作用域（`csrfPlugin` 只导出 handler 函数）；或
- 用 `fastify-plugin` 包一层 `csrfPlugin`，让它「逃逸」出封装作用域。

这意味着现在任何人从任意站点都能带着受害者的 Cookie 发写请求。建议排在 stubs 之后、迁移之前处理。

## 4. CSV 上传通道定一个

契约是 `RosterInput { file: Blob }`，看着像 multipart；但 `apps/api/package.json` 没有 `@fastify/multipart`，而 `EdgeHttpFailure` 只定义了 `413 | 415`，又像是按「裸 body + 媒体类型校验」设计的。

我两种都支持了，现在不阻塞：

- `Content-Type: text/csv` + 裸 body —— 当前就能用，前端也走这条；
- `multipart/form-data` + `req.file()` —— 依赖装上后自动生效，没装时返回明确的 503 而不是崩。

你定一种，我再把另一条删掉、顺手把契约注释补上。

---

另外两个小口径问题，不急但最好统一：

- `read.ts` 的 `allowedActions` 恒为 `[]`，我在写接口回包里按 lifecycle 算了真实值。前端现在读的是写接口的回包，所以能用；但两个接口口径不一致，等你决定是统一放到 `read.ts` 还是单独抽个函数。
- `freezePreparation` / `resultPreparation` 我在回包里恒填 `PENDING`，这两个字段实际归罗子超。

---

## 我这边的验收状态

| 任务卡验收项 | 状态 |
|---|---|
| 创建草稿 → 编辑 → 上传/预览/替换名单 → 增删改题目 → 发布；可作废 | 本地已验证 |
| CSV 行错误返回 `IMPORT_INVALID`；失败不破坏已生效名单 | 已验证（含「先成功替换、再失败、旧名单仍在」） |
| 未齐备时不能发布（V1 优秀线 #5） | 已验证（无题目 400，缺名单 400） |
| 学生账号调本模块写接口为 403 `ROLE_FORBIDDEN` | **待联调**：依赖 `role-guard.ts`，且 stubs 冲突解决后才能整机验证 |
| 请求/响应字段与 `api-contracts` 一致 | 已验证（教师/学生两种 `TopicView` 分别返回） |

学生 403 那条我暂时没法给证据：`role-guard.ts` 的 `demoRoleCheck` 逻辑是有的，但因为 stubs 冲突服务起不来，整机跑不了。等第 1 条解决我补这条证据。
