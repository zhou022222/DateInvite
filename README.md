# Moment 约会邀请 H5

一个可创建、分享、回应的约会邀请 H5。当前版本使用：

- 前端：原生 HTML / CSS / JavaScript
- 后端：Express
- 数据库：Supabase Postgres

## 本地准备

安装依赖：

```bash
npm install
```

复制环境变量文件：

```bash
cp .env.example .env
```

然后在 `.env` 里填入 Supabase 项目的：

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3000
```

注意：`SUPABASE_SERVICE_ROLE_KEY` 是后端密钥，不要放到前端代码里，也不要提交到仓库。

## Supabase 建表

在 Supabase Dashboard 打开 SQL Editor，执行：

```sql
-- 复制 schema.sql 的内容执行
```

或者直接打开 [schema.sql](/Users/xiaozhou/projects/DataInvite/schema.sql) 复制里面的 SQL。

## 本地运行

```bash
npm start
```

然后打开：

- 创建邀请：`http://localhost:3000/index.html`
- 受邀页面：创建邀请后生成的 `http://localhost:3000/index.html?id=...`

## 部署到 Render

这个项目现在不是纯静态站点，因为它有 Express API。推荐先部署到 Render 的 Web Service。

1. 把项目上传到 GitHub。
2. 打开 Render，选择 `New` -> `Web Service`。
3. 连接这个 GitHub 仓库。
4. 配置：
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/healthz`
5. 添加环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. 点击 Deploy。

部署环境里必须配置：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

部署成功后，别人打开公网域名生成的邀请链接，回应会写入 Supabase 数据库。

## 免费服务保活（防止休眠）

Render 免费计划会在 **15 分钟无请求后自动休眠**，导致下次访问需要等待 30～60 秒冷启动。

推荐使用以下免费服务保持在线：

### cron-job.org（推荐）

1. 打开 https://cron-job.org
2. 注册免费账号
3. 创建定时任务：
   - **URL**: `https://你的域名/healthz`
   - **间隔**: 每 5 分钟
4. 保存即可。该服务会每 5 分钟 ping 一次 `/healthz`，防止 Render 休眠。

### UptimeRobot（备选）

1. 打开 https://uptimerobot.com 注册
2. 免费计划支持 50 个监控器，每 5 分钟检查一次
3. 添加 HTTP(s) 监控，URL 填 `https://你的域名/healthz`

> 注意：无论哪种方式，首次部署后的第一次访问仍需等待冷启动。之后只要保活持续运行，服务就会一直在线。

## 稳定性改进说明

本项目前端已内置以下容错机制：

- **请求超时控制**：所有 API 请求 15 秒超时，超时后给出友好提示
- **冷启动提示**：首次加载时显示加载动画，提示服务器可能正在唤醒
- **自动重试**：加载失败时可一键重试
- **更好的错误体验**：区分超时错误和其他错误，给用户明确的下一步操作

## 旧本地数据库

旧版本使用项目目录里的 `data.db`。新版本已经不再读写这个文件，数据会写入 Supabase。
