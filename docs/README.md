# docs/ — 详细手册索引

本目录是 AI 协作的详细手册层，按任务按需加载。总纲见根目录 [AGENTS.md](../AGENTS.md)。

## 阅读顺序

| 场景 | 必读 |
|---|---|
| 任何新会话 | AGENTS.md（角色 + 红线 + 导航） |
| 写/改代码前 | [ai/module.md](ai/module.md) + [pitfalls.md](pitfalls.md) |
| 改 API/数据模型 | [api-contracts.md](api-contracts.md) + [data-models.md](data-models.md) |
| 大改动 | [spec-template.md](spec-template.md)（先 Spec 后代码） |
| **交付前** | [agents-maintenance.md](agents-maintenance.md)（文档同步触发表，强制收尾） |
| 改协作方式 | [collaboration-workflow.md](collaboration-workflow.md) |

## 文档职责表

| 文件 | 职责 | 谁维护 | 何时读/改 |
|---|---|---|---|
| `README.md`（本文件） | 阅读顺序 + 职责表 | AI | 新增 docs 文件时更新 |
| `ai/module.md` | 模块注册表：模块路径→核心 API→用途；防止重复造轮子 | AI | 新增/删除/重命名源码文件时更新；写代码前必读 |
| `architecture.md` | 架构、数据流、技术选型理由、目录结构、资源约束 | AI | 架构变更时同步 |
| `data-models.md` | Prisma 模型字段级说明 | AI | schema 变更时同步 |
| `api-contracts.md` | API 路由契约（请求/响应/错误码） | AI | 新增/修改路由时同步 |
| `pitfalls.md` | 已知陷阱活文档（P-0XX 递增） | AI | AI 犯错时立即追加；写代码前读 |
| `collaboration-workflow.md` | 任务隔离、操作授权、Spec 流程 | AI + 用户 | 协作规则调整时 |
| `agents-maintenance.md` | 文档分层、触发同步更新、健康度自检 | AI | **每次交付前必读** |
| `spec-template.md` | 大改动 Spec 空白模板 | AI | 触发大改动判定时使用 |
| `m2-completion-spec.md` | M2 存储/MDX/解锁/Bing/阅读交互的批准方案与验收记录 | AI + 用户 | M2 实施与复盘 |
| `m3-spec.md` | M3 编辑器 vendor + 后台管理的待审批/实施方案 | AI + 用户 | M3 规划与实施 |
| `m4-spec.md` | M4 评论系统实施方案与验收 | AI + 用户 | M4 规划与实施 |
| `m6-spec.md` | M6 备份系统 + 首页透明度/后台写文章布局实施方案 | AI + 用户 | M6 规划与实施 |
| `backup-restore-spec.md` | 一键恢复：面板预约并重启 + `pnpm restore` | AI + 用户 | 改备份恢复前必读 |
| `app-update-spec.md` | 程序更新：导入 tar.gz、boot.cjs 覆盖程序文件 | AI + 用户 | 改程序更新或启动入口前必读 |
| `data-clear-spec.md` | 更新页一键数据清理：范围、确认、15 秒闸门与保留边界 | AI + 用户 | 改数据清理或危险操作前必读 |
| `admin-ui-rewrite-spec.md` | 后台前端 UI 重写：独立 CSS、手机底栏、双形态列表、写文章 sheet；§10 第三轮（冷灰表面 + 6 套可切换配色 + 概览卡片显隐） | AI + 用户 | 改后台界面前必读 |
| [../ADMIN-REWRITE-PLAN.md](../ADMIN-REWRITE-PLAN.md) | 第三轮后台重写的 7 阶段实施计划：配色体系、卡片显隐与外观面板、后端查询清单、风险清单（在仓库根目录） | AI + 用户 | 动后台视觉 / 配色 / 概览页前必读 |
| [../changelog/AUTHOR-AND-ADMIN-UX-CHANGELOG.md](../changelog/AUTHOR-AND-ADMIN-UX-CHANGELOG.md) | 文章作者、文章页时间口径（含「已修改」）、列表点卡片二选一、卡片/页脚小修、后台暗色可读性、编辑器 ⓘ 说明卡分层的改动清单（每一组可直接当 commit message 摘取；在仓库 `changelog/` 目录） | AI | 写提交说明或发行说明前必读 |
| [../changelog/ADMIN-REWRITE-CHANGELOG.md](../changelog/ADMIN-REWRITE-CHANGELOG.md) | 第三轮后台重写的改动清单：按可提交分组的文件级说明、验证证据、未完成项、约束（写 commit / 发行说明时直接摘取；在仓库 `changelog/` 目录） | AI | 写提交说明或发行说明前必读 |
| [../changelog/CARD-AND-LOGIN-CHANGELOG.md](../changelog/CARD-AND-LOGIN-CHANGELOG.md) | 无封面细条卡与「有没有封面」判定、登录后卡住的修复清单 | AI | 写提交说明或发行说明前必读 |
| `linux-deploy-spec.md` | Linux 精简安装：更新包首装一次，以后只换包 | AI + 用户 | 部署或发版流程前必读 |
| `backup-encryption-spec.md` | 拆分密钥备份：主机半钥 + 包内半钥、scrypt、`pnpm setup` | AI + 用户 | 改备份加密或投产初始化前必读 |
| `home-modules-spec.md` | M8 首页模块化：格点模型、内置 11 模块、自定义代码边界、后台画布 | AI + 用户 | 改首页结构或首页模块前必读 |
| `responsive-layout-spec.md` | 双视口自适应：盒子决定内容、电脑/手机两套几何、走手机套含横屏 | AI + 用户 | 改首页格点、内页侧栏或瞬间页高度前必读 |
| `moments-home-spec.md` | 瞬间首页模块、二级缩略图、朋友圈宫格展开 | AI + 用户 | 改瞬间展示或首页瞬间模块前必读 |
| `cos-storage-spec.md` | 腾讯云 COS：加密备份上云、媒体双写、访客 thumb 走 COS | AI + 用户 | 改存储驱动、上传或备份上云前必读 |
| `media-layout-spec.md` | 本地媒体限额、目录对齐、缩略图定位、文章 publicId URL | AI + 用户 | 改上传路径、缩略图或文章地址前必读 |
| `readme-requirements.md` | README 必备章节清单 | AI | 用户可见功能变更时对照更新根 README |
| `user-manual.md` | 站长手册：高级用途与注意事项（不含基本发文） | AI + 用户 | 给人看；改备份/更新/COS/开箱行为时同步 |

> ⚠️ **`changelog/` 三个文件只留本机**（已进 `.gitignore`，见 [pitfalls.md](pitfalls.md) P-092）：它们是内部施工笔记，只在写 commit message / 发行说明时摘取，clone 仓库拿不到这三个文件。

## 活文档维护说明

- 犯错 → 立即写 pitfalls（P-0XX 递增，不删旧条）
- `changelog/` 只留本机、不进仓库（P-092）
- 架构/模型/路由变更 → 同步对应 doc + AGENTS 索引
- 每次改代码交付前 → 走 `agents-maintenance.md` 触发表
- 与用户口头要求冲突时，以用户要求为准，并回写文档使其一致
