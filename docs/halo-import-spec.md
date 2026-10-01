# Spec：Halo 备份导入（文章 / 瞬间 / 自定义页面 + 图片）

- 日期：2026-10-01
- 提案人：AI
- 状态：已实施（本机隔离环境演练通过；**真正的迁移由用户在目标机上执行**）
- 相关红线：存储可插拔（图片只经 `lib/storage` 的 Driver 落盘）、高成本操作只给命令（批量写库不在本机跑）、[P-114](pitfalls.md)（脚本里别碰 `next/cache`）

## 1. 用途与数据来源

把 `reference/encryptarticles/decode_backup.py` 解出来的 Halo 备份（`decoded/` 目录）导进本站：
文章 / 瞬间 / 自定义页面 + 它们的图片。**`reference/` 只读不动**，脚本不写那边，只读。

```
<decoded>/
  articles/*.html + *.meta.json    # Post 与 SinglePage：标题/slug/时间/分类/封面/正文 HTML
  moments/*.html + *.meta.json     # 瞬间：正文、媒体（图片）清单、发布时间
  images/manifest.json             # 被引用图片的清单（附件元数据 + 本地相对路径）
  upload/*                         # 图片二进制（Halo 的 upload/ 目录）
```

图片在这份备份里**只有元数据**，正文里的 `/upload/xxx.jpg` 是 Halo 站上的绝对路径——这就是"图片加载不出来"的原因：路径属于旧站、二进制也不在备份里。脚本把 `upload/` 里的文件按本站的媒体布局重新落盘并登记，再把正文引用改写成站内地址。

## 2. 怎么用

### 2.1 先看一遍（什么都不改）

```powershell
cd main
pnpm import:halo --dir ..\reference\encryptarticles\decoded
```

输出：文章/页面/瞬间清单、每张图片算出来的存储 key 与尺寸、被跳过的东西与原因。**这一步不写库、不动 `data/`**（`--dump` 只写你指定的那个目录）。

想连转换后的正文一起复核：

```powershell
pnpm import:halo --dir ..\reference\encryptarticles\decoded --dump .\halo-dump
# posts/*.mdx（每篇一篇 MDX）、pages/*.html（自定义页面）、posts.json、moments.json、images.json
```

### 2.2 真正导入

```powershell
pnpm import:halo --dir ..\reference\encryptarticles\decoded --apply
```

### 2.3 在目标服务器上导入

```bash
# 本机打包发过去（decoded 约 50MB）
scp -r reference/encryptarticles/decoded root@<host>:/root/halo-decoded
# 服务器上（程序目录里）
cd /root/myblog            # 你的程序目录
npx tsx scripts/import-halo.ts --dir /root/halo-decoded          # 先预览
npx tsx scripts/import-halo.ts --dir /root/halo-decoded --apply  # 再导入
pm2 restart myblog         # 立刻可见（不重启最多等 60 秒缓存过期）
```

导入需要 `tsx`（`pnpm setup` / `pnpm restore` 同样依赖它，正常安装就有）。

**脚本还没随更新包上服务器时**，两种办法二选一：

- 走正常发版：本机 `pnpm pack:update` → 后台「更新」导入应用，或 `pnpm apply-update --file ./包.tar.gz && pm2 restart myblog`；
- 只补这两份文件（脚本不 import 别的本项目文件，`npx tsx scripts/import-halo.ts` 也不依赖 `package.json` 里的 `import:halo` 别名）：

  ```bash
  scp main/scripts/import-halo.ts            root@<host>:/root/myblog/scripts/
  scp main/src/lib/posts/import-halo.ts      root@<host>:/root/myblog/src/lib/posts/
  ```

### 2.4 全部开关

| 开关 | 作用 |
|---|---|
| `--apply` | 真正写库/写盘（缺省只预览） |
| `--dump <目录>` | 把转换结果（MDX / JSON）写出来复核 |
| `--no-cos` | 只写本地，不把图片同步到 COS（默认配了 COS 就同步） |
| `--include-deleted` | 连 Halo 里已删除的文章也导入（默认跳过） |
| `--skip-drafts` | 草稿不导入（默认按草稿导入） |
| `--skip-pages` | 自定义页面不导（默认导成后台「静态页面」） |
| `--skip-posts` / `--skip-moments` | 只导其中一类 |
| `--update-posts` | 同 slug 已存在时用 Halo 版本覆盖正文/封面/摘要/分类 |
| `--keep-indent` | 原正文里 `text-indent:2em` 的段落补两个全角空格（默认交给站点样式） |

## 3. 映射规则

| Halo | 本站 | 说明 |
|---|---|---|
| `Post` | `Post` | `slug` 用 Halo 的 slug；`publicId` 由 `allocatePublicId()` 新分配；正文 HTML → MDX |
| `Post.publish=true` | `status="published"` + `publishedAt=publishTime` | 时间原样保留（UTC） |
| `Post.publish=false` | `status="draft"` | 草稿进后台，前台不可见 |
| `Post.deleted=true` | 默认跳过 | 两个默认文章（Hello Halo、从93阅兵看国外政治）走这条 |
| `Post.categories[0]` | `Category`（按名字 upsert，slug 用 `slugify`） | Halo 多分类时只取第一个并告警 |
| `Post.tags[]` | `Tag` + `PostTag` | 按名字 upsert |
| `Post.excerpt` | `excerpt` | 空串 → `null`（列表卡片自己会用正文开头兜底） |
| `Post.cover` | `cover` = **缩略图 + COS 感知**的地址（与编辑器 `editorImageUrl()` 同一口径） | 有封面 → 列表/详情走大卡。**不能写原图地址**：`CoverMedia` 把封面原样交给 `next/image`（不做按 hash 改写），写原图就是每页拉 3–5MB。见 [P-118](pitfalls.md) |
| `SinglePage`（如「关于」） | `StaticPage` | 正文 HTML 原样进 `html` 字段；地址 = `/{Setting staticPagesDir}/{slug}` |
| `Moment` | `Moment` | `createdAt = releaseTime`；正文取纯文本；`images` JSON |
| `Moment.content.medium[]` | `Moment.images[]` | `{key, thumb, width, height}`，顺序与 Halo 一致 |
| `Attachment` | `Upload` 行 + `data/uploads/…` 文件 | 见下节 |

正文转换（`lib/posts/import-halo.ts`，纯函数，无 Prisma）：
`<p>` / `<h1>`–`<h6>` / `<ul>`/`<ol>`/`<li>` / `<blockquote>` / `<pre>` / `<table>` / `<img>` / `<br>` / `<a>` → MDX；
`<span>`/`<mark>` 这类无语义包裹层直接脱掉；`<`、`>`、`&`、`{`、`}` 都转义成 MDX 安全写法；
链接只认站内路径与 `https`，`javascript:` 之类退化成纯文本。

## 4. 图片怎么处理

1. 读出 `upload/<文件名>` 的字节 → `sha256` → `file-type` 判真实类型（得到扩展名）。
2. 存储 key 与后台上传**完全同一套**（`lib/storage/media-keys.ts`）：
   `images/original/{hash 前 2 位}/{hash}.{ext}`；用 local 驱动落到 `data/uploads/`。
3. 登记 `Upload` 行（`hash` 唯一，重复导入按 hash 去重）。
4. 缩略图走 `finalizeUpload(hash, "derivatives")` → 一级 `images/thumbs/{hh}/{hash}.webp` + 二级 `images/thumbs2/{hh}/{hash}.webp`（二级只本地）。
5. 配了 COS 就再 `finalizeUpload(hash, "replicate")` 把原图 + 一级缩略图同步上去（`--no-cos` 可跳过）。
6. 引用改写（**两类图走两条路，别混**）：
   - 文章正文 → `![alt](/api/uploads/images/original/{hh}/{hash}.{ext})`；渲染时 `mdx.tsx` 按 hash 查 `Upload` 自动换成缩略图，灯箱再取原图（配了 COS 就是 COS 直链）。所以正文里存"原图的本机路径"是**对的**。
   - 文章封面 → **缩略图地址**，且按当时配置解析成 COS 直链或 `/api/uploads/...`（`publicMediaUrl(thumbKey)`）。原因：`components/common/CoverMedia.tsx` 把 `Post.cover` **原样**交给 `next/image`，没有任何按 hash 的改写——写原图等于每个列表/详情页都从服务器拉一张 3–5MB 的图。
   - 瞬间 → `images[]` 存**存储 key**（不是 URL）：`resolvePublicImageUrl()` 会按当前配置解析成 COS 或 `/api/uploads`，换存储不用改数据。

## 5. 幂等 / 重跑

| 对象 | 判重方式 | 重跑结果 |
|---|---|---|
| 图片 | `Upload.hash` 唯一 | 已存在则复用，缩略图已有就跳过 |
| 文章 | `Post.slug` | 跳过并列出（`--update-posts` 则覆盖正文等字段） |
| 自定义页面 | `StaticPage.slug` | 跳过并列出 |
| 瞬间 | `(createdAt, content)` 相同 | 跳过（计数为"已存在"） |

## 6. 已知取舍（故意不做的）

- **一篇正文导出了多版时只取一版**：`decode_backup.py` 重建正文时，若某个 Halo 快照的 diff 是"整篇插入"，`decoded/articles/<x>.html` 会是一行一版（**最新一版在最前**，例如 `starting-article.html` 有 4 行）。脚本取第一行并在预览里告警把候选长度都打出来；要换版本就手工编辑那个 `.html` 再重跑。
- **内联样式全丢**：`style=""`、`text-align:center`、灰色文字、`text-indent` 都不进 MDX（前台正文过 `rehype-sanitize`，本来也留不住）。要保留缩进用 `--keep-indent`。
- **`upload/` 里没被引用的文件不导**（favicon、`12162346nbns.png`、`微信图片_2025-08-22_082637_147.jpg`）：预览里会列出来。
- **Halo 内部链接不改写**：本批数据里只有外链（且都在被跳过的 Hello Halo 里）。若将来有 `/archives/xxx` 这类站内链接，需要单独映射成 `/posts/{publicId}/{slug}`。
- **「关于」页面不会自动进导航**：前台导航是代码里的 `nav-links.ts`，静态页面只保证地址可用（`/{staticPagesDir}/about`）。
- **后台"删除"的文章按跳过处理**，不会在库里留下痕迹。

## 7. 导入后要做的两件事

1. **重启应用**（`pm2 restart myblog`）：改的是库，公开页缓存 `revalidate=60` 且 tag 在进程内存里（[P-114](pitfalls.md)）。
2. **确认瞬间全局可见期**：`Setting.momentVisibleDays` 默认 `0`（永久），导入的历史瞬间都看得到；若目标机设成了"最近 N 天"，2025 年的瞬间会被判过期在前台消失 → 后台设置里改成永久。

## 8. 验收记录（2026-10-01 本机隔离演练）

环境：`main/` 完整副本（**不含** `node_modules`/`.next`/`data`）→ `pnpm install --offline --frozen-lockfile`（8.8s）→ `pnpm prisma migrate deploy`（空库）→ 导入 → `next dev` 起在 3999 端口。全程不碰开发库、不碰用户正在跑的 3000 端口 dev server，演练目录事后删除。

- 导入：**图片 22/22（原图 22 + 一级 22 + 二级 22 = 66 个文件）、文章 4 篇、静态页面 1 个、瞬间 24 条**，失败 0。
- 文章页：`/posts/{publicId}/{slug}` 走真实 MDX 管线渲染成功，正文图片 `src` = `.../images/thumbs/...webp`、`data-lightbox-src` = `.../images/original/...jpg`，`<h2 id="前言">` 与目录 widget 正常，页面里没有残留的 `/upload/`。
- 图片 HTTP：一级缩略图 `200 image/webp 25936`、原图 `200 image/jpeg 3300576`、二级缩略图 `200 image/webp 3856`、瞬间原图 `200 image/jpeg 5049788`。
- 瞬间页：`/moments` 与 `?page=2` 各 12 条（共 24），多图宫格 `data-count` 正确，图片走 thumb。
- 首页：瞬间模块用二级缩略图（5 处 `images/thumbs2/...`），4 张文章卡片与封面都在。
- 静态页面：`/{dir}/about` 渲染出"联系我 / 邮箱 / 微信 / QQ"。
- 开栏语取的是**发布版**（"终刊号封底"），不是更早的"终刊号尾页" → 多版正文的取法正确。
- 幂等：第二次 `--apply` → 新建 0、文章跳过 4、页面跳过 1、瞬间已存在 24。
- 单元测试：`src/lib/posts/import-halo.test.ts` 10 项全过（`pnpm test` 已收录这个文件）。

## 9. 需要用户执行项

1. 在**目标机**上跑 `--apply`（第 2.3 节四条命令），然后 `pm2 restart myblog`。
2. 打开 4 篇文章 + 瞬间页（翻到第 2 页）+ `/about` 看一眼排版，确认要保留的取舍（缩进、居中说明文字）。
3. 决定「关于」页面要不要挂到前台导航（要改 `main/src/components/layout/nav-links.ts`）。
