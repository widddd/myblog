# Spec：更新页一键数据清理

- 日期：2026-09-06
- 提案人：AI
- 状态：用户已要求直接实施
- 修订：2026-10-01 补齐 `MomentVisibilityGroup`（09-27 新增）与 `PenName`（09-25 新增）——原清单一发布就落后于 schema，见 §2.2 / §6 与 P-103
- 相关红线：面板优先、SQLite 单写者、StorageDriver、严格确认、Windows 优先

## 1. 目标

在 `/admin/updates` 提供一个危险操作入口。用户只能从两个范围中选择，两个范围可以同时选择：

1. **删除数据**：删除除站点配置和管理员账号以外的应用数据。
2. **删除管理员账号**：删除全部 `AdminUser` 记录。

两项都选时，站点进入「无内容、无管理员」的恢复状态；站点配置仍保留。清理不会在请求到达时立即发生：服务端先发放一次性令牌，令牌生效时间至少为 15 秒之后；等待期间只能取消，不能通过直接调用 API 绕过等待。

## 2. 保留与删除边界

### 2.1 保留

- `Setting` 全部站点配置，包括站点名、COS 配置、首页外观与布局相关设置。
- `HomeModule` / `HomePlacement` 首页模块目录与布局配置。
- `data/backup-host-secret.json` 主机半钥；它不是内容数据，保留它才能在删除管理员后通过网页或 `pnpm setup` 补建账号并继续处理历史密钥体系。
- `data/update.log`、`data/relaunch.log` 等运维日志。
- 程序源码、依赖和 `.env`。

保留边界不是靠"记得别删"维持的：`lib/data-clear/coverage.ts` 把每张表显式登记成删除/保留/按条件删三档，`lib/data-clear/coverage.test.ts` 拿 `prisma/schema.prisma` 的全表去比对——**schema 里出现没登记的表，`pnpm test` 直接失败**（P-103）。

### 2.2 删除数据范围

- `Post`、`Category`、`Tag`、`PostTag`；
- `PenName`（笔名清单）：与分类/标签同级的内容词表，清空内容后留着没有意义。管理员账号上的**默认笔名** `AdminUser.penName` 属于账号，跟着「删除管理员账号」走，不在这一档；
- `Moment`、`MomentLike`；
- `MomentVisibilityGroup`（瞬间可见范围组）：与瞬间同属一批内容数据，一起清。注意外键 `SetNull` 只在**后台手动删组**时起作用；数据清理是先删瞬间再删组，不会留下引用；
- 全部 `Comment`（包括留言板、待审和管理员回复）；
- `Upload` 记录，以及 StorageDriver 列出的本地 `data/uploads` 文件和 COS 桶中的应用对象；同时按记录里的历史 key 再清一次，覆盖旧目录布局；
- 本地 `data/backups` 中的备份包、临时明文包、`backup-manifests.json`、`BackupSecret` 哈希；COS `backups/` 对象；
- `data/updates` 更新包及 sidecar、预约更新/恢复状态和更新结果索引；恢复安全快照也清理；
- 不删除正在使用的 SQLite `blog.db`、WAL/SHM 文件，只在事务中删除其内容表，以保持站点配置可继续使用。

「删除管理员账号」单独选择时只删除 `AdminUser`，不触碰上述内容、文件或备份。

## 3. 服务端协议

新增 `/api/admin/update/clear`（Node runtime，所有写请求仍由 `proxy.ts` + CSRF 保护）：

| 方法 | 请求 | 行为 |
|---|---|---|
| POST | `{targets:["data"|"admin"], confirmation, acknowledged:true}` | 校验唯一范围、精确确认短语和不可恢复确认；绑定当前管理员并返回一次性 `operationId`、服务端 `executeAt` 与 `serverNow` |
| PUT | `{operationId}` | 只有当前管理员、令牌未过期且服务端时间达到 `executeAt` 才执行；令牌先消费，防止重复执行 |
| DELETE | `{operationId}` | 令牌立即失效；清理未开始前可随时取消 |

确认短语按选择固定为：`删除数据`、`删除管理员账号`、`删除数据和管理员账号`。令牌只存在单进程内存，应用重启只会使待确认操作失效，不会自动执行删除。单实例运行约束与现有 SQLite 规则一致。

执行顺序为：检查备份互斥 → 读取需要清理的媒体 key → 通过 StorageDriver 删除文件/对象 → 清理备份、更新暂存及索引文件 → Prisma transaction 删除数据库记录。发出包含 `data` 的待确认令牌后，备份创建会被拒绝，避免倒计时期间生成清理之后仍残留的新备份；执行中的清理也占用单进程维护锁。跨文件系统/远端存储无法提供真正的分布式事务；任何存储错误都会阻止数据库删除并记录日志，已删除文件可安全重试。

## 4. 前端交互

- 更新页新增「危险操作 / 清空数据」入口；两个 checkbox 可同时勾选。
- 弹窗显示具体删除范围和不可恢复警告；必须输入精确短语并勾选确认框，才可开始等待。
- 等待区显示剩余秒数；底部红色进度条从满到空平滑倒计时。取消按钮、Escape、点击遮罩均使令牌失效。
- 倒计时由服务端 `executeAt` 校准，结束后自动发 PUT；前端倒计时只是提示，不是安全边界。
- 完成「删除管理员账号」后销毁当前 session；页面跳转 `/admin/setup`，已有主机半钥时直接显示仅重建管理员的表单（站点配置与备份口令保持不变），也可停服后在 `main/` 执行 `pnpm setup`。仅删除数据时刷新当前更新页。

## 5. 验收标准

- 未勾选范围、重复范围、错误短语、未勾选不可恢复确认均被拒绝。
- 提前 PUT 返回 409，DELETE 后 PUT 不能执行；令牌只能由创建它的管理员使用。
- 15 秒后 PUT 才能执行，重复 PUT 不会二次清理。
- 隔离数据库中验证所有内容表和媒体/备份/更新文件清理；`Setting`、首页模块、主机半钥仍在；只选管理员时其它数据不变。
- **覆盖守卫**（2026-10-01 增）：`pnpm test` 里的 `lib/data-clear/coverage.test.ts` 三方比对 schema 全表 / 覆盖清单 / `clearDatabase()` 里真实的 `deleteMany`。负向验证已做：清单里去掉 `PenName` → 失败；注释掉 `penName.deleteMany()` → 失败；恢复 → 3/3 通过。
- **隔离库 DB 级验证**：`scripts/verify-data-clear.ts` 在 scratch 库铺齐全表数据后调 `clearDatabase()`，7/7 通过（可见范围组 1 → 0、笔名 1 → 0；`Setting`/`HomeModule`/`HomePlacement` 含新写入的行原样保留；只删管理员时内容不动）。
- 运行 `pnpm test`、`pnpm lint`、`pnpm build`，并在 Windows 开发环境做 smoke test；不对真实生产数据执行清理。

## 6. 维护约束（新增表必看）

清理是**手写**的，新表不会自动被清——这正是 2026-10 那次「清空数据后可见范围组还在」的原因。新增 Prisma 模型后：

1. 在 `lib/data-clear/coverage.ts` 登记为「删除 / 保留 / 按条件删」，并写清理由；
2. 判为删除的，在 `lib/admin/data-clear.ts` 的 `clearDatabase()` 里按依赖顺序补 `deleteMany`（子表在前，`Comment` 先删回复，`MomentVisibilityGroup` 跟在 `Moment` 之后）；
3. 跑 `pnpm test`——漏登记、登记了没删都会失败（守卫用法见 P-103）。

要改「保留边界」，改的是 §2.1/§2.2 与这份清单，不要在代码里另开一条 if。
