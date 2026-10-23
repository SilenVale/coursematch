import { pool } from "./pool.js";
import { seedLegacyTeacher01Fixture } from "./seed-legacy-full.js";
import { seedReadyFixture } from "./seed-ready-fixture.js";
import {
  clearAllSeedData,
  DEV_PASSWORD,
  hashDevPassword,
  seedAccounts,
} from "./seed-shared.js";

type SeedMode = "accounts" | "ready" | "full";

function resolveSeedMode(): SeedMode {
  const raw = (process.env.SEED_MODE ?? "accounts").toLowerCase();
  if (raw === "ready" || raw === "full") return raw;
  return "accounts";
}

async function main() {
  const mode = resolveSeedMode();
  const passwordHash = await hashDevPassword();

  await clearAllSeedData(pool);
  const accounts = await seedAccounts(pool, passwordHash);

  if (mode === "ready" || mode === "full") {
    await seedReadyFixture(pool, accounts);
  }
  if (mode === "full") {
    await seedLegacyTeacher01Fixture(pool, accounts);
  }

  console.log("Seed complete. SEED_MODE =", mode);
  console.log("Password for all demo accounts:", DEV_PASSWORD);
  console.log("  teacher_blank  — 空教师，无选课任务");
  console.log("  teacher_ready  — 已配置两条选课任务");
  console.log("  teacher01      —", mode === "full" ? "含原三条示例活动" : "无预置选课任务");
  console.log("  20260001, 20260002 — 学生");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
