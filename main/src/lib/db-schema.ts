/**
 * Prisma「模型还没到位」的统一出口。
 *
 * 为什么需要单独一个模块：模型没进 Prisma 客户端时，`prisma.<model>` 是 `undefined`，
 * 报错固定是 `Cannot read properties of undefined (reading 'findMany')`——既没说哪个模型，
 * 也没说该做什么。而「模型没到位」其实是两个**修法完全不同**的状态：
 *
 *   1. **进程里的客户端不认识模型**（本模块负责）：`prisma generate` 之后，已经在跑的进程
 *      不会换客户端实例。dev 下 PrismaClient 挂在 `globalThis`（见 `lib/db.ts`），热更新
 *      只会复用旧实例——**必须重启进程**，改代码救不了。
 *   2. **库里缺表**（Prisma P2021，本模块不拦）：迁移没应用。Prisma 自己的报错已经写明
 *      缺哪张表、哪个库，再包一层只会把原始信息弄丢。
 *
 * 纯函数：不 import prisma、不 import next，所以可以直接喂假客户端做单测
 * （见 `db-schema.test.ts`）。
 */

/** 模型未就绪：带 `code`/`status`，交给 `handleAdminError()` 原样转成 JSON 响应。 */
export class SchemaNotReadyError extends Error {
  readonly code = "SCHEMA_MISSING";
  readonly status = 500;

  constructor(message: string) {
    super(message);
    this.name = "SchemaNotReadyError";
  }
}

/**
 * 取 Prisma 模型委托；缺失时抛一句能照着做的错，而不是让调用方拿到 `undefined` 再崩。
 *
 * @param client PrismaClient（测试里可以是任意对象）
 * @param model  委托属性名，如 `staticPage`
 * @param advice 这个模型确实缺失时该怎么办（写清楚「重启 / generate / migrate」中的哪一步）
 */
export function requirePrismaModel<T>(
  client: unknown,
  model: string,
  advice: string,
): T {
  const delegate =
    client && typeof client === "object"
      ? (client as Record<string, unknown>)[model]
      : undefined;

  if (!delegate) {
    throw new SchemaNotReadyError(
      `Prisma 客户端里没有 ${model} 模型——当前进程持有的客户端实例早于 prisma generate` +
        `（dev 下 PrismaClient 是 globalThis 单例，热更新不会换实例）。${advice}`,
    );
  }

  return delegate as T;
}
