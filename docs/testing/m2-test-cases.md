# M2 活动配置 · 测试用例表与验证记录

| 项目 | 内容 |
|---|---|
| 模块 | M2 活动与资格配置 |
| 提供人 | 石俊贤（M2 负责人） |
| 接收人 | 罗子超（测试与验收） |
| 代码版本 | `master` @ `ce72f68` |
| 执行时间 | 2026-10-23 |
| 结果 | **47 / 47 通过** |
| 对应需求 | FR-01、FR-02；AC-01、AC-05（资格）、AC-06（名额上限） |
| 对应优秀线 | V1 #3 服务端权威、#5 CSV 与发布、#6 契约一致 |

> 本文档供测试报告直接引用。所有「实际结果」均来自一次完整执行的真实输出，不是预期值回填。

---

## 一、测试范围与边界

### 已覆盖

| 范围 | 说明 |
|---|---|
| 活动生命周期前半段 | 草稿 → 已发布 → 已作废 |
| 参与名单 | 五列 CSV 解析、预览、整份替换、失败回滚 |
| 题目与资格 | CRUD、ALL / EXPLICIT、名额校验、限定名单归属校验 |
| 发布与锁定 | 齐备性检查、发布后字段锁定 |
| 权限与安全 | 角色守卫、归属校验、CSRF |
| 契约一致性 | 错误码、字段名、状态码 |

### 明确不在本表范围

| 范围 | 归属 |
|---|---|
| 志愿提交、学生本人结果 | M3 刘家铭 |
| 冻结、主分配、教师汇总、关闭 | M4/M5 罗子超 |
| 并发与性能 | 见第四节「未覆盖项」 |

---

## 二、测试环境与数据

### 环境

| 项 | 值 |
|---|---|
| 运行方式 | 真实 `buildApp()`（含 `app.ts` 全部插件与路由注册） |
| 数据库 | PostgreSQL 兼容引擎（PGlite，真实 pg 线协议） |
| 迁移 | `001_initial.sql` + `002_topic_and_void.sql` + `003_freeze_allocation.sql` 依序应用 |
| 请求方式 | Fastify `inject`（不经过网络，但走完整插件链：CORS → Cookie → CSRF → 会话 → 角色守卫） |
| 前端 | Edge 无头浏览器，CDP 真实点击 |
| 单元测试 | `npx vitest run --root apps/api`，41 条通过 |

### 测试数据

| 类别 | 数据 |
|---|---|
| 教师账号 | `teacher01`（活动拥有者）、`teacher02`（用于越权测试） |
| 学生账号 | `20260001` 演示学生甲，已开通登录账号 |
| 无账号学生 | `20260002` 演示学生乙、`20260003` 演示学生丙（仅有档案） |
| 标准名单 CSV | 三行五列，入学年 2026，专业软件工程，班级 1班/1班/2班 |
| 活动时间 | 开始 = 当前 +1 小时，截止 = 当前 +7 天 |

---

## 三、用例表

> 判定依据统一为：**HTTP 状态码 + 业务错误码 + 数据实际状态**（不只是页面提示）。
> 「异常用例」的通过条件同时检查「拒绝」与「未产生副作用」。

### 3.1 活动配置（TC-M2-001 ~ 008）

| 用例编号 | 用例名称 | 前置条件 | 输入 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|---|---|
| TC-M2-001 | 创建草稿成功 | 教师已登录 | 名称、说明、开始、截止、志愿数 3 | 200；`configVersion=0`；`lifecycle=DRAFT` | `code=200 v=0 DRAFT` | 通过 |
| TC-M2-002 | 截止时间早于开始时间 | 教师已登录 | 开始=+1天，截止=+1小时 | 400 `INVALID_INPUT`；`fieldErrors` 含 `deadlineAt`；不落库 | `code=400 INVALID_INPUT fields=deadlineAt` | 通过 |
| TC-M2-003 | 最大志愿数越界 | 教师已登录 | `maxPreferences=5` | 400 `INVALID_INPUT` | `code=400 INVALID_INPUT` | 通过 |
| TC-M2-004 | 活动名称为空白 | 教师已登录 | `title="   "` | 400；`fieldErrors` 含 `title` | `code=400 fields=title` | 通过 |
| TC-M2-005 | 版本冲突 | 活动当前 `configVersion=0` | PATCH 带 `expectedConfigVersion=99` | 409 `VERSION_CONFLICT` | `code=409 VERSION_CONFLICT` | 通过 |
| TC-M2-006 | 正常编辑并递增版本 | 活动 `configVersion=0` | PATCH 标题，版本 0 | 200；`configVersion=1` | `code=200 v=1` | 通过 |
| TC-M2-007 | PATCH 不含任何可改字段 | 活动存在 | 只传 `expectedConfigVersion` | 400 `INVALID_INPUT` | `code=400` | 通过 |
| TC-M2-008 | 他人活动访问 | `teacher02` 已登录 | 读取 `teacher01` 的活动名单 | 404 `RESOURCE_NOT_FOUND`（不透露存在） | `code=404 RESOURCE_NOT_FOUND` | 通过 |

### 3.2 参与名单与 CSV（TC-M2-009 ~ 021）

| 用例编号 | 用例名称 | 前置条件 | 输入 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|---|---|
| TC-M2-009 | CSV 某行列数不足 | 活动为草稿 | 第 2 行仅 2 列 | 400 `IMPORT_INVALID`；`rowErrors[0].code=COLUMN_COUNT` | `code=400 IMPORT_INVALID rowCode=COLUMN_COUNT` | 通过 |
| TC-M2-010 | CSV 姓名为空 | 活动为草稿 | 第 1 行姓名为空 | 400；`rowErrors[0].field=name` | `code=400 field=name` | 通过 |
| TC-M2-011 | CSV 入学年非四位 | 活动为草稿 | 入学年 `26` | 400；`rowErrors[0].code=INVALID_FORMAT` | `code=400 rowCode=INVALID_FORMAT` | 通过 |
| TC-M2-012 | 文件内学号重复 | 活动为草稿 | 同一学号出现两次 | 400；`rowErrors[0].code=DUPLICATE` | `code=400 rowCode=DUPLICATE` | 通过 |
| TC-M2-013 | 与已有学生档案冲突 | `20260001` 档案姓名为「演示学生甲」 | 文件写「错误姓名」 | 400；`rowErrors[0].code=PROFILE_MISMATCH`；不静默覆盖档案 | `code=400 rowCode=PROFILE_MISMATCH` | 通过 |
| TC-M2-014 | 非法导入后名单仍为空 | 名单为空 | 依次提交 5 份非法 CSV | `participant` 计数 = 0 | `count=0` | 通过 |
| TC-M2-015 | 预览不写库 | 名单为空 | 预览一份合法 3 人 CSV | 200；`addedCount=3`；`participant` 仍 = 0 | `code=200 added=3 count=0` | 通过 |
| TC-M2-016 | 整份替换成功 | 活动为草稿，版本 1 | 提交合法 3 人 CSV | 200；`participantCount=3`；版本 +1 | `code=200 count=3 v=2` | 通过 |
| TC-M2-017 | **成功后再次失败不破坏旧名单** | 名单已 3 人 | 提交含坏行的 CSV | 400；`participant` 仍 = 3 | `code=400 count=3` | 通过 |
| TC-M2-018 | 名单查询 | 名单 3 人 | GET participants | 200；3 条 | `code=200 count=3` | 通过 |
| TC-M2-019 | 按班级筛选 | 名单 3 人，1 人在 2班 | `className=2班` | 1 条 | `count=1` | 通过 |
| TC-M2-020 | 按姓名关键字搜索 | 名单 3 人 | `q=丙` | 1 条 | `count=1` | 通过 |
| TC-M2-021 | 账号开通状态区分 | 甲有账号，乙丙无 | 读取名单 | 甲 `accountConfigured=true`，乙 `false` | `[["20260001",true],["20260002",false],["20260003",false]]` | 通过 |

### 3.3 题目与资格（TC-M2-022 ~ 031）

| 用例编号 | 用例名称 | 前置条件 | 输入 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|---|---|
| TC-M2-022 | **未齐备不能发布**（无题目） | 名单 3 人，题目 0 个 | POST publish | 400；`fieldErrors` 含 `topics` | `code=400 fields=topics` | 通过 |
| TC-M2-023 | 创建题目（ALL） | 草稿 | 资格模式 ALL | 200；`eligibleParticipantIds=[]` | `code=200 ids=[]` | 通过 |
| TC-M2-024 | 创建题目（EXPLICIT） | 草稿 | 指定 1 名学生 | 200；限定名单 1 人 | `code=200 ids=1` | 通过 |
| TC-M2-025 | EXPLICIT 未指定学生 | 草稿 | `eligibleParticipantIds=[]` | 400 | `code=400` | 通过 |
| TC-M2-026 | 名额为 0 | 草稿 | `capacity=0` | 400（须正整数） | `code=400` | 通过 |
| TC-M2-027 | 限定名单含非本活动学生 | 草稿 | 不存在的 participantId | 400 | `code=400` | 通过 |
| TC-M2-028 | 按标签筛选题目 | 有标签「React」的题目 | `tag=React` | 1 条 | `count=1` | 通过 |
| TC-M2-029 | 修改题目名额 | 草稿 | PATCH `capacity=5` | 200；`capacity=5` | `code=200 cap=5` | 通过 |
| TC-M2-030 | EXPLICIT 改回 ALL | 草稿，题目为 EXPLICIT | PATCH `eligibilityMode=ALL` | 200；限定名单被清空 | `code=200 ids=0` | 通过 |
| TC-M2-031 | 删除题目 | 草稿，4 个题目 | DELETE | 200；版本 +1 | `code=200 v=8` | 通过 |

### 3.4 发布、锁定与作废（TC-M2-032 ~ 042）

| 用例编号 | 用例名称 | 前置条件 | 输入 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|---|---|
| TC-M2-032 | 学生看不到草稿活动题目 | 活动草稿，学生已登录 | GET topics | 404（草稿对学生不可见） | `code=404` | 通过 |
| TC-M2-033 | 齐备后发布成功 | 名单 3 人、题目 2 个 | POST publish | 200；`lifecycle=PUBLISHED` | `code=200 PUBLISHED` | 通过 |
| TC-M2-034 | 重复发布 | 已发布 | 再次 POST publish | 409 `CONFIG_LOCKED` | `code=409 CONFIG_LOCKED` | 通过 |
| TC-M2-035 | **发布后改标题被锁** | 已发布 | PATCH `title` | 409 `CONFIG_LOCKED` | `code=409 CONFIG_LOCKED` | 通过 |
| TC-M2-036 | 发布后改说明仍允许 | 已发布 | PATCH `description` | 200 | `code=200` | 通过 |
| TC-M2-037 | 发布后新增题目被拒 | 已发布 | POST topics | 409 | `code=409` | 通过 |
| TC-M2-038 | 发布后替换名单被拒 | 已发布 | PUT participants | 409 | `code=409` | 通过 |
| TC-M2-039 | 学生可见题目且不泄露限定名单 | 已发布 | 学生 GET topics | 200；每条无 `eligibleParticipantIds` 字段 | `code=200 leaked=false` | 通过 |
| TC-M2-040 | 草稿不能作废 | 新草稿活动 | POST void | 400 | `code=400` | 通过 |
| TC-M2-041 | 作废缺原因 | 已发布 | `reason="   "` | 400 | `code=400` | 通过 |
| TC-M2-042 | 已发布可作废 | 已发布 | 填写原因 | 200；`lifecycle=VOID`；返回 `voidAt` | `code=200 VOID voidAt=true` | 通过 |

### 3.5 权限与安全（TC-M2-043 ~ 047）

| 用例编号 | 用例名称 | 前置条件 | 输入 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|---|---|
| TC-M2-043 | **学生调用教师写接口** | 学生已登录 | POST /api/activities | 403 `ROLE_FORBIDDEN` | `code=403 ROLE_FORBIDDEN` | 通过 |
| TC-M2-044 | 学生调用作废 | 学生已登录 | POST void | 403 | `code=403` | 通过 |
| TC-M2-045 | 伪造 Origin 被拦截 | 教师会话 Cookie | `Origin: http://evil.example.com` | 403 `REQUEST_ORIGIN_FORBIDDEN` | `code=403 REQUEST_ORIGIN_FORBIDDEN` | 通过 |
| TC-M2-046 | 缺安全请求头 | 教师会话，Origin 正确 | 不带 `X-CourseMatch-Request` | 403 | `code=403` | 通过 |
| TC-M2-047 | 未登录访问 | 无会话 | GET 名单 | 401 或 404 | `code=404` | 通过 |

---

## 四、未覆盖项（据实说明，不作「已通过」）

| 编号 | 项 | 未覆盖原因 | 建议 |
|---|---|---|---|
| NC-01 | 并发替换名单 | 需要两个并发会话同时提交；当前验证手段不足 | 用两个浏览器窗口手动复现；或补写并发集成测试 |
| NC-02 | 5000 行名单上限的性能 | 未做压力测试 | 属 NFR-04 性能范畴，建议列入 V2 |
| NC-03 | 小程序/移动端浏览器兼容 | 未验证 | 若答辩需移动端演示需补测 |
| NC-04 | 题目标签数量与长度上限 | 已有单元测试覆盖（`TOO_MANY` / `TOO_LONG`），未纳入接口级用例 | 接口层已复用同一校验函数，风险低 |

---

## 五、缺陷记录规范（建议）

> 供测试模块沿用；与本表配套使用，便于缺陷闭环。

### 缺陷等级

| 等级 | 定义 | 示例 | 处理时限 |
|---|---|---|---|
| P0 阻塞 | 主链无法完成、数据损坏、越权可写 | 发布后仍能改名单；学生能创建活动 | 立即停止合并 |
| P1 严重 | 关键验收项不满足，但有工作绕过 | 坏 CSV 破坏了旧名单 | 本迭代内修复 |
| P2 一般 | 功能可用但反馈错误或状态不一致 | 错误码返回 500 而非契约码；列表不刷新 | 本迭代或下迭代 |
| P3 轻微 | 文案、样式、体验问题 | 按钮文案不统一 | 可延后 |

### 缺陷记录字段

| 字段 | 说明 |
|---|---|
| 编号 | `BUG-<模块>-<序号>`，如 `BUG-M2-003` |
| 关联用例 | TC-M2-xxx |
| 等级 | P0 ~ P3 |
| 环境 | 分支/commit、浏览器、数据库版本 |
| 复现步骤 | 可直接照做的 1/2/3 步 |
| 预期 vs 实际 | 含状态码、错误码、数据变化 |
| 证据 | 截图、接口响应体、SQL 查询结果 |
| 状态 | 新建 / 修复中 / 待验证 / 已关闭 |
| 回归用例 | 修复后必须复跑的用例编号 |

### 缺陷闭环规则

1. 每个缺陷必须关联至少一条用例；修复后必须复跑该用例并附新证据；
2. 等级调整必须写明理由，不得为赶进度降级；
3. P0/P1 缺陷关闭后才允许合并到 `master`。

---

## 六、已知的其他模块问题（与 M2 无关，但影响整体验收）

| 编号 | 现象 | 归属 | 建议等级 |
|---|---|---|---|
| EXT-01 | `npx tsc -p apps/api` 报 `results.ts:212` TS2352，API 无法构建 | M4/M5（PR #19） | P0（阻塞构建） |
| EXT-02 | `npm run build -w @coursematch/web` 报 `FreezeAllocationPage.tsx:24` TS2345，Web 无法构建 | M4/M5（PR #19） | P0（阻塞构建） |
| EXT-03 | 根 `npm test` 只跑 `packages/allocation`，不检查 API 类型，掩盖 EXT-01/02 | 共同底座 | P1 |

> 说明：EXT-01/02 会使 README 中的 `npm run build` 失败，影响 V1 优秀线 #1「干净环境按 README 启动」。建议在合并 M2 相关 PR 前修复。

---

## 七、复现方式

### 单元测试

```bash
npm install
npm run build -w @coursematch/shared
npm run build -w @coursematch/allocation
npx vitest run --root apps/api
```

预期：`Tests 41 passed (41)`。

### 接口用例

本表 47 条用例的执行脚本目前为临时脚本，未纳入仓库。原因：需要 PostgreSQL 实例，仓库尚未约定测试库方案。

**建议后续落点**（需负责人确认）：

- 方案 A：增加 `docker-compose.test.yml`，在 CI/本地用 `npm run test:api` 跑接口测试；
- 方案 B：用 `pglite` 作为嵌入式测试库，无需外部依赖，适合课程环境。

方案 B 更轻量，已在本轮验证中实际跑通（PGlite + 真实 pg 驱动 + 真实 `buildApp()`）。

---

## 八、前端界面验证记录

| 场景 | 操作 | 观察结果 | 结论 |
|---|---|---|---|
| CSV 预览 | 粘贴 4 行（2 新增 2 保留） | 显示「新增 2 / 保留 2 / 移除 0」，逐行标注变化；右侧当前名单仍为 2 人 | 通过 |
| 确认替换 | 点「确认替换」 | 名单 4 人，版本 v3→v4，绿色成功提示 | 通过 |
| 坏 CSV | 粘贴含 3 处错误的 CSV | 红色横幅 `IMPORT_INVALID` + 逐行表格；旧名单 4 人不变；「确认替换」禁用 | 通过 |
| 新建题目 | 填表提交 | 列表出现新题目，版本 +1 | 通过 |
| EXPLICIT 题目 | 勾选学生后提交 | 显示「限定 1 人」 | 通过 |
| 发布前检查 | 配置齐备后 | 五项全绿 → 发布成功 → 题目区锁定、发布按钮禁用 | 通过 |
| 作废 | 填原因后确认 | 状态变「已作废」，版本 +1 | 通过 |
| 路由守卫 | 教师访问 `/student/results` | 重定向回首页 | 通过 |
