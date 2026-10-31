/**
 * Vitest 配置
 *
 * 集成测试（*.integration.test.ts）会连接真实 PostgreSQL，并在 beforeAll
 * 中清空业务表、插入固定 fixture（如 teacher01）。多个文件并行执行时会
 * 互相删数据、撞 account.identifier 唯一键，因此这里限制为单进程串行。
 *
 * 单元测试仍可正常并行，只是与集成测试同批运行时受此约束。
 * 依赖真实数据库的只有显式带 DATABASE_URL 的那一组。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 单线程执行：避免多个集成测试文件同时操作同一个数据库
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // 集成测试可能较慢（迁移 + 建库 fixture）
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
