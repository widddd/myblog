import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { BackupError } from "../src/lib/backup/errors";
import { listBackups, type BackupFileInfo } from "../src/lib/backup/files";
import { hostSecretExists } from "../src/lib/backup/host-secret";
import {
  requestPendingRestore,
  restoreFromBackup,
} from "../src/lib/backup/restore";

type Args = {
  file?: string;
  latest: boolean;
  yes: boolean;
  pending: boolean;
  listOnly: boolean;
  help: boolean;
  passphrase?: string;
  askPassphrase: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    latest: false,
    yes: false,
    pending: false,
    listOnly: false,
    help: false,
    askPassphrase: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--latest") {
      args.latest = true;
      continue;
    }
    if (token === "--yes" || token === "-y") {
      args.yes = true;
      continue;
    }
    if (token === "--pending") {
      args.pending = true;
      continue;
    }
    if (token === "--list") {
      args.listOnly = true;
      continue;
    }
    if (token === "--passphrase") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args.passphrase = next;
        i += 1;
      } else {
        args.askPassphrase = true;
      }
      continue;
    }
    if (token.startsWith("--passphrase=")) {
      args.passphrase = token.slice("--passphrase=".length);
      continue;
    }
    if (token === "--file" || token === "-f") {
      args.file = argv[i + 1];
      i += 1;
      continue;
    }
    if (!token.startsWith("-") && !args.file) {
      args.file = token;
    }
  }

  return args;
}

function printHelp() {
  console.log(`恢复 MyBlog 备份（须在 main/ 目录执行）

用法：
  pnpm restore --list
  pnpm restore --latest --yes
  pnpm restore --file myblog-YYYYMMDD-HHMMSS.tar.gz --yes
  pnpm restore --file myblog-YYYYMMDD-HHMMSS.tar.gz --pending
  pnpm restore --file myblog-YYYYMMDD-HHMMSS.tar.gz --passphrase --yes

说明：
  当场恢复必须先停止应用（开发：Ctrl+C 停掉 pnpm dev；生产：pm2 stop）。
  --pending 只预约，重启应用后会在连库之前自动恢复（仍需要本机主机半钥文件）。
  新备份（v2）加密时读 data/backup-host-secret.json，与包内半钥合成 DEK。
  非加密备份不需要口令，同样可以 --file / --latest 恢复。
  换机且没有半钥文件时用 --passphrase（可用包内盐再派生）。
  旧包（v1，含明文 key）仍可只读解密，但只拿文件就能解开。
  后台「备份」页的恢复按钮必须先登录管理员，并校验 DEK 哈希。`);
}

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function printFiles(files: BackupFileInfo[]) {
  if (files.length === 0) {
    console.log("还没有备份文件。请先在后台点「立即备份」，或等自动备份跑完。");
    return;
  }
  console.log("可用备份（新 → 旧）：");
  files.forEach((file, index) => {
    const when = new Date(file.createdAt).toLocaleString("zh-CN");
    console.log(`  ${index + 1}. ${file.name}  ${formatSize(file.size)}  ${when}`);
  });
}

async function pickFile(
  files: BackupFileInfo[],
  args: Args,
): Promise<string | null> {
  if (args.file) {
    return args.file;
  }
  if (args.latest) {
    return files[0]?.name ?? null;
  }
  if (!input.isTTY || !output.isTTY) {
    throw new BackupError(
      "VALIDATION_ERROR",
      "非交互环境请使用 --file <文件名> 或 --latest，并加上 --yes",
      400,
    );
  }

  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question("输入序号或完整文件名：")).trim();
    if (!answer) {
      return null;
    }
    const asIndex = Number.parseInt(answer, 10);
    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= files.length) {
      return files[asIndex - 1].name;
    }
    return answer;
  } finally {
    rl.close();
  }
}

async function confirm(args: Args, name: string, pending: boolean): Promise<boolean> {
  if (args.yes) {
    return true;
  }
  if (!input.isTTY || !output.isTTY) {
    throw new BackupError(
      "VALIDATION_ERROR",
      "非交互环境必须加上 --yes",
      400,
    );
  }
  const rl = createInterface({ input, output });
  try {
    const action = pending
      ? "预约恢复（重启后覆盖当前数据库和上传文件）"
      : "立即覆盖当前数据库和上传文件（请确认应用已停止）";
    const answer = (
      await rl.question(`确定${action}「${name}」？输入 yes 继续：`)
    )
      .trim()
      .toLowerCase();
    return answer === "yes" || answer === "y";
  } finally {
    rl.close();
  }
}

async function resolvePassphrase(args: Args): Promise<string | undefined> {
  if (args.passphrase) {
    return args.passphrase;
  }
  if (!args.askPassphrase) {
    return undefined;
  }
  if (!input.isTTY || !output.isTTY) {
    throw new BackupError(
      "VALIDATION_ERROR",
      "非交互环境请使用 --passphrase <口令>",
      400,
    );
  }
  const rl = createInterface({ input, output });
  try {
    output.write("（当前终端会显示输入内容，请注意周围环境）\n");
    const value = (await rl.question("备份口令：")).trim();
    if (!value) {
      throw new BackupError("VALIDATION_ERROR", "备份口令不能为空", 400);
    }
    return value;
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const files = await listBackups();
  if (args.listOnly) {
    printFiles(files);
    return;
  }
  if (files.length === 0) {
    printFiles(files);
    process.exitCode = 1;
    return;
  }

  printFiles(files);
  const name = await pickFile(files, args);
  if (!name) {
    console.error("未选择备份。");
    process.exitCode = 1;
    return;
  }

  if (!(await confirm(args, name, args.pending))) {
    console.log("已取消。");
    return;
  }

  const passphrase = await resolvePassphrase(args);
  if (args.pending) {
    if (passphrase) {
      console.log(
        "注意：--pending 不会保存口令。重启后仍需本机 data/backup-host-secret.json。换机请停服后直接 pnpm restore --passphrase，不要用 --pending。",
      );
    }
    const pending = await requestPendingRestore(name);
    console.log(
      `已预约恢复 ${pending.name}。请重启应用（开发：重新 pnpm dev；生产：pm2 restart）。`,
    );
    return;
  }

  if (!passphrase && !(await hostSecretExists())) {
    throw new BackupError(
      "HOST_SECRET_MISSING",
      "本机没有主机半钥。换机恢复请加上 --passphrase",
      409,
    );
  }

  const result = await restoreFromBackup(name, { passphrase });
  console.log(
    `已恢复 ${result.name}：写入 ${result.restoredUploads} 个上传文件，删除 ${result.removedUploads} 个多余文件。`,
  );
  console.log("请重新启动应用。");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (error instanceof BackupError && error.code === "DB_BUSY") {
    console.error(
      "开发：在运行 pnpm dev 的终端按 Ctrl+C。生产：pm2 stop <进程名>。停稳后再跑本命令，或改用 --pending 后重启。",
    );
  }
  process.exitCode = 1;
});
