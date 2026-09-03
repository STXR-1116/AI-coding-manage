# 团队 Skill 项目管理后台

本目录是 Web 管理后台源码交付，供后端同事实现项目管理服务 API 并进行真实 HTTP 联调。应用使用 Next.js 15、React 18、NextAuth Credentials 和 TypeScript；源码只包含后台页面、同源 API 代理、认证会话和测试，不包含生产数据库或服务实现。

接口和页面决策文档随交付物保存在 `docs/`，包括项目管理和知识库设计/API 文档；实现以这些文档和源码共同约束。

## 功能范围

后台一级菜单包含“项目管理”，项目详情提供四个页签：`概览`、`成员`、`资产关联`、`审计`。当前交付支持：

- 按组织、状态和名称筛选项目列表。
- 创建 `draft` 项目，编辑名称/描述，显式激活和归档。
- 查看项目摘要、修订号、成员数和资产数。
- 添加/移除项目成员；目标账号必须是所属组织内有效的 `member`。
- 添加、切换或解除 `skill`、`knowledge`、`memory` 资产关联，关系为 `reference` 或 `context`。
- 查看项目范围内的服务端审计记录。

项目生命周期固定为 `draft -> active -> archived`，归档后只读且不可恢复。后台不提供代码源、上传、任务、Run、Git、Workspace、本地路径或批量写入口；资产关联页当前手工输入不透明 `asset_id`，没有候选资产查询。

知识库管理页支持组织范围列表、`document`/`faq`/`wiki` 三种类型创建、基础配置、Markdown/URL/文件描述导入、异步操作状态轮询、文档重解析/删除和删除影响确认。FAQ、Wiki、图谱、项目和审计页签目前只呈现服务端能力说明；文件夹/标签 CRUD、FAQ/Wiki 条目编辑、真实图谱数据、项目关联操作和知识库审计查询尚未接入页面。

记忆库管理页按当前项目提供服务端权威的记忆列表、关键词搜索、详情、正文编辑、删除、项目范围调整、召回策略、处理任务和治理审计。编辑、删除、范围调整、策略更新和任务重试使用 `If-Match`、`expected_revision` 与 `Idempotency-Key`；成员只能操作自己的捕获记录，manager/admin 的管理范围由服务端重新鉴权，页面不会以本地状态冒充成功。

## 目录结构

```text
src/app/page.tsx                         # 登录、首次改密和主后台入口
src/app/projects/[[...path]]/page.tsx    # 稳定项目详情路由
src/app/api/auth/[...nextauth]/route.ts  # NextAuth 路由
src/app/api/session/route.ts              # 会话读取
src/app/api/team-skill/[...path]/route.ts # 同源服务 API 代理
src/auth.ts                               # Credentials 登录与令牌刷新
src/auth-session.ts                       # Refresh Token 轮换解析
src/components/admin-dashboard.tsx       # 菜单、项目/知识库/记忆库页面、项目页签及其他 Skill 管理页面
src/lib/team-skill-api.ts                 # 类型化 REST 客户端
src/lib/team-skill-types.ts               # 服务响应和项目模型
tests/                                    # API、路由和组件测试
```

## 本地配置

在后台进程环境中设置：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `TEAM_SKILL_SERVICE_URL` | 是 | 服务端根地址，例如 `http://127.0.0.1:4100/v1`；只在 Next.js 服务端读取。 |
| `AUTH_SECRET` | 生产必需 | NextAuth JWT 签名密钥；未设置时仅使用源码中的本地开发默认值。 |
| `NEXT_PUBLIC_TEAM_SKILL_API_URL` | 仅无 Session 测试 | 未登录测试实例的直接 API 地址；正常登录页面使用同源 `/api/team-skill` 代理。 |

浏览器只携带 NextAuth Session Cookie。代理从服务端 JWT 读取 Access Token，删除 Cookie/Host 头后向上游附加 `Authorization: Bearer`，并禁止把 Refresh Token、服务令牌或上游 `set-cookie` 返回给浏览器。上游未配置时代理返回 `503 SERVICE_UNAVAILABLE`；没有有效 Session 时返回 `401 AUTH_REQUIRED`。

启动：

```sh
pnpm install
$env:TEAM_SKILL_SERVICE_URL='http://127.0.0.1:4100/v1'
$env:AUTH_SECRET='local-only-change-me'
pnpm --filter @deepseek-ai/team-skill-admin dev
```

默认 Next.js 地址为 `http://localhost:3000`。生产部署应使用固定 `AUTH_SECRET`、HTTPS、受保护的服务 URL，并由服务端实现企业认证、真实 WeKnora 适配、持久化和审计留存。

## 路由和页面行为

- `/`：未登录显示账号密码；首次登录且 `must_change_password=true` 时强制改密；有效 Session 进入后台。
- `/projects`：项目管理一级页面。选择项目后进入稳定 URL `/projects/{project_id}?tab=overview|members|assets|audit`。
- 详情页切换页签不会改变浏览器 Session 或其他当前项目状态；刷新可重新读取服务端。
- `member` 角色隐藏管理菜单，直接访问项目路由时不返回项目数据。`admin` 可管理全平台，`manager` 仅管理其加入的有效组织。
- 控件显示由固定角色矩阵控制；服务端仍必须对每次请求重新鉴权，不能信任前端隐藏菜单或 `allowed_actions`。

## 项目 API 调用

`src/lib/team-skill-api.ts` 通过同源代理调用以下路径：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/admin/projects` | 项目列表，查询参数 `organization_id`、`status`、`name`。 |
| `POST` | `/admin/projects` | 创建草稿，体为 `organization_id`、`name`、可选 `description`。 |
| `GET` | `/admin/projects/{project_id}` | 项目概览。 |
| `PATCH` | `/admin/projects/{project_id}` | 只更新名称和描述。 |
| `POST` | `/admin/projects/{project_id}:activate` | `draft -> active`。 |
| `POST` | `/admin/projects/{project_id}:archive` | `active -> archived`。 |
| `GET` | `/admin/projects/{project_id}/members` | 项目成员关系。 |
| `PUT` / `DELETE` | `/admin/projects/{project_id}/members/{user_id}` | 添加/恢复或移除单个成员。 |
| `GET` | `/admin/projects/{project_id}/assets` | 已授权资产关系。 |
| `POST` | `/admin/projects/{project_id}/assets` | 添加单条资产关联。 |
| `PATCH` / `DELETE` | `/admin/projects/{project_id}/assets/{asset_type}/{asset_id}` | 修改关系类型或解除关联。 |
| `GET` | `/admin/authorization-audits?project_id={project_id}` | 项目审计页数据。 |

创建、编辑、激活、归档、成员关系和资产关联写请求均带 `Idempotency-Key`。竞争资源写请求同时使用 `If-Match: <revision>`；新增资产关联还在 JSON 中发送 `expected_revision`。服务端应将两种修订表达视为同一并发检查。

API 客户端把响应归一为四类错误：`not-ready`、`unauthorized`、`forbidden`、`revision-conflict` 和 `service`。成功后才刷新页面数据；失败、冲突、网络错误或 `503` 只显示错误，不显示本地成功。`409 REVISION_CONFLICT` 需要用户重新读取后再次提交；不存在自动覆盖或本地 fallback。

## 服务端实现要求

- 角色只有 `admin`、`manager`、`member`。`manager` 的项目查询和写入自动限制在有效组织；`member` 对后台项目接口无数据或返回 `403/404`，不得泄露资源存在性。
- 项目属于单一组织，`organization_id` 创建后不可迁移。名称去除首尾空白后为 1-80 个字符，同一组织的 `draft`/`active` 名称大小写不敏感唯一，归档名称保留且不能复用。
- 归档项目拒绝编辑、成员写入和资产关联写入。成员目标必须属于项目组织、账号 active 且全局角色为 `member`。
- 资产关联不能扩大资产自身权限；写入前同时校验项目治理权限、资产模块管理权限、资产可见范围和组织兼容性。
- 相同资源、相同幂等键和相同请求内容必须重放第一次结果，包括失败结果；同键不同内容返回 `409 IDEMPOTENCY_CONFLICT`。
- 过期 `If-Match`/`expected_revision` 返回 `409 REVISION_CONFLICT`，不得覆盖并发修改，不得部分提交。
- 项目创建、编辑、激活、归档、成员变更、资产关联变更和权限拒绝必须审计；审计不得保存密码、Token、Cookie、Prompt、代码正文、本机路径或完整请求体。

生产审计接口还应支持 `from`、`to`、`actor_user_id`、`action`、`result`、`page_size`、`page_token` 和 `sort`。当前页面只发送 `project_id`，项目列表也没有分页控件；这不代表生产接口可以省略游标分页和服务端范围过滤。

## 本地 HTTP 联调

内存服务位于原 DeepSeek Harness 仓库 `apps/team-skill-service`，默认监听 `http://127.0.0.1:4100`，健康检查为 `/health`。在原仓库根目录开一个终端：

```sh
pnpm --filter @deepseek-ai/team-skill-service dev
```

在另一个终端设置 `TEAM_SKILL_SERVICE_URL` 后启动后台。夹具提供 `admin@example.com`、`manager@example.com`、`member@example.com` 等测试账号和项目种子数据；真实后端联调时请改用后端提供的账号与 Token，不要把夹具密码或内存状态当成生产契约。

验证命令：

```sh
pnpm --filter @deepseek-ai/team-skill-admin test
pnpm exec tsc -p apps/team-skill-admin/tsconfig.json --noEmit
pnpm --filter @deepseek-ai/team-skill-admin build
```

验收至少覆盖：admin 创建并激活项目、manager 组织范围、member 无管理数据、成员撤权、项目归档只读、资产双重鉴权、`401/403/404/503`、修订冲突、幂等重放，以及桌面和 390x844 浏览器页面无旧缓存泄露。

## 交付边界

本目录不包含 `apps/team-skill-service`、数据库 schema、OIDC provider、对象存储、生产部署配置或未开发模块。后端实现应以项目管理 API 需求文档为唯一接口来源，并用真实 HTTP 服务替换内存夹具后重新运行上述测试和浏览器验收。
