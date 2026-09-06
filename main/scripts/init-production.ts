import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { BackupError } from "../src/lib/backup/errors";
import {
  createHostSecretFromPassphrase,
  hostSecretExists,
} from "../src/lib/backup/host-secret";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const EXAMPLE_PATH = path.resolve(process.cwd(), ".env.example");
const MIN_SECRET = 32;
const MIN_PASSWORD = 8;

function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    map.set(key, value);
  }
  return map;
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const line = `${key}="${escaped}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const prefix = content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  return `${prefix}${line}\n`;
}

function applyEnvMap(map: Map<string, string>) {
  for (const [key, value] of map) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function readEnvFile(): Promise<string> {
  try {
    return await readFile(ENV_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        return await readFile(EXAMPLE_PATH, "utf8");
      } catch {
        return 'DATABASE_URL="file:../data/blog.db"\n';
      }
    }
    throw error;
  }
}

async function writeEnvKey(content: string, key: string, value: string): Promise<string> {
  const next = upsertEnvLine(content, key, value);
  await writeFile(ENV_PATH, next, "utf8");
  process.env[key] = value;
  return next;
}

async function questionHidden(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string> {
  output.write(
    "（当前终端会显示输入内容，请注意周围环境）\n",
  );
  return (await rl.question(prompt)).trim();
}

async function askConfirmedSecret(
  rl: ReturnType<typeof createInterface>,
  label: string,
): Promise<string> {
  const first = await questionHidden(rl, `${label}：`);
  if (first.length < MIN_PASSWORD) {
    throw new BackupError(
      "VALIDATION_ERROR",
      `${label}至少 ${MIN_PASSWORD} 个字符`,
      400,
    );
  }
  const second = await questionHidden(rl, `再输入一次${label}：`);
  if (first !== second) {
    throw new BackupError("VALIDATION_ERROR", `两次输入的${label}不一致`, 400);
  }
  return first;
}

async function assertMainDirectory() {
  try {
    const raw = await readFile(path.resolve(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: string };
    if (parsed.name !== "main") {
      throw new Error("请在 main/ 目录执行 pnpm setup");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("pnpm setup")) {
      throw error;
    }
    throw new Error("请在 main/ 目录执行 pnpm setup");
  }
}

async function main() {
  await assertMainDirectory();

  let envContent = await readEnvFile();
  applyEnvMap(parseEnvFile(envContent));

  const { prisma } = await import("../src/lib/db");
  let adminCount = 0;
  let databaseReady = true;
  try {
    adminCount = await prisma.adminUser.count();
  } catch (error) {
    databaseReady = false;
    console.error("数据库未就绪。请先执行：pnpm prisma migrate deploy");
    console.error(error instanceof Error ? error.message : String(error));
  }

  const secretReady = await hostSecretExists();
  if (secretReady && adminCount > 0) {
    console.log("已经初始化：管理员与备份口令均已设定。备份口令不可更改。");
    process.exitCode = 1;
    await prisma.$disconnect().catch(() => undefined);
    return;
  }

  const currentSecret = process.env.SESSION_SECRET?.trim() ?? "";
  const secretLooksPlaceholder = /replace-with|changeme|your-secret/i.test(currentSecret);
  if (currentSecret.length < MIN_SECRET || secretLooksPlaceholder) {
    const generated = randomBytes(32).toString("hex");
    envContent = await writeEnvKey(envContent, "SESSION_SECRET", generated);
    console.log("已生成 SESSION_SECRET 并写入 .env（不会提交到仓库）。");
  }

  if (!input.isTTY || !output.isTTY) {
    throw new BackupError(
      "VALIDATION_ERROR",
      "pnpm setup 必须在交互终端中运行，全部项目都要手动输入，没有默认值",
      400,
    );
  }

  const rl = createInterface({ input, output });
  let wroteAdmin = false;
  let wroteSecret = false;
  try {
    if (adminCount === 0 && !secretReady) {
      const siteName = (await rl.question("站点名称：")).trim();
      if (!siteName) {
        throw new BackupError("VALIDATION_ERROR", "站点名称不能为空", 400);
      }
      const siteUrl = (await rl.question("站点地址（选填，https://example.com）：")).trim();
      const subtitle = (await rl.question("首页副标题（选填）：")).trim();
      const username = (await rl.question("管理员用户名：")).trim();
      if (!username) {
        throw new BackupError("VALIDATION_ERROR", "管理员用户名不能为空", 400);
      }
      const adminPassword = await askConfirmedSecret(rl, "管理员密码");
      const passphrase = await askConfirmedSecret(rl, "备份口令");
      const { runInitialSetup } = await import("../src/lib/auth/initial-setup");
      await runInitialSetup({
        siteName,
        siteUrl,
        subtitle,
        username,
        password: adminPassword,
        passwordConfirm: adminPassword,
        passphrase,
        passphraseConfirm: passphrase,
      });
      wroteAdmin = true;
      wroteSecret = true;
      console.log("管理员、站点名称与备份半钥已设定。");
    } else {
      if (adminCount === 0) {
        if (!databaseReady) {
          throw new BackupError(
            "VALIDATION_ERROR",
            "数据库未就绪，无法创建管理员。请先 pnpm prisma migrate deploy 再重新执行 pnpm setup",
            400,
          );
        }
        const username = (await rl.question("管理员用户名：")).trim();
        if (!username) {
          throw new BackupError("VALIDATION_ERROR", "管理员用户名不能为空", 400);
        }
        const adminPassword = await askConfirmedSecret(rl, "管理员密码");
        const { hashPassword } = await import("../src/lib/auth/password");
        await prisma.adminUser.create({
          data: {
            username,
            passwordHash: await hashPassword(adminPassword),
            mustChangeCredentials: false,
          },
        });
        wroteAdmin = true;
        console.log("管理员已写入数据库。");
      } else {
        console.log("管理员已存在，跳过账号设定。");
      }

      if (secretReady) {
        console.log("备份口令已设定，不可更改。");
      } else {
        const passphrase = await askConfirmedSecret(rl, "备份口令");
        await createHostSecretFromPassphrase(passphrase);
        wroteSecret = true;
        console.log("主机半钥已写入 data/backup-host-secret.json（不要打进备份包、不要提交仓库）。");
      }
    }
  } finally {
    rl.close();
    await prisma.$disconnect().catch(() => undefined);
  }

  console.log("");
  console.log("初始化完成：");
  console.log(wroteAdmin || adminCount > 0 ? "  - 管理员已设定" : "  - 管理员未设定");
  console.log(wroteSecret || secretReady ? "  - 备份半钥已设定（口令不可再改）" : "  - 备份半钥未设定");
  console.log("下一步：pnpm dev 或 pnpm build");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
