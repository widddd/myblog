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
| `readme-requirements.md` | README 必备章节清单 | AI | 用户可见功能变更时对照更新根 README |

## 活文档维护说明

- 犯错 → 立即写 pitfalls（P-0XX 递增，不删旧条）
- 架构/模型/路由变更 → 同步对应 doc + AGENTS 索引
- 每次改代码交付前 → 走 `agents-maintenance.md` 触发表
- 与用户口头要求冲突时，以用户要求为准，并回写文档使其一致
