# 罗子超 · M4/M5 测试报告与使用建议

测试日期：2026-10-24

测试基线：`master` / `e0088f1925518acc7a69eb3ca99eefd8853f7044`

测试范围：冻结快照、lottery、主分配、边界与幂等、教师结果与学生「我的结果」一致性。
明确未重复：M2 配置/发布/名单全流程、学生志愿填报主流程、HTTPS 部署全流程。

## 1. 环境与方法

- Node.js `v24.15.0`，npm `11.12.1`，Windows。
- 本机无 Docker，无法启动真实 PostgreSQL 容器。因此未把 UI 截图或真实 PostgreSQL 操作虚报为已完成。
- 自动测试使用 Vitest；新增的 API 集成测试使用免费 `pg-mem`，并真实执行 `001`～`004` 四份 SQL 迁移后调用 Fastify 路由。
- Render Dev 与本地不是同一份业务数据，本报告没有用 Dev 上他人活动替代本地确定性用例。

## 2. 测试方案一：纯算法确定性与轮次优先

对应文件：`packages/allocation/src/calculate.test.ts`。

### 2.1 最小 lottery 冲突场

条件：同一题目容量 1，两名学生都把它填为第一志愿；输入数组中 lottery=2 的学生排在 lottery=1 的学生之前。

| 学生 | lottery | 志愿 | 期望 |
|---|---:|---|---|
| earlier-in-lottery | 1 | 甲 | ASSIGNED，命中第 1 志愿 |
| later-in-lottery | 2 | 甲 | UNALLOCATED |

通过标准：只能由 lottery=1 的学生获得甲，证明结果不依赖参与者输入顺序。

### 2.2 混合提交场

甲容量 1、乙容量 2。

| 学生 | lottery | 志愿 | 期望 |
|---|---:|---|---|
| A | 4 | 甲、乙 | UNALLOCATED |
| B | 2 | 甲 | 甲，第 1 志愿 |
| C | 1 | 乙 | 乙，第 1 志愿 |
| D | 3 | 甲、乙 | 乙，第 2 志愿 |
| E | 5 | 未提交 | NOT_SUBMITTED |

通过标准：先完成全部第一志愿，再处理第二志愿；最终甲 1/1、乙 2/2；落选与未提交状态分开。

原有 A/B/C/D 固定样例及相同输入重复计算完全一致的用例继续保留。

## 3. 测试方案二：冻结—分配—结果 API 集成

对应文件：`apps/api/src/routes/activities/freeze-allocation.integration.test.ts`。

测试夹具包含 4 名参与者、2 个题目、3 份志愿和 1 名未提交者。测试直接注册生产路由，不在测试里复制分配逻辑。

### 3.1 边界与权限

| 操作 | 期望 | 结果 |
|---|---|---|
| 截止前 `POST .../freeze` | 409 `NOT_STARTED` | 通过 |
| 无 READY 快照 `POST .../allocation` | 409 `FREEZE_REQUIRED` | 通过 |
| 学生 `POST .../freeze` | 403 `ROLE_FORBIDDEN` | 通过 |
| 学生 `POST .../allocation` | 403 `ROLE_FORBIDDEN` | 通过 |

### 3.2 冻结完整性与幂等

- 快照包含 4 名参与者、2 个题目、3 份有效提交。
- lottery 集合恰为 `{1,2,3,4}`，无 0、无重复、无缺号。
- 重复冻结返回同一 `snapshotId`。
- 首次分配统计为：ASSIGNED=2、UNALLOCATED=1、NOT_SUBMITTED=1。
- 根据冻结 lottery 独立推导乙题赢家，教师结果与推导一致。
- 重复分配返回同一 `batchId`，数据库中仍只有一个主批次。

### 3.3 师生结果一致性与证据

- 分别以两名学生身份读取 `GET .../results/me`。
- 与教师 `GET .../results` 对应行逐字段比较：`status`、`topicId`、`matchedRank`、`lotteryNumber`、`rounds` 均一致。
- `GET .../evidence` 中 snapshot、batch 与教师结果返回的 ID 相同，并包含成功的 `ALLOCATE_ACTIVITY` 操作记录。

## 4. 命令与结果证据

```text
npm test

packages/allocation: 4 tests passed
apps/api: 55 tests passed, 47 skipped
新增 M4/M5 集成测试: 3 tests passed
```

其中 47 条 skipped 是原有 `config.integration.test.ts` 的真实 PostgreSQL 集成用例；本机没有 `DATABASE_URL`，与 M4/M5 新增内存集成用例无关。

```text
npm run build

@coursematch/shared     passed
@coursematch/allocation passed
@coursematch/api        passed
@coursematch/web        passed
```

## 5. 使用建议与问题清单

### P1：轮次解释可能与权威分配结果矛盾（已复现，必须修复）

> **后续：** 已修复；回归见 `apps/api/src/routes/activities/allocation-bridge.test.ts`。

位置：`apps/api/src/routes/activities/allocation-bridge.ts` 的 `buildPersonalRounds`。

复现场景：甲、乙各容量 1；A(lottery=1) 第一志愿乙，C(lottery=2) 第一志愿甲，B(lottery=3) 志愿为甲、乙。

- 权威主分配：A→乙、C→甲、B→UNALLOCATED。
- 当前 B 的轮次说明：第 1 轮甲为 `OUTRANKED`，第 2 轮乙却显示 `ASSIGNED`，且 `availableAtRoundStart=1`。
- 正确说明：乙已在第一轮分给 A；B 第二轮应为 `CAPACITY_FULL`，可用名额应为 0。

原因：解释生成器每轮只更新“当前学生该轮所选题目”的候选组，没有完整回放同轮其他题目的分配，导致跨题目的剩余名额与已分配集合失真。

建议：让主分配纯函数同时产出每位学生的轮次轨迹，或抽出一个全局 round trace，主结果与解释共用同一次状态推进；修复后加入上述回归用例。修复前不要把 `rounds` 作为申诉裁决的唯一依据。

### P2：并发重复冻结/分配的幂等尚未验证（风险，建议补测）

当前顺序重复请求已通过，但路由在事务外先查询 existing snapshot/batch。两个真正并发的首次请求可能同时通过前置查询，随后一个请求触发唯一约束并返回 500。

建议：增加两请求并发测试；服务端使用锁、原子插入或捕获唯一冲突后返回已有 `snapshotId`/`batchId`，使并发语义也满足幂等。

### P3：建议提高证据可读性（可选优化）

教师页面除 ID 外，可直接显示“冻结参与人数、有效提交数、题目数、各状态人数”，并提供 JSON 导出。这样教师复核不需要从长 JSON 中人工计数，但导出数据仍应限制为教师本人活动。

## 6. 结论

- 冻结完整性、lottery 唯一性、主分配结果、顺序幂等、边界拒绝、权限拒绝、师生结果字段一致性均通过自动验证。
- 截止与冻结项可以勾选通过。
- 分配最终去向符合 `ALLOCATION.md`；P1 轮次解释已修复并加回归测试，V1 #2 可勾选。
- 未执行真实 PostgreSQL + 浏览器 UI 流程，原因是本机无 Docker；该限制已明确记录，未伪造截图或人工结论。
