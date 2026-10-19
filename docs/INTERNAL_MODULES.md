# 内部模块与代码入口

与 `docs/ARCHITECTURE.md` 六个模块对应。改共享边界前先开 Pull Request。

| 模块 | 服务端目录 | 前端目录 |
|---|---|---|
| M1 账号与会话 | `apps/api/src/auth/` | `apps/web/src/pages/Login.tsx`、`apps/web/src/api/client.ts` |
| M2 活动配置 | `apps/api/src/routes/activities/config.ts` | `apps/web/src/pages/teacher/ActivityConfigPlaceholder.tsx` |
| M3 志愿 | `apps/api/src/routes/activities/preferences.ts` | `apps/web/src/pages/student/PreferencesPlaceholder.tsx` |
| M4 冻结与分配 | `apps/api/src/routes/activities/freeze-allocation.ts`、`packages/allocation/` | `apps/web/src/pages/teacher/FreezeAllocationPlaceholder.tsx` |
| M5 结果与关闭 | `apps/api/src/routes/activities/results.ts` | 学生：`student/ResultsPlaceholder.tsx`；教师：同上 Freeze 页旁结果区 |
| M6 Web 壳 | `apps/api/src/app.ts` | `apps/web/src/App.tsx`、`apps/web/src/layouts/` |

共同底座已实现：迁移、种子账号、登录会话、活动列表只读、未实现路由返回明确错误。业务路由在各自文件内补全，不要新建第二套 API 前缀。
