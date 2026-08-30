# readme-requirements.md — README 必备章节清单

> 用户可见功能变更时，对照本清单更新根目录 README.md。

## 必备章节

1. **项目概述与特性**（前台功能、后台能力、设计风格一句话）
2. **技术栈**
3. **目录结构**（main/docs/reference 三层说明）
4. **环境要求**（Node ≥20、pnpm、Windows 开发 + Linux 部署说明、1GB RAM 可运行）
5. **环境安装**（pnpm install、.env 配置说明、sharp/better-sqlite3 在 Windows 的安装注意）
6. **数据/配置说明**（.env 变量表、Setting KV 列表、data/ 目录职责）
7. **开发调试**（pnpm dev、prisma migrate dev、seed、常见问题）
8. **构建与部署**（pnpm build、pm2 fork 单实例、nginx 反代建议、systemd/pm2 开机自启）
9. **备份与恢复**（自动备份周期配置、手动备份、下载、恢复步骤）
10. **各入口用法**（后台登录、管理员初始化 ADMIN_INIT_PASSWORD）
11. **FAQ**（端口、数据库位置、上传文件位置、密码文章忘记密码等）

## 更新触发

| 变更 | 更新点 |
|---|---|
| 新增用户可见功能 | 特性 + 入口用法 |
| .env 新增变量 | 环境安装 + 数据/配置说明 |
| 部署方式变化 | 构建与部署 |
| 备份行为变化 | 备份与恢复 |
