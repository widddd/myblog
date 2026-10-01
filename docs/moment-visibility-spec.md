# Spec：瞬间可见范围（全局可见期 + 可见范围组）

- 日期：2026-09
- 提案人：AI
- 状态：已实施（文档已同步；**开发库迁移已于 2026-09-30 应用**；生产目标机首次部署前仍需执行一次迁移）
- 相关红线：面板优先（§2.9）、复用优先、SQL 全部走 Prisma、文档同步
- 相关坑：P-094（where 里别加外键"兜底支"）、P-095（`OR: [{}]` / `OR: []` 不是恒真）、P-096（分组分支必须乘全局上限）

## 1. 目标

- 给瞬间加**对外可见期**：发布满 N 天之后，前台首页、瞬间页、点赞、评论都按「不存在」处理；**后台仍完整保留内容、评论与点赞**。
- 两级配置，规则一条就够：**最终对外可见天数 = min(全局可见期, 该瞬间所用组的天数)**，其中 **0 = 不限制**。
  - 全局是整站天花板（Setting `momentVisibleDays`）；
  - 可见范围组是发瞬间时能直接选的档位（3 天 / 7 天 / 1 个月…），**只能更短，不能放宽**；
  - 未分组（或组被删除 → SetNull）只受全局约束。
- 默认值 `0` = 永久公开 = **与旧行为完全等价**，不升级就等于没变化。
- 不做成 CLI / 环境变量：全部在后台「瞬间」页操作（面板优先）。

## 2. 设计方案

### 2.1 规则收口在一个纯函数文件

`src/lib/moments/visibility.ts` 是**唯一裁决点**（无 prisma）：

| 导出 | 作用 |
|---|---|
| `normalizeVisibilityDays()` | 脏值/越界一律回退 0（不限制），不抛错 |
| `resolveMomentVisibilityDays()` | `min(全局, 组)`，0 视为 ∞ |
| `resolveMomentVisibility()` | 规则层判定 + `limitedBy: global / group / none`（说清是谁在收紧） |
| `describeMomentVisibility()` | 加发布时间 → **到期时刻 = 发布时间 + 生效天数**（不看"读取时刻"，否则每次刷新都变）+ `expired` |
| `momentVisibilityDaysLabel()` / `momentVisibilityPhrase()` / `formatMomentExpiry()` | 「永久公开 / 1 个月 / 1 年」与「3 天（三天可见组）」「7 天（全局收紧，组为 1 年）」；到期给绝对时间，不退回"3 天前" |
| `buildMomentVisibilityFilter()` | **公开查询的唯一 where 来源**（详见 §2.2） |
| `toVisibilityRuleLookup()` | 组信息表，避免逐条瞬间查库 |

### 2.2 公开查询只有一个 where 来源

`buildMomentVisibilityFilter()` 的输出被五个入口共用：`listPublicMoments()`（列表 + 总数）、`listHomeMoments()`（首页模块）、`findVisibleMomentId()`（点赞 + 评论写入校验）。

条件形状（`cutoff = now - 天数`）：

```
全局 0 且无分组        → undefined（不带条件，Prisma 视作不过滤）
只有全局               → OR: [ { createdAt >= 全局 cutoff } ]
有分组                 → OR: [ { visibilityGroupId: null, ...全局窗口 }, 每个组一支 { visibilityGroupId: id, createdAt >= max(全局 cutoff, 组 cutoff) } ]
```

两条实现约束（都踩过，见 §6 与 pitfalls）：

1. **不写 `visibilityGroupId: { notIn: [...] }` 兜底支** —— 外键 `ON DELETE SET NULL` 已保证孤儿 id 不存在，多这一支会让 Prisma 把整条 OR 组合算错（P-094）；
2. **不带条件必须返回 `undefined`**，不能返回 `OR: [{}]` / `OR: []`（Prisma 不当恒真处理，会返回空集合 → 整站瞬间全不可见，P-095）；调用方写 `where: undefined`。

### 2.3 数据模型

- `Moment.visibilityGroupId Int?` → `MomentVisibilityGroup`，`onDelete: SetNull`；加索引。
- 新表 `MomentVisibilityGroup`：`id` / `name`（唯一，≤12 字）/ `days`（1–3650）/ `createdAt`。
- 迁移 `prisma/migrations/20260927160000_moment_visibility_group/migration.sql`。
  ⚠️ **SQLite 不支持 `ALTER TABLE ... ADD CONSTRAINT`**，外键必须内联在 `ADD COLUMN` 上（migrate dev 的影子库走「空库 → 应用 migrations」，只认内联 REFERENCES）。

### 2.4 配置

Setting `momentVisibleDays`：默认 `0`（永久公开），范围 `0–3650`。三处同步点：

| 位置 | 内容 |
|---|---|
| `lib/settings.ts` | `DEFAULT_SETTINGS`、`AdminSettings` 类型、`getAdminSettings()` 归一 |
| `lib/validation/settings.ts` | `WRITABLE_SETTING_KEYS`、`settingsPutSchema` |
| 后台瞬间页 | `MomentVisibilityPanel` 读写（面板优先，不进设置页表单） |

### 2.5 后台 UI（`/admin/moments` = 发布区 + 折叠的瞬间管理）

页面两块：**发布区**（输入框 → 一行操作条：插入图片图标按钮 · 可见范围 · 发布）+ 其下方**默认折叠的「瞬间管理」**。其它设置一律收进抽屉与卡片，不再平铺。

| 组件 | 职责 |
|---|---|
| `MomentCompose.tsx` | 发布区本体：自动长高的 textarea + 操作条 + 提交。图片已选时在输入框下方渲染 `SortableImageGrid`（**Pointer Events 拖动排序**，手机/桌面同一套；图片用稳定 id，拖动不会重新加载，见 P-102）；图片区限宽 520px（单张 300px），不铺满整行。 |
| `MomentImageButton.tsx` | **纯图标**按钮（`ImageIcon`，无文字，aria-label 为「插入图片（已选 n/9）」），右下角小徽标显示已选张数；点开小卡片：从本地上传 / 从媒体库选择（媒体库复用 `MediaLibraryPicker`）。 |
| `MomentScopePicker.tsx` | 可见范围按钮（显示当前值，点开小卡片）：跟随全局设置 + 各可见范围组（每条带「实际生效 N 天」），底部「详细设置」→ 打开右侧抽屉；卡片底部另有「生效可见期」说明。 |
| `MomentSettingsDrawer.tsx` | **从画面右侧展开**的抽屉（`motion` + portal 到 body）：全局可见期（`MomentVisibilityPanel`）+ 可见范围组管理（`MomentVisibilityGroups`）。 |
| `MomentVisibilityPanel.tsx` | 全局可见期：永久 / 按天数（3·7·15·30·90·180·365）/ 自定义 1–3650。**改档位即保存**（抽屉里没有"保存"按钮的位置），下方一行显示「已保存 / 保存中 / 自定义天数提示」；预览文案由服务端预计算成 `previewLabels` 下发（见 P-098）。 |
| `MomentVisibilityGroups.tsx` | 组的增删；删除前先 `GET /api/admin/moment-groups/[id]` 拿预览，二次确认写明影响几条瞬间、之后按什么规则显示。 |
| `MomentAdminList.tsx` | 折叠卡「瞬间管理」里的列表（`AdminSection defaultOpen={false}`，摘要行显示「共 N 条」）：每条显示内容、发布时间、生效可见期、到期时刻、剩余时间、「已过期 · 前台已隐藏」徽章，可逐条改可见范围或删除；10 条一页（`?page=`），**翻页后自动展开**（否则折叠状态下点「下一页」看着像没反应）。行数据由 `lib/moments/admin-list-view.ts` 在服务端算好。 |

**已从页面移除**：可见范围平铺区块、独立「发布新瞬间」区块标题、「我的动态」列表整块（按用户要求）。`MomentForm.tsx`（平行表单）已删除，避免没人引用的死代码；瞬间的删除/改可见范围接口（`/api/admin/moments/[id]`）保留。
**2026-10 回归**：`MomentAdminList.tsx` 曾随同一次改版被删，现按用户要求以**默认折叠的「瞬间管理」卡**形式回到发布区下方（列表要管理，但不能一进页面就铺满屏）。

CSS 只加在 `src/app/admin/admin.css`：`.admin-section__divider`、`.moment-visibility` / `.moment-visibility__custom`、`.moment-group-list` / `.moment-group` / `.moment-group__name` / `.moment-group__spacer` / `.moment-group-create`、`.moment-admin__controls`（只补布局，颜色/圆角沿用 `.admin-chip` / `.admin-field` / `.admin-badge`）。

### 2.6 数据流

```
后台写：/admin/moments（面板 / 分组 / 列表 / 发布表单）
        → /api/admin/settings（momentVisibleDays）
        → /api/admin/moment-groups[...]（组 CRUD）
        → POST|PATCH /api/admin/moments（visibilityGroupId，null = 跟随全局）
        → 写库后 revalidatePublicContent()
公开读：公开查询 → loadMomentVisibilityContext()（全局天数 + 所有组，一次取全）
        → buildMomentVisibilityFilter() → where 喂给列表 / 总数 / 首页模块 / 点赞 / 评论写入
```

## 3. 影响面分析

- **涉及模块**：`lib/settings.ts`、`lib/validation/settings.ts`、`lib/validation/post.ts`、`lib/moments/*`（admin / query / visibility / visibility-groups / visibility-group-view）、`lib/validation/moment-visibility.ts`、`lib/comments/service.ts`（目标瞬间可见性校验，**读与写两侧**）、`components/admin/Moment*`、`app/admin/(protected)/moments/page.tsx`、`app/api/admin/moment-groups/*`、`app/api/admin/moments/*`、`prisma/schema.prisma`；配套脚本 `scripts/verify-moment-visibility.ts`、`scripts/check-admin-classes.mjs`。
- **新增配置字段**：`momentVisibleDays`（三处同步，见 §2.4）。
- **是否破坏红线**：不破坏。新增查询全部 Prisma 参数化；后台样式只进 `admin.css`（未重定义前台类）；无新依赖；后台面板可完成全部配置（面板优先）。
- **是否新增依赖**：无。
- **对新装/老站的影响**：默认 0 = 旧行为；老站不建组、不改全局，前台输出与升级前一致。

## 4. 输入输出边界

### 4.1 新增路由

| 方法 | 路径 | 请求 | 响应/行为 |
|---|---|---|---|
| GET | `/api/admin/moment-groups` | — | `{globalDays, groups:[{id,name,days,daysLabel,effectiveDays,effectiveLabel,cappedByGlobal}]}` |
| POST | `/api/admin/moment-groups` | `{name,days}` | 201，返回同上视图；**重名 409** |
| GET | `/api/admin/moment-groups/[id]` | — | **删除前预览** `{id,name,days,affectedMoments,globalDays,globalLimited,fallbackNote}` |
| PATCH | `/api/admin/moment-groups/[id]` | `{name?,days?}`（至少一项） | 更新后返回列表视图；空对象 400；重名 409 |
| DELETE | `/api/admin/moment-groups/[id]` | — | 删除组；**不删瞬间**，用它的瞬间 `SetNull` 回落全局规则 |

### 4.2 修改的接口

- `POST /api/admin/moments`：新增可选 `visibilityGroupId`（`null` / 省略 = 跟随全局；组不存在 404）。
- `PATCH /api/admin/moments/[id]`：同上；**部分更新语义 —— 显式改回全局必须传 `null`**（不传 = 不动）。
- `GET /api/admin/moments`：每行新增 `visibility` 与 `visibilityText`。
- 公开侧签名不变，只多一层可见期过滤：`GET /api/moments`（只回未过期）、`POST /api/moments/[id]/like`（过期 404）、`POST /api/comments`（目标瞬间不在可见期内 404）、`GET /api/comments`（目标瞬间不在可见期内返回空列表 `{data:[],total:0}`）。**读与写两侧都挡**：不依赖"前台不会再渲染隐藏瞬间的入口"。

### 4.3 数据模型变化

见 §2.3；同步 [data-models.md](data-models.md)。

## 5. 实施步骤

1. 迁移 + schema（`Moment.visibilityGroupId`、`MomentVisibilityGroup`）。
2. 纯函数裁决点 `lib/moments/visibility.ts` + 单测（12 用例，挂进 `pnpm test`）。
3. Setting `momentVisibleDays` 三处同步。
4. DB 侧 `lib/moments/visibility-groups.ts` + zod 校验 + 组 CRUD 路由。
5. 公开查询接可见期（列表/总数/首页模块/点赞/评论写入共用一个 where）。
6. 后台三件套组件 + 瞬间页重排为三块 + `admin.css` 补样式。
7. 文档同步（本 spec + pitfalls + data-models + api-contracts + module.md + README + user-manual + moments-home-spec）。
8. 用户执行迁移 → Windows 浏览器实测。

## 6. 验收标准

**单测/脚本（实测结果）**

- `pnpm test` 里 `src/lib/moments/visibility.test.ts` **12 个用例**全过，含两条回归：
  - 「组比全局长时必须乘上全局上限」（P-096）；
  - 「绝不输出 notIn（Prisma OR 组合会算错）」（P-094）。
- 全量单测：**`pnpm test` 158 通过 / 0 失败**；`npx tsc --noEmit` 无错误；`npx next build` 成功。
- `main/scripts/verify-moment-visibility.ts` 对着 scratch 库跑真实 Prisma 条件：**7/7 通过**（跑法见文件头注释：`DATABASE_URL` + `prisma migrate deploy`，再 `DATABASE_PATH` + `npx tsx`；**不碰 `data/blog.db`**）。
- `main/scripts/check-admin-classes.mjs`：瞬间相关组件引用的 `admin-*` / `moment-*` 类名与 `admin.css` 逐个比对，**引用类名 40 个、缺失 0 个**（P-097 的回归自查）。

**HTTP 运行时验收（实测，scratch 库 + `next dev -p 3100`，全程未碰 `main/data/blog.db`）**

| 场景 | 请求 | 实测结果 |
|---|---|---|
| 默认 `momentVisibleDays=0` | `GET /api/moments` | `total=4`（全部可见，等价旧行为 —— 走的就是"不带条件"那条分支，P-095 的回归） |
| 改成 30 天，并给一条 5 天前的瞬间挂 3 天组（等过 60s 设置缓存） | `GET /api/moments` | `total=2 ids=1,4`：40 天前那条按全局隐藏、5 天前那条按 3 天组隐藏 |
| 可见/过期瞬间的评论读取 | `GET /api/comments?targetType=moment&targetId=N` | 可见的（1、4）`total=1`；已过期的（2、3）`total=0` |
| 点赞 | `POST /api/moments/{id}/like`（带 cookie + Origin + CSRF） | 可见的 id=1 → HTTP **200** `{"liked":true,"likeCount":1}`；已过期的 id=3 → HTTP **404** |

**功能（Windows 浏览器）**

- 全局设 3 天：前台首页瞬间模块与瞬间页都看不到 3 天前的瞬间；后台仍列出全部，过期那条带 `已过期 · 前台已隐藏` 红徽章。
- 建「三天可见组」，全局设 30 天：用该组的瞬间按 3 天到期。
- 全局 7 天 + 一年组：实际仍按 7 天生效，后台标「受全局 7 天限制」（**不许漏出 40 天前那条**）。
- 删除正在被使用的组：二次确认写明影响条数与回落规则；删完那些瞬间回到全局规则，**瞬间本身还在**。
- 过期瞬间：`POST /api/moments/[id]/like` → 404；`GET`/`POST /api/comments`（targetType=moment）→ 空列表 / 404（读与写两侧都挡）。
- 重名建组 → 409；`PATCH` 不传字段 → 400。

## 7. 审批

- [x] 用户已批准（计划稿）
- [x] 实施完成
- [x] 文档已同步（`docs/moment-visibility-spec.md`、`docs/pitfalls.md` P-094–P-097、`docs/data-models.md`、`docs/api-contracts.md`、`docs/ai/module.md`、`docs/architecture.md`、`docs/moments-home-spec.md`、`docs/user-manual.md`、`README.md`、`AGENTS.md` §3、`docs/README.md`）
- [x] 运行时验收已做（scratch 库 + `next dev -p 3100`，见 §6；`pnpm test` 158/0、`tsc --noEmit` 无错、`next build` 通过、类名自查缺失 0）
- [x] **开发库迁移已应用**（2026-09-30）：在 `main/` 下 `pnpm prisma migrate deploy` 应用 `20260927160000_moment_visibility_group`。应用前按 AGENTS §5 先做了文件级备份（校验通过后即删，不留垃圾：`data/backups/` 的轮转只认 `myblog-*.tar.gz`）。
      结果实测：`Moment` 列为 `id/content/images/createdAt/visibilityGroupId`；外键 `visibilityGroupId → MomentVisibilityGroup(id) ON DELETE SET NULL`；`PRAGMA integrity_check = ok`；本站 2 条瞬间完好；`prisma migrate status` 报「Database schema is up to date」。
      复现过的故障：迁移未应用时打开首页直接 500（`PrismaClientKnownRequestError: The table main.MomentVisibilityGroup does not exist`，调用链 `app/page.tsx → lib/home/data.ts → listHomeMoments → loadMomentVisibilityContext`）。应用后 `/`、`/moments`、`/posts`、`/api/moments` 全部 200。
- [ ] **生产目标机的迁移由部署流程自动执行**：更新并重启时 `scripts/boot.cjs` 会先跑 `prisma migrate deploy`；要手工补跑也用 `migrate deploy`（**别用 `migrate dev`**，见 P-105），跑完补一次 `pnpm prisma generate`（P-124），否则会复现上面同一个「表不存在」报错。
