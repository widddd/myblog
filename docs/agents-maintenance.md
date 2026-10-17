# agents-maintenance.md — 文档维护规范

## 强制收尾（每次改代码交付前必做）

凡完成源码、配置、架构、用户可见功能的改动，交付前必须：

1. 打开下方「触发同步更新」表，按变更类型更新**全部**列出的目标文件
2. 对照 AGENTS.md §8 检查清单逐项勾选
3. 在回复中列出已同步的文档路径

不得将文档同步留到用户追问或「下次再补」。

> **默认验证口径（用户钦定 2026-10-17d，替代 2026-10-17 旧口径）**：除非用户当轮明确要求，交付前默认做常规验证——相关单测、类型检查、必要的 dev server 页面/接口核对、关键交互或完整流程的端到端检查；需要时保留一张关键截图做视觉确认。**不做逐帧截图、逐像素比对、穷举式边界矩阵、重复多设备/多视口细验等过细验证**；用户明确要求“完整验收 / 逐帧 / 真机 / 多设备”时才升级。高成本操作仍按 AGENTS.md §5 只给命令。

`HANDOFF.md` 自 2026-08-29 起为只读历史快照，不再纳入同步更新；其余文档继续按本规范维护。

## 触发同步更新表

| 变更类型 | 优先更新 |
|---|---|
| 新增/删除/重命名源码文件 | docs/ai/module.md + docs/architecture.md + AGENTS.md §3 索引行 |
| 架构/接口变更 | docs/architecture.md + docs/ai/module.md + AGENTS.md 技术栈行 |
| Prisma schema 变更 | docs/data-models.md + 迁移文件入库 |
| API 新增/修改 | docs/api-contracts.md |
| 配置（Setting KV）变更 | module.md 对应模块行 + pitfalls（若易错）+ 默认值定义处三处同步 |
| 用户新增硬规则 | 判断是否第一时间底线 → 是则 AGENTS.md + docs；否则只写 docs |
| AI 重复或显著犯错 | **docs/pitfalls.md 立即追加**（P-0XX） |
| 用户可见功能变更 | README.md（对照 readme-requirements.md） |
| 新增 docs 文件 | docs/README.md 职责表 |
| 里程碑完成 | PLAN.md 勾选 + AGENTS.md §6 状态摘要行 |

## 更新方式

- 优先**增量编辑**，不推倒重写
- pitfalls 用 P-0XX 递增
- 优先写 docs/，慎写 AGENTS.md（保持 ≤400 行）

## 注册表审计（每个里程碑结束时）

对照 docs/ai/module.md 与源码逐项核对：每个源码文件有对应行；核心 API 无遗漏；「禁止自造」清单与架构一致。发现脱节 → 立即修复并在 pitfalls 追加。

## 健康度自检（定期或大改后自问）

1. 新会话的 AI 能否仅靠 AGENTS.md + docs/ 写出符合规范的代码？
2. pitfalls 增加后，重复犯错是否下降？
3. 是否还在同一对话纠缠超 10 轮？——若是，拆分任务、新建会话。
