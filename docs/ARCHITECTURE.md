# CourseMatch 共享架构

日期：2026-10-20。这是全组开发时要遵守的架构契约，不是任何一位成员的个人设计报告。个人设计报告由每人按自己负责的模块另行撰写，不要把本文改写成个人作业提交。

架构来源是个人设计报告 v0.5，也就是平台第二轮 98.6 分的那一版：同一技术栈、六个模块、27 条 API、一次主分配。类型文件采用这份架构后续收紧后的契约，开发以仓库里的类型为准。

仓库里还没有可运行的应用。本文和 `docs/contracts/api-contracts.ts` 只固定技术栈、模块边界和接口形状。

## 技术栈

全组只用这一套，不要另起 Vue、Java、Python 或第二套前端工程。

| 层 | 选型 |
|---|---|
| Web | React、Vite、TypeScript |
| 服务 | Node.js、TypeScript、Fastify，一个进程 |
| 数据 | PostgreSQL，一个共享库 |
| 接口 | JSON，路径前缀 `/api`，登录态用会话 Cookie |

浏览器不连接数据库，不判定资格，不抽签，不计算最终分配。页面上的按钮状态只是提示，授权以服务端为准。

## 首版做什么

```text
预置账号交给本人
  → 教师登录，创建活动草稿
  → 导入名单，配置题目、容量、资格、时间和规则
  → 名单内学生登录，保存 1～3 个有序志愿
  → 截止后拒绝写入，冻结完整输入和唯一序号
  → 教师执行一次主分配
  → 学生看本人结果，教师看汇总
  → 教师填写原因后关闭，历史只读
```

主分配成功之前，发现严重配置问题可以有原因作废。原活动只读，另建活动，学生重新提交，不迁移旧志愿。

首版不做：退选、补选、成功后改题目或改结果、公开注册、学校统一登录、邮件或短信、多套分配算法、AI 决定分配。未分配学生和剩余名额可以留下，不强制分题。

早期需求稿里的补选和激活码不再作为本轮开发任务。

## 六个模块

| 模块 | 谁来实现 | 负责什么 | 不负责什么 |
|---|---|---|---|
| M1 账号与会话 | 共同底座，负责人先交登录和会话 | 登录、退出、改密、会话撤销 | 开放注册、角色升级 |
| M2 活动与资格 | 石俊贤 | 草稿、五列 CSV 名单、题目、发布、作废，以及这些教师页 | 发布后改影响公平的字段；不做冻结和分配 |
| M3 志愿 | 刘家铭 | 题目浏览、热度、本人志愿整单保存、学生结果页 | 预占名额、产出最终结果、教师汇总 |
| M4 冻结与主分配 | 罗子超 | 完整快照、一次序号、纯算法、一次成功批次 | 重抽已成功的快照，或按学生顺序把三个志愿一次走完 |
| M5 结果与关闭 | 刘家铭写学生本人结果；罗子超写教师汇总、证据和关闭 | 本人解释、教师汇总、有原因关闭 | 补选入口、改已成功的批次 |
| M6 Web | 全组一个工程 | 路由、统一请求、错误展示 | 把本地未提交的表单当成已保存 |

石俊贤只做活动配置这一段。冻结、主分配、教师结果和关闭改由罗子超实现，并同时写这三段的测试。刘家铭只做学生从浏览到看到本人结果这一段。

## 三人本周任务

石俊贤：

- 活动草稿、题目、资格、容量和时间
- 五列 CSV 的预览和整份替换，失败时保留旧名单
- 发布和作废
- 对应的教师配置页

刘家铭：

- 学生浏览已发布题目和热度
- 保存 1～3 个有序志愿，失败不覆盖上一次有效提交
- 学生本人结果页：已分配、志愿全落选、未提交
- 序号和命中位次分开，页面上没有补选

罗子超：

- 截止后冻结完整快照，并为每人生成一次序号
- 主分配纯函数。验收样例：甲、乙各 1 个名额，A 得甲，C 得乙，B 未分配，D 未提交
- 同一输入再分配一次，返回原批次
- 教师结果汇总、证据和有原因关闭
- 为上述行为写测试，包括截止前接受、恰好截止拒绝、截止后拒绝

## 前端怎么接

全组只有一个 React 工程。

负责人维护目录、依赖、空路由、登录态和统一的 `/api` 请求入口。石俊贤做教师配置页，罗子超做冻结、分配和教师结果页，刘家铭做学生页。各自从 `master` 拉分支，用 Pull Request 交回。不要三人各做一个前端项目，最后再合并成一个网站。那样路由、Cookie、错误格式和页面结构会对不上，课程时间也不够再合并一次。

本提交还没有这个前端壳。在壳进入 `master` 之前，先按本文和类型契约实现各自的服务端规则与页面行为，不要新建第二个仓库。

## 分配规则

输入是一份完整冻结快照。先处理全体第一志愿，再处理还没分配的人的第二志愿、第三志愿。同一题、同一轮，先去掉资格不符的人，再按冻结序号从小到大取本轮开始时的剩余名额。已经分配的人不再进入后面的轮次。序号只在冻结时生成一次，算法本身不再随机。

固定样例：甲、乙各 1 个名额。A 序号 3，志愿 `[甲]`。B 序号 2，志愿 `[乙, 甲]`。C 序号 1，志愿 `[乙]`。D 序号 4，未提交。结果是 A 得甲，C 得乙，B 未分配，D 未提交。B 的序号更小，也不能用第二志愿挤掉 A 的第一志愿。

同一份成功快照再请求分配，返回原来的批次，不产生第二份结果。

## 接口

类型以 `docs/contracts/api-contracts.ts` 为准。成功响应是 `{ data, serverTime }`，失败响应是 `{ error: { code, message, fieldErrors?, rowErrors? }, serverTime }`。时间用带时区的 ISO 8601，页面显示北京时间。正文里的学号、角色和 owner 不能当作授权。

27 条路由：

| 方法与路径 | 谁可以调用 |
|---|---|
| POST /api/auth/login | 未登录 |
| GET /api/auth/me | 已登录 |
| POST /api/auth/logout | 已登录，重复调用无副作用 |
| PUT /api/auth/password | 本人，成功后全部会话失效并重新登录 |
| GET /api/activities | 教师看自己的活动；学生看名单内已发布及之后的历史 |
| POST /api/activities | 教师创建草稿 |
| GET /api/activities/:activityId | 活动拥有者，或名单内学生 |
| PATCH /api/activities/:activityId | 教师，带 expectedConfigVersion |
| GET /api/activities/:activityId/participants | 教师 |
| POST /api/activities/:activityId/participants/preview | 教师，草稿，只预览不写入 |
| PUT /api/activities/:activityId/participants | 教师，草稿，整份替换名单 |
| GET /api/activities/:activityId/topics | 教师或名单内学生 |
| POST /api/activities/:activityId/topics | 教师，草稿 |
| PATCH /api/activities/:activityId/topics/:topicId | 教师，草稿 |
| DELETE /api/activities/:activityId/topics/:topicId | 教师，草稿 |
| POST /api/activities/:activityId/publish | 教师，配置齐备才发布 |
| GET /api/activities/:activityId/preferences/me | 学生本人 |
| PUT /api/activities/:activityId/preferences/me | 学生本人，整单保存 |
| GET /api/activities/:activityId/preferences | 教师 |
| GET /api/activities/:activityId/freeze | 教师 |
| POST /api/activities/:activityId/freeze | 教师，仅已截止 |
| POST /api/activities/:activityId/allocation | 教师，须已有完整快照 |
| GET /api/activities/:activityId/results/me | 学生本人 |
| GET /api/activities/:activityId/results | 教师 |
| GET /api/activities/:activityId/evidence | 教师 |
| POST /api/activities/:activityId/void | 教师，已发布且尚未成功分配 |
| POST /api/activities/:activityId/close | 教师，已成功分配 |

错误码只用契约文件里的 `ErrorCode`。没有访问权时返回找不到资源，不透露活动是否存在。截止判定在取得该活动的锁之后读取数据库时钟，不用浏览器时间。

## 从仓库开始

```bash
git clone https://github.com/SilenVale/coursematch.git
cd coursematch
git switch master
git pull --ff-only
```

先读本文和 `docs/contracts/api-contracts.ts`，再从 `master` 建自己的分支。共享类型、依赖和数据库迁移要改时，先在 Pull Request 里说明。
