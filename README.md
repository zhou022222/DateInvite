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
-- 复制 supabase/schema.sql 的内容执行
```

或者直接打开 [supabase/schema.sql](/Users/xiaozhou/projects/DataInvite/supabase/schema.sql) 复制里面的 SQL。

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

## 旧本地数据库

旧版本使用项目目录里的 `data.db`。新版本已经不再读写这个文件，数据会写入 Supabase。
