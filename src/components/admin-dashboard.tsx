'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { Activity, BookOpen, Building2, CheckCircle2, ChevronDown, Database, FilePenLine, FolderKanban, KeyRound, Library, Plus, RefreshCw, Rocket, Save, ScrollText, ShieldCheck, TriangleAlert, Upload, Users, UserRound, SlidersHorizontal, ScrollText as AuditIcon } from 'lucide-react'
import { TeamSkillApi, type ApiError, type ApiResult } from '../lib/team-skill-api.ts'
import type { AccountRole, AdminKnowledgeBase, AdminKnowledgeDocument, AdminMemoryAudit, AdminMemoryJob, AdminMemoryPolicy, AdminMemoryRecord, AdminOrganization, AdminProject, AdminProjectAsset, AdminProjectMember, AdminUser, AuthorizationAudit, AuditLogEntry, DirectoryUser, PermissionDefinition, ReviewItem, RoleDefinition, SkillVersion, TeamSkill, TelemetryBucket, TelemetryEventItem, TelemetryEventPage, TelemetryModelUsage, TelemetryOverview, TelemetryProjectSummary, TelemetrySummary, TelemetryToolUsage } from '../lib/team-skill-types.ts'

type PageId = 'directory' | 'drafts' | 'reviews' | 'releases' | 'audit' | 'knowledge-bases' | 'memory-library' | 'projects' | 'account-users' | 'account-organizations' | 'account-roles' | 'account-projects' | 'account-audit' | 'telemetry-overview' | 'telemetry-project' | 'telemetry-events'
type NavGroup = 'skills' | 'memory' | 'projects' | 'permissions' | 'telemetry'
type Loaded =
  | { readonly page: PageId; readonly state: 'loading' }
  | {
    readonly page: PageId
    readonly state: 'ready'
    readonly value: readonly unknown[]
  }
  | {
    readonly page: PageId
    readonly state: 'error'
    readonly error: ApiError
  }
type NavIcon = typeof Library
type NavItem = {
  readonly id: PageId
  readonly label: string
  readonly hint: string
  readonly icon: NavIcon
}
type FutureNavItem = {
  readonly label: string
  readonly hint: string
  readonly icon: NavIcon
}
export interface DashboardSession {
  readonly user: {
    readonly id: string
    readonly name?: string | null
    readonly email?: string | null
  }
  readonly role: AccountRole
  readonly mustChangePassword: boolean
}

const NAV: readonly NavItem[] = [
  { id: 'directory', label: 'Skill 目录', hint: '资产与版本', icon: Library },
  { id: 'drafts', label: '我的草稿', hint: '创建与提交', icon: FilePenLine },
  { id: 'reviews', label: '审核队列', hint: '结构化审核', icon: ShieldCheck },
  { id: 'releases', label: '发布管理', hint: '发布与回滚', icon: Rocket },
  { id: 'audit', label: '审计日志', hint: '管理员可见', icon: ScrollText },
]
const FUTURE_NAV: readonly FutureNavItem[] = []
const KNOWLEDGE_NAV: readonly NavItem[] = [
  {
    id: 'knowledge-bases',
    label: '知识库',
    hint: '文档、FAQ 与 Wiki',
    icon: BookOpen,
  },
]
const MEMORY_NAV: readonly NavItem[] = [
  {
    id: 'memory-library',
    label: '记忆列表、策略、任务与审计',
    hint: '项目团队记忆治理',
    icon: Database,
  },
]

const PROJECT_NAV: readonly NavItem[] = [
  {
    id: 'projects',
    label: '项目列表',
    hint: '项目资源与生命周期',
    icon: FolderKanban,
  },
]

const PERMISSION_NAV: readonly NavItem[] = [
  {
    id: 'account-users',
    label: '用户与成员',
    hint: '账号与组织关系',
    icon: UserRound,
  },
  {
    id: 'account-organizations',
    label: '组织管理',
    hint: '组织生命周期与经理绑定',
    icon: Building2,
  },
  {
    id: 'account-roles',
    label: '角色与权限',
    hint: '服务端固定矩阵',
    icon: KeyRound,
  },
  {
    id: 'account-projects',
    label: '项目授权',
    hint: '项目成员关系',
    icon: SlidersHorizontal,
  },
  {
    id: 'account-audit',
    label: '授权审计',
    hint: '账号与授权事件',
    icon: AuditIcon,
  },
]

const TELEMETRY_NAV: readonly NavItem[] = [
  {
    id: 'telemetry-overview',
    label: '总览',
    hint: '运行与采集管道聚合',
    icon: Activity,
  },
  {
    id: 'telemetry-project',
    label: '项目详情',
    hint: '单项目运行、Token 与工具',
    icon: FolderKanban,
  },
  {
    id: 'telemetry-events',
    label: '事件诊断',
    hint: '结构化事件与数据缺口',
    icon: ScrollText,
  },
]

/** Login form used by the server-rendered authentication gate. */
export function AdminLoginPage({ clearStaleSession = false }: { readonly clearStaleSession?: boolean } = {}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    if (!clearStaleSession) return
    // A failed cleanup leaves the page safe; submitting credentials still replaces the cookie.
    void Promise.resolve(signOut({ redirect: false })).catch(() => undefined)
  }, [clearStaleSession])
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    })
    setBusy(false)
    if (result.error !== undefined) {
      setError('用户名或密码错误')
      return
    }
    window.location.reload()
  }
  return <AuthPage title="登录团队 Skill 管理后台" description="使用服务端账号登录后才能查看组织、账号和 Skill 数据。" onSubmit={submit} error={error} busy={busy} username={username} password={password} onUsername={setUsername} onPassword={setPassword} submitLabel="登录" />
}

/** First-login password change gate; the service never exposes the new password again. */
export function AdminPasswordChangePage({ username }: { readonly username: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/team-skill/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      if (!response.ok) {
        setError('密码修改失败，请检查当前密码和新密码')
        setBusy(false)
        return
      }
      const result = await signIn('credentials', {
        username,
        password: newPassword,
        redirect: false,
      })
      if (result.error !== undefined) {
        setError('密码已修改，但重新登录失败')
        setBusy(false)
        return
      }
      window.location.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法连接账号服务')
      setBusy(false)
    }
  }
  return (
    <AuthPage
      title="首次登录，请修改密码"
      description="初始密码只能使用一次。修改成功后才能进入管理后台。"
      onSubmit={submit}
      error={error}
      busy={busy}
      username={username}
      password={currentPassword}
      onUsername={() => undefined}
      onPassword={setCurrentPassword}
      submitLabel="修改密码"
      extra={
        <>
          <label>
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value)
              }}
              minLength={8}
              required
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value)
              }}
              minLength={8}
              required
            />
          </label>
        </>
      }
    />
  )
}

function AuthPage({
  title,
  description,
  onSubmit,
  error,
  busy,
  username,
  password,
  onUsername,
  onPassword,
  submitLabel,
  extra,
}: {
  readonly title: string
  readonly description: string
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>
  readonly error?: string
  readonly busy: boolean
  readonly username: string
  readonly password: string
  readonly onUsername: (value: string) => void
  readonly onPassword: (value: string) => void
  readonly submitLabel: string
  readonly extra?: React.ReactNode
}) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <span className="eyebrow">AI 开放平台 / 账号安全</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <form className="auth-form" onSubmit={event => void onSubmit(event)}>
          <label>
            用户名或邮箱
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => {
                onUsername(event.target.value)
              }}
              disabled={busy}
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                onPassword(event.target.value)
              }}
              disabled={busy}
              required
            />
          </label>
          {extra}
          {error !== undefined && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? '正在处理…' : submitLabel}
          </button>
        </form>
      </section>
    </main>
  )
}

/** Skill governance console backed by the Skill REST API with mutually exclusive primary navigation groups. */
export function AdminDashboard({ session }: { readonly session?: DashboardSession } = {}) {
  const effectiveRole: AccountRole = session?.role ?? 'admin'
  const canManagePermissions = effectiveRole !== 'member'
  const canManageKnowledge = effectiveRole !== 'member'
  const canViewTelemetry = effectiveRole !== 'member'
  const [page, setPage] = useState<PageId>('directory')
  const [routeRevision, setRouteRevision] = useState(0)
  const [expandedGroup, setExpandedGroup] = useState<NavGroup>('skills')
  const [loaded, setLoaded] = useState<Loaded>({
    page: 'directory',
    state: 'loading',
  })
  const [selectedSkill, setSelectedSkill] = useState<TeamSkill | undefined>()
  const [actionMessage, setActionMessage] = useState<string | undefined>()
  const requestSequence = useRef(0)
  const api = useMemo(
    () =>
      new TeamSkillApi({
        baseUrl: session === undefined ? process.env.NEXT_PUBLIC_TEAM_SKILL_API_URL : '/api/team-skill',
        sessionAuth: true,
      }),
    [session],
  )

  const reload = async (showLoading = true): Promise<void> => {
    const sequence = ++requestSequence.current
    const requestedPage = page
    if (showLoading) setLoaded({ page, state: 'loading' })
    const result = await loadPage(api, page, effectiveRole)
    if (sequence !== requestSequence.current || requestedPage !== page) return
    if (result.ok) setLoaded({ page, state: 'ready', value: result.value })
    else if (result.error.kind === 'unauthorized' && session !== undefined) await signOut({ redirect: true, redirectTo: '/' })
    else setLoaded({ page, state: 'error', error: result.error })
  }

  useEffect(() => {
    void reload()
  }, [page])
  useEffect(() => {
    const route = readAdminRoute()
    setPage(route.page)
    setExpandedGroup(route.page === 'projects' ? 'projects' : route.page === 'memory-library' ? 'memory' : route.page.startsWith('telemetry-') ? 'telemetry' : 'skills')
    setRouteRevision(value => value + 1)
  }, [])
  useEffect(() => {
    const onPopState = (): void => {
      const route = readAdminRoute()
      setPage(route.page)
      setRouteRevision(value => value + 1)
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const selectPage = (next: PageId): void => {
    requestSequence.current += 1
    setActionMessage(undefined)
    if (next === 'projects') navigateProjectRoute()
    setPage(next)
  }
  const showAction = (result: ApiResult<unknown>, success: string): void => {
    if (result.ok) {
      setActionMessage(success)
      if (page !== 'memory-library') void reload(false)
    } else if (result.error.kind === 'unauthorized' && session !== undefined) {
      void signOut({ redirect: true, redirectTo: '/' })
    } else setActionMessage(errorMessage(result.error))
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="brand-mark">AO</span>
          <div>
            <strong>AI 开放平台</strong>
            <small>团队 Skill 管理</small>
          </div>
        </div>
        <div className="admin-role">
          <span className="role-dot" />
          管理员视角
        </div>
        <nav aria-label="管理后台导航">
          <section className="nav-group" aria-labelledby="skill-nav-heading">
            <button
              type="button"
              className="nav-group-heading"
              id="skill-nav-heading"
              aria-expanded={expandedGroup === 'skills'}
              aria-controls="skill-nav-subitems"
              onClick={() => {
                setExpandedGroup('skills')
              }}
            >
              <Library size={17} aria-hidden="true" />
              <span>
                <strong>Skill 管理</strong>
                <small>目录、版本与治理</small>
              </span>
              <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
            </button>
            {expandedGroup === 'skills' && (
              <div className="nav-subitems" id="skill-nav-subitems" aria-label="Skill 管理子导航">
                {NAV.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={item.id === page ? 'nav-link active' : 'nav-link'}
                      aria-current={item.id === page ? 'page' : undefined}
                      onClick={() => {
                        selectPage(item.id)
                      }}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
          {session === undefined && (
            <div className="nav-future" aria-label="其他管理模块">
              <button type="button" className="nav-module" disabled>
                <FolderKanban size={17} aria-hidden="true" />
                <span>
                  <strong>项目管理</strong>
                  <small>即将开放</small>
                </span>
              </button>
              <button type="button" className="nav-module" disabled>
                <KeyRound size={17} aria-hidden="true" />
                <span>
                  <strong>权限管理</strong>
                  <small>即将开放</small>
                </span>
              </button>
              <button type="button" className="nav-module" disabled>
                <BookOpen size={17} aria-hidden="true" />
                <span>
                  <strong>知识库管理</strong>
                  <small>登录后可用</small>
                </span>
              </button>
              {FUTURE_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <button type="button" key={item.label} className="nav-module" disabled>
                    <Icon size={17} aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {session !== undefined && (
            <>
              <section className="nav-group knowledge-nav" aria-labelledby="knowledge-nav-heading">
                <button
                  type="button"
                  className="nav-group-heading"
                  id="knowledge-nav-heading"
                  aria-expanded={expandedGroup === 'skills'}
                  aria-controls="knowledge-nav-subitems"
                  onClick={() => {
                    setExpandedGroup('skills')
                  }}
                >
                  <BookOpen size={17} aria-hidden="true" />
                  <span>
                    <strong>知识库管理</strong>
                    <small>文档、FAQ 与 Wiki</small>
                  </span>
                  <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
                </button>
                {canManageKnowledge && expandedGroup === 'skills' && (
                  <div className="nav-subitems" id="knowledge-nav-subitems" aria-label="知识库管理子导航">
                    {KNOWLEDGE_NAV.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={item.id === page ? 'nav-link active' : 'nav-link'}
                          aria-current={item.id === page ? 'page' : undefined}
                          onClick={() => {
                            selectPage(item.id)
                          }}
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.hint}</small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
              {canManageKnowledge && (
                <section className="nav-group memory-nav" aria-labelledby="memory-nav-heading">
                  <button
                    type="button"
                    className="nav-group-heading"
                    id="memory-nav-heading"
                    aria-expanded={expandedGroup === 'memory'}
                    aria-controls="memory-nav-subitems"
                    onClick={() => {
                      setExpandedGroup('memory')
                    }}
                  >
                    <Database size={17} aria-hidden="true" />
                    <span>
                      <strong>记忆库管理</strong>
                      <small>项目团队记忆治理</small>
                    </span>
                    <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
                  </button>
                  {expandedGroup === 'memory' && (
                    <div className="nav-subitems" id="memory-nav-subitems" aria-label="记忆库管理子导航">
                      {MEMORY_NAV.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={item.id === page ? 'nav-link active' : 'nav-link'}
                            aria-current={item.id === page ? 'page' : undefined}
                            onClick={() => {
                              selectPage(item.id)
                            }}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.hint}</small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
              {canManagePermissions && (
                <section className="nav-group project-nav" aria-labelledby="project-nav-heading">
                  <button
                    type="button"
                    className="nav-group-heading"
                    id="project-nav-heading"
                    aria-expanded={expandedGroup === 'projects'}
                    aria-controls="project-nav-subitems"
                    onClick={() => {
                      setExpandedGroup('projects')
                    }}
                  >
                    <FolderKanban size={17} aria-hidden="true" />
                    <span>
                      <strong>项目管理</strong>
                      <small>项目资源与生命周期</small>
                    </span>
                    <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
                  </button>
                  {expandedGroup === 'projects' && (
                    <div className="nav-subitems" id="project-nav-subitems" aria-label="项目管理子导航">
                      {PROJECT_NAV.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={item.id === page ? 'nav-link active' : 'nav-link'}
                            aria-current={item.id === page ? 'page' : undefined}
                            onClick={() => {
                              selectPage(item.id)
                            }}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.hint}</small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
              {canViewTelemetry && (
                <section className="nav-group telemetry-nav" aria-labelledby="telemetry-nav-heading">
                  <button
                    type="button"
                    className="nav-group-heading"
                    id="telemetry-nav-heading"
                    aria-expanded={expandedGroup === 'telemetry'}
                    aria-controls="telemetry-nav-subitems"
                    onClick={() => {
                      setExpandedGroup('telemetry')
                    }}
                  >
                    <Activity size={17} aria-hidden="true" />
                    <span>
                      <strong>AI Coding 可观测</strong>
                      <small>运行、Token 与采集管道</small>
                    </span>
                    <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
                  </button>
                  {expandedGroup === 'telemetry' && (
                    <div className="nav-subitems" id="telemetry-nav-subitems" aria-label="AI Coding 可观测子导航">
                      {TELEMETRY_NAV.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={item.id === page ? 'nav-link active' : 'nav-link'}
                            aria-current={item.id === page ? 'page' : undefined}
                            onClick={() => {
                              selectPage(item.id)
                            }}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.hint}</small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
              {canManagePermissions && (
                <section className="nav-group permission-nav" aria-labelledby="permission-nav-heading">
                  <button
                    type="button"
                    className="nav-group-heading"
                    id="permission-nav-heading"
                    aria-expanded={expandedGroup === 'permissions'}
                    aria-controls="permission-nav-subitems"
                    onClick={() => {
                      setExpandedGroup('permissions')
                    }}
                  >
                    <KeyRound size={17} aria-hidden="true" />
                    <span>
                      <strong>权限管理</strong>
                      <small>账号、角色与项目授权</small>
                    </span>
                    <ChevronDown className="nav-group-chevron" size={16} aria-hidden="true" />
                  </button>
                  {expandedGroup === 'permissions' && (
                    <div className="nav-subitems" id="permission-nav-subitems" aria-label="权限管理子导航">
                      {PERMISSION_NAV.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={item.id === page ? 'nav-link active' : 'nav-link'}
                            aria-current={item.id === page ? 'page' : undefined}
                            onClick={() => {
                              selectPage(item.id)
                            }}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.hint}</small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
              <div className="nav-future" aria-label="其他管理模块">
                {FUTURE_NAV.map((item) => {
                  const Icon = item.icon
                  return (
                    <button type="button" key={item.label} className="nav-module" disabled>
                      <Icon size={17} aria-hidden="true" />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <span>服务端权威状态</span>
          <strong>Auth.js Session</strong>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <span className="crumb">团队治理 / {page === 'projects' ? '项目管理' : page === 'knowledge-bases' ? '知识库管理' : page === 'memory-library' ? '记忆库管理' : page.startsWith('telemetry-') ? 'AI Coding 可观测' : page.startsWith('account-') ? '权限管理' : 'Skill 管理'}</span>
            <h1>{page === 'projects' ? '项目管理' : pageLabel(page)}</h1>
          </div>
          <div className="header-actions">
            <span className="identity">
              {session?.user.name ?? session?.user.email ?? '管理员'} · {roleLabel(effectiveRole)}
            </span>
            <button className="icon-button" title="刷新当前页面" onClick={() => void reload()}>
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        {actionMessage !== undefined && (
          <div className="action-message" role="status">
            {actionMessage}
          </div>
        )}
        {(loaded.page !== page || loaded.state === 'loading') && <Loading />}
        {loaded.page === page && loaded.state === 'error' && <ErrorState error={loaded.error} onRetry={() => void reload()} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'directory' && <DirectoryPage items={loaded.value as TeamSkill[]} selected={selectedSkill} onSelect={setSelectedSkill} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'drafts' && <DraftsPage items={loaded.value as TeamSkill[]} api={api} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'reviews' && <ReviewsPage items={loaded.value as ReviewItem[]} api={api} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'releases' && <ReleasesPage items={loaded.value as TeamSkill[]} api={api} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'audit' && <AuditPage items={loaded.value as AuditLogEntry[]} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'knowledge-bases' && <KnowledgeBasesPage items={loaded.value as AdminKnowledgeBase[]} api={api} role={effectiveRole} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'memory-library' && <MemoryLibraryPage items={loaded.value as AdminMemoryRecord[]} api={api} role={effectiveRole} userId={session?.user.id} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-users' && <UsersPage items={loaded.value as AdminUser[]} api={api} role={effectiveRole} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-organizations' && <OrganizationManagementPage items={loaded.value as AdminOrganization[]} api={api} role={effectiveRole} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-roles' && <RolesPage api={api} role={effectiveRole} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-projects' && <ProjectsPage items={loaded.value as AdminProject[]} api={api} role={effectiveRole} onAction={showAction} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'projects' && <ProjectManagementPage key={routeRevision} items={loaded.value as AdminProject[]} api={api} role={effectiveRole} onAction={showAction} route={readAdminRoute()} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-audit' && <AuthorizationAuditPage items={loaded.value as AuthorizationAudit[]} api={api} role={effectiveRole} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'telemetry-overview' && <TelemetryOverviewPage api={api} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'telemetry-project' && <TelemetryProjectPage api={api} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'telemetry-events' && <TelemetryEventsPage api={api} />}
      </main>
    </div>
  )
}

type ProjectTab = 'overview' | 'members' | 'assets' | 'audit'
type AdminRoute = {
  readonly page: PageId
  readonly projectId?: string
  readonly tab?: ProjectTab
}

function readAdminRoute(): AdminRoute {
  if (typeof window === 'undefined') return { page: 'directory' }
  const pathname = window.location.pathname.replace(/\/$/u, '') || '/'
  if (pathname === '/projects') return { page: 'projects' }
  if (pathname.startsWith('/projects/')) {
    const projectId = decodeURIComponent(pathname.slice('/projects/'.length))
    const tab = parseProjectTab(new URLSearchParams(window.location.search).get('tab'))
    return projectId.length === 0 ? { page: 'projects' } : { page: 'projects', projectId, ...(tab === undefined ? {} : { tab }) }
  }
  if (pathname === '/knowledge-bases' || pathname.startsWith('/knowledge-bases/')) return { page: 'knowledge-bases' }
  return { page: 'directory' }
}

function parseProjectTab(value: string | null): ProjectTab | undefined {
  return value === 'overview' || value === 'members' || value === 'assets' || value === 'audit' ? value : undefined
}
function navigateProjectRoute(projectId?: string, tab: ProjectTab = 'overview'): void {
  if (typeof window === 'undefined') return
  const path = projectId === undefined ? '/projects' : `/projects/${encodeURIComponent(projectId)}`
  const query = projectId !== undefined && tab !== 'overview' ? `?tab=${encodeURIComponent(tab)}` : ''
  const next = `${path}${query}`
  if (`${window.location.pathname}${window.location.search}` !== next) window.history.pushState({}, '', next)
}

async function loadPage(api: TeamSkillApi, page: PageId, role: AccountRole): Promise<ApiResult<readonly unknown[]>> {
  if (page === 'directory' || page === 'drafts' || page === 'releases') return api.listSkills()
  if (page === 'reviews') return api.listReviews()
  if (page === 'audit') return api.listAuditLogs()
  if (page === 'knowledge-bases') return api.listKnowledgeBases()
  if (page === 'memory-library' && role === 'member')
    return Promise.resolve({
      ok: false,
      error: {
        kind: 'forbidden',
        code: 'MEMORY_ADMIN_FORBIDDEN',
        message: '成员不能访问后台记忆库治理',
      },
    })
  if (page === 'memory-library') return Promise.resolve({ ok: true, value: [] })
  if (page.startsWith('telemetry-') && role === 'member')
    return Promise.resolve({
      ok: false,
      error: {
        kind: 'forbidden',
        code: 'ROLE_FORBIDDEN',
        message: '成员角色不开放团队可观测页面',
      },
    })
  if (page.startsWith('telemetry-')) return Promise.resolve({ ok: true, value: [] })
  if (page === 'account-users') return api.listUsers()
  if (page === 'account-organizations') return api.listOrganizations()
  if (page === 'account-projects') {
    return Promise.all([api.listProjects(), api.listProjects({ status: 'archived' })]).then(([active, archived]) => {
      if (!active.ok) return active
      if (!archived.ok) return archived
      const rows = new Map(active.value.map(item => [item.project_id, item]))
      for (const item of archived.value) rows.set(item.project_id, item)
      return { ok: true, value: [...rows.values()] }
    })
  }
  if (page === 'projects') return api.listProjects()
  if (page === 'account-audit') return api.listAuthorizationAudits()
  return api.listRoles()
}

function pageLabel(page: PageId): string {
  return [...NAV, ...KNOWLEDGE_NAV, ...MEMORY_NAV, ...PROJECT_NAV, ...PERMISSION_NAV, ...TELEMETRY_NAV].find(item => item.id === page)?.label ?? (page === 'memory-library' ? '记忆列表、策略、任务与审计' : '管理后台')
}
function roleLabel(role: AccountRole): string {
  return role === 'admin' ? '平台管理员' : role === 'manager' ? '组织经理' : '成员'
}

function roleScopeLabel(scope: string): string {
  return scope === 'platform' ? '平台' : scope === 'organization' ? '组织' : scope === 'assigned' ? '已分配资源' : scope
}

function roleDescription(role: AccountRole, description: string): string {
  if (description.trim().length > 0) return description
  return role === 'admin' ? '管理平台全部组织、账号和项目' : role === 'manager' ? '管理自己组织内的账号和项目' : '使用被分配的组织、项目和资源'
}

function projectStatusLabel(status: AdminProject['status']): string {
  return status === 'draft' ? '草稿' : status === 'active' ? '正常' : '已归档'
}

function permissionKeyLabel(key: string): string {
  return key === 'organization.read'
    ? '组织查看'
    : key === 'user.manage'
      ? '账号与成员管理'
      : key === 'project.manage'
        ? '项目管理'
        : key === 'authorization_audit.read'
          ? '授权审计查看'
          : key
}

function UsersPage({
  items,
  api,
  role,
  onAction,
}: {
  readonly items: readonly AdminUser[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [organizations, setOrganizations] = useState<readonly AdminOrganization[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [newRole, setNewRole] = useState<'manager' | 'member'>('member')
  const [busyId, setBusyId] = useState<string | undefined>()
  const [initialPassword, setInitialPassword] = useState<string | undefined>()
  const [membershipTargets, setMembershipTargets] = useState<Record<string, string | undefined>>({})
  const [askConfirmation, confirmationDialog] = useConfirmDialog()

  useEffect(() => {
    void api.listOrganizations().then((result) => {
      if (result.ok) {
        setOrganizations(result.value)
        if (organizationId.length === 0 && result.value.length > 0) setOrganizationId(result.value[0].organization_id)
      } else onAction(result, '读取组织失败')
    })
  }, [api, onAction, organizationId.length])
  const visible =
    organizationId.length === 0
      ? items
      : items.filter(item => item.memberships?.some(membership => membership.organization_id === organizationId))
  const create = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (organizationId.length === 0) return
    setBusyId('create')
    setInitialPassword(undefined)
    const result = await api.createUser(
      {
        username: username.trim(),
        displayName: displayName.trim(),
        organizationIds: [organizationId],
        globalRole: newRole,
      },
      crypto.randomUUID(),
    )
    setBusyId(undefined)
    if (result.ok) {
      setUsername('')
      setDisplayName('')
      setInitialPassword(result.value.initial_password)
    }
    onAction(result, '账号已创建')
  }
  const updateStatus = async (user: AdminUser): Promise<void> => {
    const next = user.status === 'active' ? 'suspended' : 'active'
    if (
      !(await askConfirmation({
        title: '确认账号操作',
        message: `${next === 'suspended' ? '停用' : '恢复'}账号 ${user.display_name}？`,
      }))
    )
      return
    setBusyId(user.user_id)
    const result = await api.updateUser(user.user_id, { status: next }, user.revision, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, next === 'suspended' ? '账号已停用' : '账号已恢复')
  }
  const removeMembership = async (user: AdminUser, membership: NonNullable<AdminUser['memberships']>[number]): Promise<void> => {
    if (
      !(await askConfirmation({
        title: '确认成员操作',
        message: `从 ${membership.organization_name} 移除 ${user.display_name}？`,
      }))
    )
      return
    setBusyId(`${user.user_id}-${membership.organization_id}`)
    const result = await api.removeMembership(membership.organization_id, user.user_id, membership.revision, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, '成员关系已移除')
  }
  const renameUser = async (user: AdminUser): Promise<void> => {
    const next = window.prompt('新的显示名称', user.display_name)
    if (next === null || next.trim().length === 0 || next.trim() === user.display_name) return
    setBusyId(`${user.user_id}-rename`)
    const result = await api.updateUser(user.user_id, { displayName: next.trim() }, user.revision, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, '显示名已更新')
  }
  const addMembership = async (user: AdminUser): Promise<void> => {
    const target = membershipTargets[user.user_id]
    if (target === undefined || target.length === 0) return
    setBusyId(`${user.user_id}-join`)
    const result = await api.setMembership(target, user.user_id, undefined, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, '成员关系已新增')
  }
  return (
    <>
      <section className="page-body">
        <div className="page-intro">
          <div>
            <span className="eyebrow">权限管理 / 账号</span>
            <h2>用户与成员</h2>
            <p>账号只有一个全局角色，组织成员关系只记录归属和状态。</p>
          </div>
          <span className="count-badge">{visible.length} 个账号</span>
        </div>
        <div className="account-toolbar">
          <label>
            组织
            <select
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value)
              }}
            >
              <option value="">全部可见组织</option>
              {organizations.map(item => (
                <option key={item.organization_id} value={item.organization_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <form className="inline-create" onSubmit={event => void create(event)}>
            <input
              aria-label="新账号用户名"
              placeholder="新账号邮箱"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
              }}
              required
            />
            <input
              aria-label="新账号显示名"
              placeholder="显示名称"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
              }}
              required
            />
            <select
              aria-label="新账号角色"
              value={newRole}
              onChange={(event) => {
                setNewRole(event.target.value as 'manager' | 'member')
              }}
            >
              <option value="member">member</option>
              {role === 'admin' && <option value="manager">manager</option>}
            </select>
            <button className="button primary" disabled={busyId === 'create' || organizationId.length === 0}>
              <Plus size={14} />
              创建账号
            </button>
          </form>
        </div>
        {initialPassword !== undefined && (
          <div className="one-time-secret" role="status">
            <strong>一次性初始密码</strong>
            <code>{initialPassword}</code>
            <span>只显示这一次，请通过安全渠道交付。</span>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>账号</th>
                <th>全局角色 / 组织</th>
                <th>状态</th>
                <th>修订</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(user => (
                <tr key={user.user_id}>
                  <td>
                    <strong>{user.display_name}</strong>
                    <small>{user.username}</small>
                  </td>
                  <td>
                    <strong>{user.global_role}</strong>
                    {user.memberships?.map(membership => (
                      <div className="membership-row" key={membership.organization_id}>
                        <span>
                          {membership.organization_name} · {membership.status === 'active' ? '正常' : '已停用'}
                        </span>
                        <button type="button" className="text-danger" onClick={() => void removeMembership(user, membership)}>
                          移除
                        </button>
                      </div>
                    )) ?? '未加入组织'}
                  </td>
                  <td>
                    <span className={`status status-${user.status}`}>{user.status === 'active' ? '正常' : '已停用'}</span>
                    {user.must_change_password && <small>待首次改密</small>}
                  </td>
                  <td className="revision">r{user.revision}</td>
                  <td>
                    <div className="membership-row">
                      <button type="button" className="button secondary" disabled={busyId === user.user_id} onClick={() => void updateStatus(user)}>
                        {user.status === 'active' ? '停用' : '恢复'}
                      </button>
                      <button type="button" className="button secondary" disabled={busyId === `${user.user_id}-rename`} onClick={() => void renameUser(user)}>
                        编辑显示名
                      </button>
                    </div>
                    <div className="membership-row">
                      <select
                        aria-label={`为 ${user.display_name} 新增组织`}
                        value={membershipTargets[user.user_id] ?? ''}
                        onChange={(event) => {
                          setMembershipTargets(current => ({
                            ...current,
                            [user.user_id]: event.target.value,
                          }))
                        }}
                      >
                        <option value="">选择组织</option>
                        {organizations
                          .filter(organization => !user.memberships?.some(item => item.organization_id === organization.organization_id))
                          .map(organization => (
                            <option key={organization.organization_id} value={organization.organization_id}>
                              {organization.name}
                            </option>
                          ))}
                      </select>
                      <button type="button" className="button secondary" disabled={(membershipTargets[user.user_id] ?? '').length === 0 || busyId === `${user.user_id}-join`} onClick={() => void addMembership(user)}>
                        新增组织成员
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <Empty text="当前范围没有可见账号" />}
        </div>
      </section>
      {confirmationDialog}
    </>
  )
}

/** Organization lifecycle, rename, archive and manager binding for platform administrators. */
function OrganizationManagementPage({
  items,
  api,
  role,
  onAction,
}: {
  readonly items: readonly AdminOrganization[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [name, setName] = useState('')
  const [managerUserId, setManagerUserId] = useState('')
  const [busyId, setBusyId] = useState<string | undefined>()
  const [managerTargets, setManagerTargets] = useState<Record<string, string | undefined>>({})
  const [managers, setManagers] = useState<readonly AdminUser[]>([])
  const [askConfirmation, confirmationDialog] = useConfirmDialog()
  const canManage = role === 'admin'

  useEffect(() => {
    void api.listUsers().then((result) => {
      if (result.ok) setManagers(result.value.filter(user => user.global_role === 'manager'))
      else onAction(result, '读取经理列表失败')
    })
  }, [api, onAction])

  const create = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (name.trim().length === 0) return
    setBusyId('create')
    const result = await api.createOrganization(name.trim(), managerUserId.length === 0 ? undefined : managerUserId, crypto.randomUUID())
    setBusyId(undefined)
    if (result.ok) {
      setName('')
      setManagerUserId('')
    }
    onAction(result, '组织已创建')
  }
  const rename = async (organization: AdminOrganization): Promise<void> => {
    const next = window.prompt('新的组织名称', organization.name)
    if (next === null || next.trim().length === 0 || next.trim() === organization.name) return
    setBusyId(organization.organization_id + '-rename')
    const result = await api.updateOrganization(
      organization.organization_id,
      { name: next.trim() },
      organization.revision,
      crypto.randomUUID(),
    )
    setBusyId(undefined)
    onAction(result, '组织名称已更新')
  }
  const setStatus = async (organization: AdminOrganization, status: 'active' | 'archived'): Promise<void> => {
    if (
      !(await askConfirmation({
        title: '确认组织操作',
        message: status === 'archived' ? '归档组织 ' + organization.name + '？' : '恢复组织 ' + organization.name + '？',
      }))
    )
      return
    setBusyId(organization.organization_id + '-status')
    const result = await api.updateOrganization(organization.organization_id, { status }, organization.revision, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, status === 'archived' ? '组织已归档' : '组织已恢复')
  }
  const bindManager = async (organization: AdminOrganization): Promise<void> => {
    const managerId = managerTargets[organization.organization_id]
    if (managerId === undefined || managerId.length === 0) return
    setBusyId(organization.organization_id + '-manager')
    const result = await api.setMembership(organization.organization_id, managerId, undefined, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, '经理已绑定到组织')
  }

  return (
    <>
      <section className="page-body">
        <div className="page-intro">
          <div>
            <span className="eyebrow">权限管理 / 组织</span>
            <h2>组织管理</h2>
            <p>组织生命周期与经理绑定由服务端 revision 和幂等键保护。</p>
          </div>
          <span className="count-badge">{items.length} 个组织</span>
        </div>
        {canManage ? (
          <form
            className="account-toolbar"
            onSubmit={(event) => {
              void create(event)
            }}
          >
            <input
              aria-label="新组织名称"
              placeholder="组织名称"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
              required
            />
            <select
              aria-label="新组织经理"
              value={managerUserId}
              onChange={(event) => {
                setManagerUserId(event.target.value)
              }}
            >
              <option value="">暂不绑定经理</option>
              {managers.map(manager => (
                <option key={manager.user_id} value={manager.user_id}>
                  {manager.display_name}
                </option>
              ))}
            </select>
            <button className="button primary" disabled={busyId === 'create' || name.trim().length === 0}>
              <Plus size={14} />
              创建组织
            </button>
          </form>
        ) : (
          <p className="page-hint">组织生命周期操作仅平台管理员可用。</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>组织</th>
                <th>状态</th>
                <th>修订</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(organization => (
                <tr key={organization.organization_id}>
                  <td>
                    <strong>{organization.name}</strong>
                    <small>{organization.organization_id}</small>
                  </td>
                  <td>
                    <span className={'status status-' + (organization.status === 'active' ? 'active' : 'archived')}>{organization.status === 'active' ? '正常' : '已归档'}</span>
                  </td>
                  <td className="revision">r{organization.revision}</td>
                  <td>
                    {canManage && (
                      <div className="membership-row">
                        <button type="button" className="button secondary" disabled={busyId === organization.organization_id + '-rename'} onClick={() => void rename(organization)}>
                          重命名
                        </button>
                        <button type="button" className="button secondary" disabled={busyId === organization.organization_id + '-status'} onClick={() => void setStatus(organization, organization.status === 'active' ? 'archived' : 'active')}>
                          {organization.status === 'active' ? '归档' : '恢复'}
                        </button>
                      </div>
                    )}
                    {canManage && (
                      <div className="membership-row">
                        <select
                          aria-label={'为 ' + organization.name + ' 绑定经理'}
                          value={managerTargets[organization.organization_id] ?? ''}
                          onChange={(event) => {
                            setManagerTargets(current => ({
                              ...current,
                              [organization.organization_id]: event.target.value,
                            }))
                          }}
                        >
                          <option value="">选择经理账号</option>
                          {managers
                            .filter(manager => !manager.memberships?.some(item => item.organization_id === organization.organization_id && item.status === 'active'))
                            .map(manager => (
                              <option key={manager.user_id} value={manager.user_id}>
                                {manager.display_name}
                              </option>
                            ))}
                        </select>
                        <button type="button" className="button secondary" disabled={(managerTargets[organization.organization_id] ?? '').length === 0 || busyId === organization.organization_id + '-manager'} onClick={() => void bindManager(organization)}>
                          绑定经理
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <Empty text="当前没有可见组织" />}
        </div>
      </section>
      {confirmationDialog}
    </>
  )
}

function RolesPage({ api, role }: { readonly api: TeamSkillApi; readonly role: AccountRole }) {
  const [roles, setRoles] = useState<readonly RoleDefinition[]>([])
  const [permissions, setPermissions] = useState<readonly PermissionDefinition[]>([])
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    void Promise.all([api.listRoles(), api.listPermissions()]).then(([roleResult, permissionResult]) => {
      if (!roleResult.ok || !permissionResult.ok) {
        setError('无法读取服务端角色字典')
        return
      }
      setRoles(roleResult.value)
      setPermissions(permissionResult.value)
    })
  }, [api])
  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">权限管理 / 角色</span>
          <h2>角色与权限</h2>
          <p>角色和权限矩阵只读展示服务端配置，当前登录角色：{roleLabel(role)}。</p>
        </div>
      </div>
      {error !== undefined ? (
        <section className="state-panel error">
          <TriangleAlert size={20} />
          <h2>{error}</h2>
        </section>
      ) : (
        <div className="role-layout">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>角色</th>
                  <th>作用域</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(item => (
                  <tr key={item.role}>
                    <td>
                      <strong>{roleLabel(item.role)}</strong>
                    </td>
                    <td>{roleScopeLabel(item.scope)}</td>
                    <td>{roleDescription(item.role, item.description)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>权限键</th>
                  <th>admin</th>
                  <th>manager</th>
                  <th>member</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map(item => (
                  <tr key={item.key}>
                    <td>
                      <code>{item.key}</code>
                      <small>{permissionKeyLabel(item.key)}</small>
                    </td>
                    <td>{permissionLabel(item.admin)}</td>
                    <td>{permissionLabel(item.manager)}</td>
                    <td>{permissionLabel(item.member)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function permissionLabel(value: boolean | 'organization'): string {
  return value === true ? '平台' : value === 'organization' ? '组织' : '无'
}

function ProjectManagementPage({
  items,
  api,
  role,
  onAction,
  route,
}: {
  readonly items: readonly AdminProject[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
  readonly route: AdminRoute
}) {
  const [organizations, setOrganizations] = useState<readonly AdminOrganization[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [filterOrganizationId, setFilterOrganizationId] = useState('')
  const [status, setStatus] = useState<'' | AdminProject['status']>('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(route.projectId)
  const [detail, setDetail] = useState<AdminProject | undefined>()
  const [tab, setTab] = useState<ProjectTab>(route.tab ?? 'overview')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [transitionAction, setTransitionAction] = useState<'activate' | 'archive'>()
  const [transitionBusy, setTransitionBusy] = useState(false)
  const [rows, setRows] = useState<readonly AdminProject[]>(items)
  const listGeneration = useRef(0)
  const detailGeneration = useRef(0)

  useEffect(() => {
    void api.listOrganizations().then((result) => {
      if (result.ok) {
        setOrganizations(result.value)
        if (organizationId.length === 0 && result.value.length > 0) setOrganizationId(result.value[0].organization_id)
      } else onAction(result, '读取组织失败')
    })
  }, [api, onAction, organizationId.length])
  useEffect(() => {
    setRows(items)
  }, [items])
  useEffect(() => {
    const generation = ++listGeneration.current
    const timer = window.setTimeout(() => {
      void api
        .listProjects({
          ...(filterOrganizationId.length === 0 ? {} : { organizationId: filterOrganizationId }),
          ...(status === '' ? {} : { status }),
          ...(query.trim().length === 0 ? {} : { name: query.trim() }),
        })
        .then((result) => {
          if (result.ok && generation === listGeneration.current) setRows(result.value)
        })
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [api, filterOrganizationId, query, status])
  useEffect(() => {
    const generation = ++detailGeneration.current
    if (selectedId === undefined) {
      setDetail(undefined)
      return
    }
    setLoadingDetail(true)
    void api.getProject(selectedId).then((result) => {
      if (generation !== detailGeneration.current) return
      setLoadingDetail(false)
      if (result.ok) {
        setDetail(result.value)
        setName(result.value.name)
        setDescription(result.value.description ?? '')
      } else onAction(result, '读取项目详情失败')
    })
  }, [api, items, onAction, selectedId])
  const create = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (organizationId.length === 0 || name.trim().length === 0) return
    setCreating(true)
    const result = await api.createProject({ organizationId, name: name.trim(), description: description.trim() }, crypto.randomUUID())
    setCreating(false)
    onAction(result, '项目草稿已创建')
    if (result.ok) {
      setSelectedId(result.value.project_id)
      setTab('overview')
      navigateProjectRoute(result.value.project_id)
    }
  }
  const filtered = rows
  const save = async (): Promise<void> => {
    if (detail === undefined) return
    const result = await api.updateProject(
      detail.project_id,
      { name: name.trim(), description: description.trim() },
      detail.revision,
      crypto.randomUUID(),
    )
    onAction(result, '项目已保存')
    if (result.ok) setDetail(result.value)
  }
  const transition = (action: 'activate' | 'archive'): void => {
    if (detail === undefined) return
    setTransitionAction(action)
  }
  const confirmTransition = async (): Promise<void> => {
    if (detail === undefined || transitionAction === undefined) return
    setTransitionBusy(true)
    const result = transitionAction === 'activate' ? await api.activateProject(detail.project_id, detail.revision, crypto.randomUUID()) : await api.archiveProject(detail.project_id, detail.revision, crypto.randomUUID())
    setTransitionBusy(false)
    setTransitionAction(undefined)
    onAction(result, transitionAction === 'activate' ? '项目已激活' : '项目已归档')
    if (result.ok) setDetail(result.value)
  }
  const selectProject = (projectId: string): void => {
    setSelectedId(projectId)
    setTab('overview')
    navigateProjectRoute(projectId)
  }
  const selectTab = (next: ProjectTab): void => {
    setTab(next)
    if (selectedId !== undefined) navigateProjectRoute(selectedId, next)
  }
  return (
    <>
      <section className="page-body">
        <div className="page-intro">
          <div>
            <span className="eyebrow">项目管理</span>
            <h2>项目列表</h2>
            <p>{roleLabel(role)}可在服务端授权范围内管理项目资源和生命周期。</p>
          </div>
          <span className="count-badge">{filtered.length} 个项目</span>
        </div>
        <div className="account-toolbar">
          <label>
            组织
            <select
              aria-label="项目组织筛选"
              value={filterOrganizationId}
              onChange={(event) => {
                setFilterOrganizationId(event.target.value)
              }}
            >
              <option value="">全部可见组织</option>
              {organizations.map(item => (
                <option key={item.organization_id} value={item.organization_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select
              aria-label="项目状态筛选"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | AdminProject['status'])
              }}
            >
              <option value="">默认：草稿和正常</option>
              <option value="draft">草稿</option>
              <option value="active">正常</option>
              <option value="archived">已归档</option>
            </select>
          </label>
          <label>
            名称
            <input
              aria-label="项目名称筛选"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              placeholder="搜索项目名称"
            />
          </label>
          <form className="inline-create" onSubmit={event => void create(event)}>
            <select
              aria-label="创建项目所属组织"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value)
              }}
            >
              {organizations.map(item => (
                <option key={item.organization_id} value={item.organization_id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              aria-label="项目名称"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
              }}
              placeholder="新项目名称"
              required
            />
            <input
              aria-label="项目描述"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
              }}
              placeholder="项目描述（可选）"
            />
            <button className="button primary" disabled={creating || organizationId.length === 0}>
              <Plus size={14} />
              创建项目
            </button>
          </form>
        </div>
        <div className="project-layout">
          <div className="project-list">
            {filtered.map(project => (
              <button
                type="button"
                key={project.project_id}
                className={project.project_id === selectedId ? 'project-row selected-project' : 'project-row'}
                onClick={() => {
                  selectProject(project.project_id)
                }}
              >
                <strong>{project.name}</strong>
                <small>
                  {project.organization_name ?? project.organization_id} · r{project.revision} · {project.updated_at === undefined ? '' : formatDate(project.updated_at)}
                </small>
                <span className={`status status-${project.status}`}>{projectStatusLabel(project.status)}</span>
              </button>
            ))}
            {filtered.length === 0 && <Empty text="当前筛选没有可见项目" />}
          </div>
          {selectedId !== undefined && (
            <div className="detail-panel project-detail-panel">
              {loadingDetail || detail === undefined ? (
                <Loading />
              ) : (
                <ProjectDetail
                  detail={detail}
                  tab={tab}
                  setTab={selectTab}
                  name={name}
                  description={description}
                  onName={setName}
                  onDescription={setDescription}
                  onSave={() => void save()}
                  onTransition={(action) => {
                    transition(action)
                  }}
                  api={api}
                  onAction={onAction}
                />
              )}
            </div>
          )}
        </div>
      </section>
      {transitionAction !== undefined && (
        <ConfirmDialog
          title="确认项目操作"
          message={transitionAction === 'activate' ? '确认激活该项目？' : '归档后项目不可恢复，确认归档？'}
          busy={transitionBusy}
          confirmLabel={transitionAction === 'activate' ? '确认激活' : '确认归档'}
          onCancel={() => {
            if (!transitionBusy) setTransitionAction(undefined)
          }}
          onConfirm={() => void confirmTransition()}
        />
      )}
    </>
  )
}

function ProjectDetail({
  detail,
  tab,
  setTab,
  name,
  description,
  onName,
  onDescription,
  onSave,
  onTransition,
  api,
  onAction,
}: {
  readonly detail: AdminProject
  readonly tab: 'overview' | 'members' | 'assets' | 'audit'
  readonly setTab: (tab: 'overview' | 'members' | 'assets' | 'audit') => void
  readonly name: string
  readonly description: string
  readonly onName: (value: string) => void
  readonly onDescription: (value: string) => void
  readonly onSave: () => void
  readonly onTransition: (action: 'activate' | 'archive') => void
  readonly api: TeamSkillApi
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  return (
    <>
      <div className="editor-heading">
        <div>
          <span className="eyebrow">项目详情</span>
          <h3>{detail.name}</h3>
        </div>
        <span className={`status status-${detail.status}`}>{detail.status}</span>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="项目详情页签">
        {(['overview', 'members', 'assets', 'audit'] as const).map(value => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? 'tab active' : 'tab'}
            key={value}
            onClick={() => {
              setTab(value)
            }}
          >
            {value === 'overview' ? '概览' : value === 'members' ? '成员' : value === 'assets' ? '资产关联' : '审计'}
          </button>
        ))}
      </div>
      {tab === 'overview' && <ProjectOverview detail={detail} name={name} description={description} onName={onName} onDescription={onDescription} onSave={onSave} onTransition={onTransition} />}
      {tab === 'members' && <ProjectMembersTab detail={detail} api={api} onAction={onAction} />}
      {tab === 'assets' && <ProjectAssetsTab detail={detail} api={api} onAction={onAction} />}
      {tab === 'audit' && <ProjectAuditTab detail={detail} api={api} />}
    </>
  )
}

function ProjectOverview({
  detail,
  name,
  description,
  onName,
  onDescription,
  onSave,
  onTransition,
}: {
  readonly detail: AdminProject
  readonly name: string
  readonly description: string
  readonly onName: (value: string) => void
  readonly onDescription: (value: string) => void
  readonly onSave: () => void
  readonly onTransition: (action: 'activate' | 'archive') => void
}) {
  const archived = detail.status === 'archived'
  return (
    <div className="project-overview">
      <label>
        当前项目名称
        <input
          aria-label="项目名称详情"
          value={name}
          disabled={archived}
          onChange={(event) => {
            onName(event.target.value)
          }}
        />
      </label>
      <label>
        项目描述
        <textarea
          value={description}
          disabled={archived}
          onChange={(event) => {
            onDescription(event.target.value)
          }}
        />
      </label>
      <dl>
        <div>
          <dt>所属组织</dt>
          <dd>{detail.organization_name ?? detail.organization_id}</dd>
        </div>
        <div>
          <dt>创建人</dt>
          <dd>{detail.created_by ?? '-'}</dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd>{detail.created_at === undefined ? '-' : formatDate(detail.created_at)}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>{detail.updated_at === undefined ? '-' : formatDate(detail.updated_at)}</dd>
        </div>
        <div>
          <dt>修订号</dt>
          <dd>r{detail.revision}</dd>
        </div>
        <div>
          <dt>成员 / 资产</dt>
          <dd>
            {detail.member_count ?? 0} / {detail.asset_count ?? 0}
          </dd>
        </div>
      </dl>
      {!archived && (
        <div className="review-actions">
          <button type="button" className="button secondary" onClick={onSave}>
            保存项目
          </button>
          {detail.status === 'draft' ? (
            <button
              type="button"
              className="button primary"
              onClick={() => {
                onTransition('activate')
              }}
            >
              激活项目
            </button>
          ) : (
            <button
              type="button"
              className="button danger"
              onClick={() => {
                onTransition('archive')
              }}
            >
              归档项目
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectMembersTab({
  detail,
  api,
  onAction,
}: {
  readonly detail: AdminProject
  readonly api: TeamSkillApi
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [members, setMembers] = useState<readonly AdminProjectMember[]>([])
  const [users, setUsers] = useState<readonly AdminUser[]>([])
  const [userId, setUserId] = useState('')
  const [askConfirmation, confirmationDialog] = useConfirmDialog()
  const loadGeneration = useRef(0)
  const load = async (): Promise<void> => {
    const generation = ++loadGeneration.current
    const [memberResult, userResult] = await Promise.all([api.listProjectMembers(detail.project_id), api.listUsers(detail.organization_id)])
    if (generation !== loadGeneration.current) return
    if (memberResult.ok) setMembers(memberResult.value)
    else onAction(memberResult, '读取项目成员失败')
    if (userResult.ok) setUsers(userResult.value)
    else onAction(userResult, '读取组织成员失败')
  }
  useEffect(() => {
    void load()
  }, [detail.project_id])
  const archived = detail.status === 'archived'
  const add = async (): Promise<void> => {
    if (userId.length === 0) return
    const existing = members.find(item => item.user_id === userId)
    const result = await api.setProjectMember(detail.project_id, userId, existing?.revision ?? detail.revision, crypto.randomUUID())
    onAction(result, '项目成员已授权')
    if (result.ok) {
      setUserId('')
      await load()
    }
  }
  const remove = async (member: AdminProjectMember): Promise<void> => {
    if (archived) return
    if (
      !(await askConfirmation({
        title: '确认项目成员操作',
        message: `移除 ${member.display_name}？`,
      }))
    )
      return
    const result = await api.removeProjectMember(detail.project_id, member.user_id, member.revision, crypto.randomUUID())
    onAction(result, '项目成员已移除')
    if (result.ok) await load()
  }
  return (
    <>
      <div className="project-tab">
        <h4>项目成员</h4>
        {!archived && (
          <div className="inline-create">
            <select
              aria-label="项目成员"
              value={userId}
              onChange={(event) => {
                setUserId(event.target.value)
              }}
            >
              <option value="">选择组织 member</option>
              {users
                .filter(user => user.global_role === 'member' && user.memberships?.some(item => item.organization_id === detail.organization_id) && !members.some(member => member.user_id === user.user_id && member.status === 'active'))
                .map(user => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.display_name} · {user.username}
                  </option>
                ))}
            </select>
            <button type="button" className="button primary" disabled={userId.length === 0} onClick={() => void add()}>
              <Users size={14} />
              添加成员
            </button>
          </div>
        )}
        <div className="member-list">
          {members
            .filter(member => member.status === 'active')
            .map(member => (
              <div className="member-row" key={member.user_id}>
                <span>
                  <strong>{member.display_name}</strong>
                  <small>
                    {member.joined_at === undefined ? '' : formatDate(member.joined_at)} · r{member.revision}
                  </small>
                </span>
                {!archived && (
                  <button type="button" className="text-danger" onClick={() => void remove(member)}>
                    移除
                  </button>
                )}
              </div>
            ))}
          {members.filter(member => member.status === 'active').length === 0 && <Empty text="暂无项目成员" />}
        </div>
      </div>
      {confirmationDialog}
    </>
  )
}

function ProjectAssetsTab({
  detail,
  api,
  onAction,
}: {
  readonly detail: AdminProject
  readonly api: TeamSkillApi
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [assets, setAssets] = useState<readonly AdminProjectAsset[]>([])
  const [assetType, setAssetType] = useState<AdminProjectAsset['asset_type']>('skill')
  const [assetId, setAssetId] = useState('')
  const [relation, setRelation] = useState<AdminProjectAsset['relation_kind']>('reference')
  const loadGeneration = useRef(0)
  const load = async (): Promise<void> => {
    const generation = ++loadGeneration.current
    const result = await api.listProjectAssets(detail.project_id)
    if (generation !== loadGeneration.current) return
    if (result.ok) setAssets(result.value)
    else onAction(result, '读取项目资产失败')
  }
  useEffect(() => {
    void load()
  }, [detail.project_id])
  const archived = detail.status === 'archived'
  const add = async (): Promise<void> => {
    if (assetId.trim().length === 0) return
    const result = await api.addProjectAsset(
      detail.project_id,
      {
        assetType,
        assetId: assetId.trim(),
        relationKind: relation,
        revision: detail.revision,
      },
      crypto.randomUUID(),
    )
    onAction(result, '资产关联已添加')
    if (result.ok) {
      setAssetId('')
      await load()
    }
  }
  const update = async (asset: AdminProjectAsset): Promise<void> => {
    const result = await api.updateProjectAsset(detail.project_id, asset.asset_type, asset.asset_id, asset.relation_kind === 'reference' ? 'context' : 'reference', asset.revision, crypto.randomUUID())
    onAction(result, '资产关系已更新')
    if (result.ok) await load()
  }
  const remove = async (asset: AdminProjectAsset): Promise<void> => {
    const result = await api.removeProjectAsset(detail.project_id, asset.asset_type, asset.asset_id, asset.revision, crypto.randomUUID())
    onAction(result, '资产关联已移除')
    if (result.ok) await load()
  }
  return (
    <div className="project-tab">
      <h4>资产关联</h4>
      {!archived && (
        <div className="inline-create">
          <select
            aria-label="资产类型"
            value={assetType}
            onChange={(event) => {
              setAssetType(event.target.value as AdminProjectAsset['asset_type'])
            }}
          >
            <option value="skill">Skill</option>
            <option value="knowledge">知识库</option>
            <option value="memory">记忆</option>
          </select>
          <input
            aria-label="资产 ID"
            value={assetId}
            onChange={(event) => {
              setAssetId(event.target.value)
            }}
            placeholder="输入资产 ID"
          />
          <select
            aria-label="关系类型"
            value={relation}
            onChange={(event) => {
              setRelation(event.target.value as AdminProjectAsset['relation_kind'])
            }}
          >
            <option value="reference">reference</option>
            <option value="context">context</option>
          </select>
          <button type="button" className="button primary" disabled={assetId.trim().length === 0} onClick={() => void add()}>
            <Plus size={14} />
            关联资产
          </button>
        </div>
      )}
      <div className="member-list">
        {assets.map(asset => (
          <div className="member-row" key={`${asset.asset_type}:${asset.asset_id}`}>
            <span>
              <strong>{asset.name}</strong>
              <small>
                {asset.asset_type} · {asset.relation_kind} · r{asset.revision}
              </small>
            </span>
            {!archived && (
              <span className="review-actions">
                <button type="button" className="button secondary" onClick={() => void update(asset)}>
                  切换关系
                </button>
                <button type="button" className="text-danger" onClick={() => void remove(asset)}>
                  解除
                </button>
              </span>
            )}
          </div>
        ))}
        {assets.length === 0 && <Empty text="暂无资产关联" />}
      </div>
    </div>
  )
}

function ProjectAuditTab({ detail, api }: { readonly detail: AdminProject; readonly api: TeamSkillApi }) {
  const [items, setItems] = useState<readonly AuthorizationAudit[]>([])
  useEffect(() => {
    void api.listAuthorizationAudits(undefined, undefined, detail.project_id).then((result) => {
      if (result.ok) setItems(result.value)
    })
  }, [api, detail.project_id])
  return (
    <div className="project-tab">
      <h4>项目审计</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>结果</th>
              <th>请求编号</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{formatDate(item.occurred_at)}</td>
                <td>{item.actor_name}</td>
                <td>{item.action}</td>
                <td>{item.result}</td>
                <td className="request-id">{item.request_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <Empty text="暂无项目审计记录" />}
      </div>
    </div>
  )
}

function ProjectsPage({
  items,
  api,
  role,
  onAction,
}: {
  readonly items: readonly AdminProject[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.project_id)
  const [members, setMembers] = useState<readonly AdminProjectMember[]>([])
  const [users, setUsers] = useState<readonly AdminUser[]>([])
  const [memberId, setMemberId] = useState('')
  const [askConfirmation, confirmationDialog] = useConfirmDialog()
  const selected = items.find(item => item.project_id === selectedId)
  const selectedArchived = selected?.status === 'archived'
  const refreshMembers = async (project: AdminProject | undefined): Promise<void> => {
    if (project === undefined) {
      setMembers([])
      return
    }
    const [memberResult, userResult] = await Promise.all([
      api.listProjectMembers(project.project_id),
      api.listUsers(project.organization_id),
    ])
    if (memberResult.ok) setMembers(memberResult.value)
    else onAction(memberResult, '读取项目成员失败')
    if (userResult.ok) setUsers(userResult.value)
    else onAction(userResult, '读取组织用户失败')
  }
  useEffect(() => {
    void refreshMembers(selected)
  }, [selectedId, items])
  const add = async (): Promise<void> => {
    if (selected === undefined || selectedArchived || memberId.length === 0) return
    const existing = members.find(member => member.user_id === memberId)
    const result = await api.setProjectMember(selected.project_id, memberId, existing?.revision ?? selected.revision, crypto.randomUUID())
    onAction(result, '项目成员已授权')
    if (result.ok) {
      setMemberId('')
      await refreshMembers(selected)
    }
  }
  const remove = async (member: AdminProjectMember): Promise<void> => {
    if (
      selected === undefined ||
      selectedArchived ||
      !(await askConfirmation({
        title: '确认项目成员操作',
        message: `从项目移除 ${member.display_name}？`,
      }))
    )
      return
    const result = await api.removeProjectMember(selected.project_id, member.user_id, member.revision, crypto.randomUUID())
    onAction(result, '项目成员已移除')
    if (result.ok) await refreshMembers(selected)
  }
  return (
    <>
      <section className="page-body">
        <div className="page-intro">
          <div>
            <span className="eyebrow">权限管理 / 项目</span>
            <h2>项目授权</h2>
            <p>{roleLabel(role)}只能在服务端允许的组织范围内调整项目成员关系。</p>
          </div>
          <span className="count-badge">{items.length} 个项目</span>
        </div>
        <div className="project-layout">
          <div className="project-list">
            {items.map(project => (
              <button
                type="button"
                key={project.project_id}
                className={project.project_id === selectedId ? 'project-row selected-project' : 'project-row'}
                onClick={() => {
                  setSelectedId(project.project_id)
                }}
              >
                <strong>{project.name}</strong>
                <small>
                  {project.organization_id} · r{project.revision}
                </small>
                <span className={`status status-${project.status}`}>{projectStatusLabel(project.status)}</span>
              </button>
            ))}
            {items.length === 0 && <Empty text="当前范围没有可见项目" />}
          </div>
          {selected !== undefined && (
            <div className="detail-panel">
              <span className="eyebrow">项目成员</span>
              <h3>{selected.name}</h3>
              {selectedArchived && <p className="page-hint">归档项目只读，不能调整成员授权。</p>}
              <div className="inline-create">
                <select
                  aria-label="选择组织成员"
                  value={memberId}
                  onChange={(event) => {
                    setMemberId(event.target.value)
                  }}
                >
                  <option value="">选择要授权的 member</option>
                  {users
                    .filter(user => user.global_role === 'member' && user.memberships?.some(membership => membership.organization_id === selected.organization_id))
                    .filter(user => !members.some(member => member.user_id === user.user_id && member.status === 'active'))
                    .map(user => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.display_name} · {user.username}
                      </option>
                    ))}
                </select>
                <button type="button" className="button primary" disabled={selectedArchived || memberId.length === 0} onClick={() => void add()}>
                  <Users size={14} />
                  授权
                </button>
              </div>
              <div className="member-list">
                {members
                  .filter(member => member.status === 'active')
                  .map(member => (
                    <div className="member-row" key={member.user_id}>
                      <span>
                        <strong>{member.display_name}</strong>
                        <small>r{member.revision}</small>
                      </span>
                      {!selectedArchived && (
                        <button type="button" className="text-danger" onClick={() => void remove(member)}>
                          移除
                        </button>
                      )}
                    </div>
                  ))}
                {members.filter(member => member.status === 'active').length === 0 && <Empty text="暂无项目成员" />}
              </div>
            </div>
          )}
        </div>
      </section>
      {confirmationDialog}
    </>
  )
}

function AuthorizationAuditPage({
  items,
  api,
  role,
}: {
  readonly items: readonly AuthorizationAudit[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
}) {
  const [action, setAction] = useState('')
  const [rows, setRows] = useState(items)
  const [loading, setLoading] = useState(false)
  const filter = async (): Promise<void> => {
    setLoading(true)
    const result = await api.listAuthorizationAudits(undefined, action)
    setLoading(false)
    if (result.ok) setRows(result.value)
  }
  useEffect(() => {
    setRows(items)
  }, [items])
  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">权限管理 / 审计</span>
          <h2>授权审计</h2>
          <p>{roleLabel(role)}可查看服务端按组织过滤的账号、会话和项目授权事件。</p>
        </div>
      </div>
      <div className="audit-filters">
        <label>
          动作筛选
          <input
            value={action}
            onChange={(event) => {
              setAction(event.target.value)
            }}
            placeholder="例如：账号创建"
          />
        </label>
        <button type="button" className="button secondary" disabled={loading} onClick={() => void filter()}>
          <RefreshCw size={14} />
          筛选
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>组织</th>
              <th>目标用户 / 项目</th>
              <th>结果</th>
              <th>请求编号</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(item => (
              <tr key={item.id}>
                <td>{formatDate(item.occurred_at)}</td>
                <td>{item.actor_name}</td>
                <td>{item.action}</td>
                <td>{item.organization_id ?? '平台'}</td>
                <td>{item.target_user_id ?? item.project_id ?? '-'}</td>
                <td>
                  <span className={`status status-${item.result}`}>{item.result === 'succeeded' ? '成功' : '失败'}</span>
                </td>
                <td className="request-id">{item.request_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="暂无授权审计记录" />}
      </div>
    </section>
  )
}

function Loading() {
  return (
    <section className="state-panel">
      <RefreshCw size={20} className="spin" />
      <h2>正在读取服务端数据</h2>
      <p>页面不会使用本地成功数据替代服务端状态。</p>
    </section>
  )
}
function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <section className="state-panel error">
      <TriangleAlert size={20} />
      <h2>{error.kind === 'not-ready' ? 'Skill 服务尚未配置' : error.kind === 'unauthorized' ? '登录已失效' : error.kind === 'unavailable' ? '服务不可达' : '服务请求失败'}</h2>
      {error.kind === 'unavailable' && <p>后端服务未启动或当前不可达</p>}
      <p>{errorMessage(error)}</p>
      <button className="button secondary" onClick={onRetry}>
        <RefreshCw size={15} />
        重新读取
      </button>
    </section>
  )
}
function errorMessage(error: ApiError): string {
  if (error.kind === 'not-ready') return `缺少配置：${error.missing.join('、')}`
  return `${error.code}：${error.message}`
}

function DirectoryPage({
  items,
  selected,
  onSelect,
}: {
  items: readonly TeamSkill[]
  selected: TeamSkill | undefined
  onSelect: (item: TeamSkill) => void
}) {
  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">资产查询</span>
          <h2>已登记的团队 Skill</h2>
          <p>仅显示当前管理员权限范围内的服务端资源，制品内容由平台托管。</p>
        </div>
        <span className="count-badge">{items.length} 项</span>
      </div>
      <div className="content-grid">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>版本</th>
                <th>可见范围</th>
                <th>状态</th>
                <th>修订</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr
                  key={`${item.skillId}-${item.status}-${item.revision}`}
                  onClick={() => {
                    onSelect(item)
                  }}
                  className={selected?.skillId === item.skillId ? 'selected-row' : undefined}
                >
                  <td>
                    <strong>{item.displayName}</strong>
                    <small>
                      {item.runtimeName} · {item.authorName ?? '平台作者'}
                    </small>
                  </td>
                  <td>{item.currentVersion ? `v${item.currentVersion}` : '未发布'}</td>
                  <td>{visibilityLabel(item.visibility)}</td>
                  <td>
                    <Status status={item.status} />
                  </td>
                  <td>r{item.revision}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <Empty text="当前没有可见的 Skill 资产" />}
        </div>
        {selected !== undefined && <SkillSummary skill={selected} />}
      </div>
    </section>
  )
}

function SkillSummary({ skill }: { skill: TeamSkill }) {
  return (
    <aside className="detail-panel">
      <span className="eyebrow">Skill 详情</span>
      <h2>{skill.displayName}</h2>
      <p>{skill.summary}</p>
      <dl>
        <div>
          <dt>运行时名称</dt>
          <dd>{skill.runtimeName}</dd>
        </div>
        <div>
          <dt>所属组织</dt>
          <dd>{skill.organizationId ?? '未标注'}</dd>
        </div>
        <div>
          <dt>项目绑定</dt>
          <dd>{skill.projectIds === undefined || skill.projectIds.length === 0 ? '未绑定任何项目：发布后还需在项目资产中绑定，插件目录才会发现该 Skill' : skill.projectIds.join('、')}</dd>
        </div>
        <div>
          <dt>分类 / 标签</dt>
          <dd>
            {skill.category} · {skill.tags.join('、') || '未设置'}
          </dd>
        </div>
        <div>
          <dt>可见范围</dt>
          <dd>{visibilityLabel(skill.visibility)}</dd>
        </div>
        <div>
          <dt>当前修订</dt>
          <dd>r{skill.revision}</dd>
        </div>
      </dl>
      <div className="callout">已发布版本不可编辑。修改内容、依赖或权限时，请创建新的版本草稿。</div>
    </aside>
  )
}

function KnowledgeBasesPage({
  items,
  api,
  role,
  onAction,
}: {
  readonly items: readonly AdminKnowledgeBase[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [organizations, setOrganizations] = useState<readonly AdminOrganization[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.knowledge_base_id)
  const [selected, setSelected] = useState<AdminKnowledgeBase | undefined>()
  const [documents, setDocuments] = useState<readonly AdminKnowledgeDocument[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<AdminKnowledgeBase['type']>('document')
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [tab, setTab] = useState<'overview' | 'documents' | 'faq' | 'wiki' | 'graph' | 'settings' | 'projects' | 'audit'>('overview')
  const [operationStatus, setOperationStatus] = useState<string | undefined>()
  const [operationId, setOperationId] = useState<string | undefined>()
  const [impact, setImpact] = useState<
    | {
      readonly revision: number
      readonly affected_projects: readonly {
        readonly project_id: string
        readonly name: string
        readonly status: string
      }[]
    }
    | undefined
  >()
  const loadGeneration = useRef(0)
  useEffect(() => {
    void api.listOrganizations().then((result) => {
      if (result.ok) {
        setOrganizations(result.value)
        if (organizationId.length === 0 && result.value.length > 0) setOrganizationId(result.value[0].organization_id)
      }
    })
  }, [api, organizationId.length])
  const load = async (id: string): Promise<void> => {
    const generation = ++loadGeneration.current
    const [detail, docs] = await Promise.all([api.getKnowledgeBase(id), api.listKnowledgeDocuments(id)])
    if (generation !== loadGeneration.current) return
    if (detail.ok) {
      setSelected(detail.value)
      setName(detail.value.name)
      setDescription(detail.value.description)
    } else onAction(detail, '读取知识库失败')
    if (docs.ok) setDocuments(docs.value)
    else onAction(docs, '读取文档失败')
  }
  useEffect(() => {
    if (selectedId !== undefined) void load(selectedId)
  }, [selectedId])
  useEffect(() => {
    if (operationId === undefined || operationStatus === undefined || operationStatus === 'succeeded' || operationStatus === 'failed' || operationStatus === 'cancelled') return
    const timer = window.setTimeout(() => {
      void api.getKnowledgeOperation(operationId).then((result) => {
        if (result.ok) setOperationStatus(result.value.status)
        else onAction(result, '读取操作状态失败')
      })
    }, 500)
    return () => {
      window.clearTimeout(timer)
    }
  }, [api, onAction, operationId, operationStatus])
  const create = async (): Promise<void> => {
    if (organizationId.length === 0 || name.trim().length === 0) return
    const result = await api.createKnowledgeBase(
      organizationId,
      { name: name.trim(), description: description.trim(), type },
      crypto.randomUUID(),
    )
    onAction(result, '知识库创建操作已提交')
    if (result.ok) {
      setOperationId(result.value.operation_id)
      setOperationStatus(result.value.status)
      if (result.value.knowledge_base !== undefined) setSelectedId(result.value.knowledge_base.knowledge_base_id)
    }
  }
  const save = async (): Promise<void> => {
    if (selected === undefined) return
    const result = await api.updateKnowledgeBase(
      selected.knowledge_base_id,
      { name: name.trim(), description: description.trim() },
      selected.revision,
      crypto.randomUUID(),
    )
    onAction(result, '知识库配置已保存')
    if (result.ok) setSelected(result.value)
  }
  const importMarkdown = async (): Promise<void> => {
    if (selected === undefined || markdown.trim().length === 0) return
    const result = await api.importKnowledgeMarkdown(selected.knowledge_base_id, { title: title.trim() || '未命名文档', markdown }, selected.revision, crypto.randomUUID())
    onAction(result, 'Markdown 导入操作已提交')
    if (result.ok) {
      setOperationId(result.value.operation_id)
      setOperationStatus(result.value.status)
      setMarkdown('')
      await load(selected.knowledge_base_id)
    }
  }
  const importUrl = async (): Promise<void> => {
    if (selected === undefined || url.trim().length === 0) return
    const result = await api.importKnowledgeUrl(
      selected.knowledge_base_id,
      { title: title.trim() || undefined, url: url.trim() },
      selected.revision,
      crypto.randomUUID(),
    )
    onAction(result, 'URL 导入操作已提交')
    if (result.ok) {
      setOperationId(result.value.operation_id)
      setOperationStatus(result.value.status)
      setUrl('')
      await load(selected.knowledge_base_id)
    }
  }
  const importFile = async (): Promise<void> => {
    if (selected === undefined || fileName.trim().length === 0) return
    const result = await api.importKnowledgeFile(
      selected.knowledge_base_id,
      { title: title.trim() || fileName.trim(), file_name: fileName.trim() },
      selected.revision,
      crypto.randomUUID(),
    )
    onAction(result, '文件导入操作已提交')
    if (result.ok) {
      setOperationId(result.value.operation_id)
      setOperationStatus(result.value.status)
      setFileName('')
      await load(selected.knowledge_base_id)
    }
  }
  const loadImpact = async (): Promise<void> => {
    if (selected === undefined) return
    const generation = loadGeneration.current
    const result = await api.getKnowledgeDeleteImpact(selected.knowledge_base_id)
    if (result.ok && generation === loadGeneration.current) setImpact(result.value)
    else onAction(result, '读取删除影响失败')
  }
  const deleteKnowledge = async (): Promise<void> => {
    if (selected === undefined || impact === undefined) return
    const result = await api.deleteKnowledgeBase(
      selected.knowledge_base_id,
      impact.revision,
      impact.affected_projects.length,
      crypto.randomUUID(),
    )
    onAction(result, '知识库删除操作已提交')
    if (result.ok) {
      setOperationId(result.value.operation_id)
      setOperationStatus(result.value.status)
    }
  }
  const tabs: Array<{
    readonly id: typeof tab
    readonly label: string
    readonly visible: boolean
  }> = [
    { id: 'overview', label: '概览', visible: true },
    { id: 'documents', label: '文档', visible: true },
    { id: 'faq', label: 'FAQ', visible: selected?.type === 'faq' },
    { id: 'wiki', label: 'Wiki', visible: selected?.type === 'wiki' },
    { id: 'graph', label: '图谱', visible: selected?.type === 'wiki' },
    { id: 'settings', label: '设置', visible: true },
    { id: 'projects', label: '项目', visible: true },
    { id: 'audit', label: '审计', visible: true },
  ]
  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">知识库管理</span>
          <h2>知识库</h2>
          <p>{roleLabel(role)}按组织范围管理 WeKnora 代理资源，正文和处理状态由服务端返回。</p>
        </div>
        <span className="count-badge">{items.length} 个知识库</span>
      </div>
      <div className="account-toolbar">
        <label>
          组织
          <select
            aria-label="知识库组织"
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value)
            }}
          >
            {organizations.map(item => (
              <option key={item.organization_id} value={item.organization_id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <form
          className="inline-create"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <input
            aria-label="知识库名称"
            placeholder="新知识库名称"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
            required
          />
          <select
            aria-label="知识库类型"
            value={type}
            onChange={(event) => {
              setType(event.target.value as AdminKnowledgeBase['type'])
            }}
          >
            <option value="document">document</option>
            <option value="faq">faq</option>
            <option value="wiki">wiki</option>
          </select>
          <input
            aria-label="知识库描述"
            placeholder="描述"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
            }}
          />
          <button className="button primary">
            <Plus size={14} />
            创建
          </button>
        </form>
      </div>
      <div className="project-layout">
        <div className="project-list">
          {items.map(item => (
            <button
              type="button"
              key={item.knowledge_base_id}
              className={item.knowledge_base_id === selectedId ? 'project-row selected-project' : 'project-row'}
              onClick={() => {
                setSelectedId(item.knowledge_base_id)
                setTab('overview')
                setImpact(undefined)
              }}
            >
              <strong>{item.name}</strong>
              <small>
                {item.type} · {item.organization_id} · r{item.revision}
              </small>
              <span className={`status status-${item.state}`}>{item.state}</span>
            </button>
          ))}
          {items.length === 0 && <Empty text="当前范围没有可见知识库" />}
        </div>
        {selected !== undefined && (
          <div className="detail-panel project-detail-panel">
            <div className="editor-heading">
              <div>
                <span className="eyebrow">知识库详情</span>
                <h3>{selected.name}</h3>
              </div>
              <span className={`status status-${selected.state}`}>{selected.state}</span>
            </div>
            <div className="detail-tabs" role="tablist" aria-label="知识库详情页签">
              {tabs
                .filter(item => item.visible)
                .map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={tab === item.id ? 'tab active' : 'tab'}
                    onClick={() => {
                      setTab(item.id)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
            {tab === 'overview' && (
              <div className="project-overview">
                <label>
                  名称
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                    }}
                  />
                </label>
                <label>
                  描述
                  <textarea
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value)
                    }}
                  />
                </label>
                <dl>
                  <div>
                    <dt>类型</dt>
                    <dd>{selected.type}</dd>
                  </div>
                  <div>
                    <dt>文档</dt>
                    <dd>{selected.document_count ?? documents.length}</dd>
                  </div>
                  <div>
                    <dt>修订</dt>
                    <dd>r{selected.revision}</dd>
                  </div>
                </dl>
                <button type="button" className="button secondary" onClick={() => void save()}>
                  <Save size={14} />
                  保存配置
                </button>
                <button type="button" className="button secondary" onClick={() => void loadImpact()}>
                  读取删除影响
                </button>
                {impact !== undefined && (
                  <div className="callout">
                    <strong>外部删除影响</strong>
                    <p>
                      {impact.affected_projects.length} 个项目将解除映射：
                      {impact.affected_projects.map(item => item.name).join('、') || '无'}
                    </p>
                    <button type="button" className="text-danger" onClick={() => void deleteKnowledge()}>
                      确认删除知识库
                    </button>
                  </div>
                )}
              </div>
            )}
            {tab === 'documents' && (
              <div className="project-tab">
                <h4>文档与导入</h4>
                <div className="inline-create">
                  <input
                    aria-label="文档标题"
                    placeholder="文档标题"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                    }}
                  />
                  <textarea
                    aria-label="Markdown 内容"
                    placeholder="Markdown 内容"
                    value={markdown}
                    onChange={(event) => {
                      setMarkdown(event.target.value)
                    }}
                  />
                  <button type="button" className="button primary" onClick={() => void importMarkdown()} disabled={markdown.trim().length === 0}>
                    <Upload size={14} />
                    导入 Markdown
                  </button>
                </div>
                <div className="inline-create">
                  <input
                    aria-label="文档 URL"
                    placeholder="https://..."
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value)
                    }}
                  />
                  <button type="button" className="button primary" onClick={() => void importUrl()} disabled={url.trim().length === 0}>
                    <Upload size={14} />
                    导入 URL
                  </button>
                </div>
                <div className="inline-create">
                  <input
                    aria-label="文件名"
                    placeholder="文件名"
                    value={fileName}
                    onChange={(event) => {
                      setFileName(event.target.value)
                    }}
                  />
                  <button type="button" className="button primary" onClick={() => void importFile()} disabled={fileName.trim().length === 0}>
                    <Upload size={14} />
                    导入文件
                  </button>
                </div>
                {operationStatus !== undefined && <p role="status">操作状态：{operationStatus}</p>}
                <div className="member-list">
                  {documents.map(document => (
                    <div className="member-row" key={document.document_id}>
                      <span>
                        <strong>{document.title}</strong>
                        <small>
                          {document.source} · {document.status}
                        </small>
                      </span>
                      <span className="review-actions">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() =>
                            void api
                              .reparseKnowledgeDocument(
                                selected.knowledge_base_id,
                                document.document_id,
                                selected.revision,
                                crypto.randomUUID(),
                              )
                              .then((result) => {
                                onAction(result, '重解析操作已提交')
                              })
                          }
                        >
                          重解析
                        </button>
                        <button
                          type="button"
                          className="text-danger"
                          onClick={() =>
                            void api
                              .deleteKnowledgeDocument(
                                selected.knowledge_base_id,
                                document.document_id,
                                selected.revision,
                                crypto.randomUUID(),
                              )
                              .then((result) => {
                                onAction(result, '文档删除操作已提交')
                              })
                          }
                        >
                          删除
                        </button>
                      </span>
                    </div>
                  ))}
                  {documents.length === 0 && <Empty text="暂无文档" />}
                </div>
              </div>
            )}
            {tab === 'faq' && (
              <div className="project-tab">
                <h4>FAQ 条目</h4>
                <p>FAQ 条目由 WeKnora 服务端管理，平台仅展示授权状态。</p>
              </div>
            )}
            {tab === 'wiki' && (
              <div className="project-tab">
                <h4>Wiki 页面</h4>
                <p>Wiki 页面由 WeKnora 服务端管理，平台仅展示授权状态。</p>
              </div>
            )}
            {tab === 'graph' && (
              <div className="project-tab">
                <h4>知识图谱</h4>
                <p>图谱节点和关系由 WeKnora 服务端返回。</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    void api.getKnowledgeGraph(selected.knowledge_base_id).then((result) => {
                      onAction(result, '图谱已刷新')
                    })
                  }
                >
                  刷新图谱
                </button>
              </div>
            )}
            {tab === 'settings' && (
              <div className="project-tab">
                <h4>基础设置</h4>
                <p>类型创建后不可变；复杂模型与存储选项由外部服务管理。</p>
              </div>
            )}
            {tab === 'projects' && (
              <div className="project-tab">
                <h4>项目关联</h4>
                <p>项目映射由平台服务端校验组织和项目状态。</p>
              </div>
            )}
            {tab === 'audit' && (
              <div className="project-tab">
                <h4>知识库审计</h4>
                <p>审计字段和错误摘要由平台服务端返回。</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function MemoryLibraryPage({
  items,
  api,
  role,
  userId,
  onAction,
}: {
  readonly items: readonly AdminMemoryRecord[]
  readonly api: TeamSkillApi
  readonly role: AccountRole
  readonly userId?: string
  readonly onAction: (result: ApiResult<unknown>, success: string) => void
}) {
  const [projects, setProjects] = useState<readonly AdminProject[]>([])
  const [projectId, setProjectId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<readonly AdminMemoryRecord[]>(items)
  const [cursor, setCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminMemoryRecord | undefined>()
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<'list' | 'policy' | 'jobs' | 'audit'>('list')
  const [policy, setPolicy] = useState<AdminMemoryPolicy | undefined>()
  const [jobs, setJobs] = useState<readonly AdminMemoryJob[]>([])
  const [audits, setAudits] = useState<readonly AdminMemoryAudit[]>([])
  const [askConfirmation, confirmationDialog] = useConfirmDialog()
  const [busy, setBusy] = useState(false)
  const [listError, setListError] = useState<string | undefined>()
  const listRequest = useRef(0)
  const detailRequest = useRef(0)
  const governanceRequest = useRef(0)
  const mutationRequest = useRef(0)
  const canWrite = role !== 'member'
  const canEdit = (record: AdminMemoryRecord): boolean => canWrite || record.captured_by_user_id === userId

  useEffect(() => {
    void (role === 'member' ? api.listMemoryProjects() : api.listProjects()).then((result) => {
      if (result.ok) {
        setProjects(result.value)
        setProjectId(current => (current.length === 0 ? result.value[0].project_id : current))
      } else onAction(result, '读取项目失败')
    })
  }, [api, onAction, projectId.length, role])
  const loadRecords = async (next?: string, search = query): Promise<void> => {
    const requestId = ++listRequest.current
    const requestedProjectId = projectId
    setBusy(true)
    setListError(undefined)
    const result = await api.listMemoryRecords({
      projectId: requestedProjectId || undefined,
      keyword: search || undefined,
      cursor: next,
    })
    if (requestId !== listRequest.current || requestedProjectId !== projectId) return
    setBusy(false)
    if (!result.ok) {
      setListError(errorMessage(result.error))
      return
    }
    setRecords(result.value.items)
    setListError(undefined)
    setNextCursor(result.value.next_cursor)
    setCursor(next)
  }
  useEffect(() => {
    listRequest.current += 1
    detailRequest.current += 1
    governanceRequest.current += 1
    mutationRequest.current += 1
    setRecords([])
    setSelected(undefined)
    setContent('')
    setEditing(false)
    setKeyword('')
    setQuery('')
    setCursor(undefined)
    setNextCursor(null)
    setPolicy(undefined)
    setJobs([])
    setAudits([])
    if (projectId.length > 0) void loadRecords(undefined, '')
  }, [projectId])
  useEffect(() => {
    setRecords(items)
    setListError(undefined)
  }, [items])
  const select = async (record: AdminMemoryRecord): Promise<void> => {
    const requestId = ++detailRequest.current
    setSelected(record)
    setContent(record.content)
    setEditing(false)
    const result = await api.getMemoryRecord(record.memory_id)
    if (requestId !== detailRequest.current) return
    if (result.ok) {
      setSelected(result.value)
      setContent(result.value.content)
    } else onAction(result, '读取记忆详情失败')
  }
  const save = async (): Promise<void> => {
    if (selected === undefined || !canEdit(selected)) return
    const requestId = ++mutationRequest.current
    const requestedProjectId = projectId
    setBusy(true)
    const result = await api.updateMemoryRecord(selected.memory_id, content, selected.revision)
    setBusy(false)
    if (requestId !== mutationRequest.current || requestedProjectId !== projectId) return
    if (result.ok) {
      setSelected(result.value)
      setContent(result.value.content)
      setEditing(false)
      await loadRecords(cursor)
    }
    onAction(result, '记忆正文已保存')
  }
  const remove = async (): Promise<void> => {
    if (
      selected === undefined ||
      !canEdit(selected) ||
      !(await askConfirmation({
        title: '确认删除记忆',
        message: '删除后该记忆将立即不可召回，确认继续？',
        confirmLabel: '确认删除',
      }))
    )
      return
    const requestId = ++mutationRequest.current
    const requestedProjectId = projectId
    setBusy(true)
    const result = await api.deleteMemoryRecord(selected.memory_id, selected.revision, crypto.randomUUID())
    setBusy(false)
    if (requestId !== mutationRequest.current || requestedProjectId !== projectId) return
    if (result.ok) {
      setSelected(undefined)
      setEditing(false)
      await loadRecords(cursor)
    }
    onAction(result, '记忆删除任务已提交')
  }
  const loadGovernance = async (nextTab: typeof tab): Promise<void> => {
    setTab(nextTab)
    const requestId = ++governanceRequest.current
    const requestedProjectId = projectId
    if (nextTab === 'policy' && projectId) {
      const result = await api.getMemoryPolicy(projectId)
      if (requestId !== governanceRequest.current || requestedProjectId !== projectId) return
      if (result.ok) setPolicy(result.value)
      else onAction(result, '读取记忆策略失败')
    }
    if (nextTab === 'jobs') {
      const result = await api.listMemoryJobs(projectId || undefined)
      if (requestId !== governanceRequest.current || requestedProjectId !== projectId) return
      if (result.ok) setJobs(result.value.items)
      else onAction(result, '读取记忆任务失败')
    }
    if (nextTab === 'audit') {
      const result = await api.listMemoryAudit(projectId || undefined)
      if (requestId !== governanceRequest.current || requestedProjectId !== projectId) return
      if (result.ok) setAudits(result.value.items)
      else onAction(result, '读取记忆审计失败')
    }
  }
  const savePolicy = async (): Promise<void> => {
    if (policy === undefined || !projectId) return
    const requestId = ++governanceRequest.current
    const requestedProjectId = projectId
    const result = await api.updateMemoryPolicy(projectId, policy.values, policy.revision, crypto.randomUUID())
    if (requestId !== governanceRequest.current || requestedProjectId !== projectId) return
    if (result.ok) setPolicy(result.value)
    onAction(result, '记忆策略已保存')
  }
  const retry = async (job: AdminMemoryJob): Promise<void> => {
    const requestId = ++governanceRequest.current
    const requestedProjectId = projectId
    const result = await api.retryMemoryJob(job.job_id, job.revision, crypto.randomUUID())
    if (requestId !== governanceRequest.current || requestedProjectId !== projectId) return
    if (result.ok) setJobs(previous => previous.map(item => (item.job_id === job.job_id ? result.value : item)))
    onAction(result, '记忆任务已重试')
  }
  return (
    <>
      <section className="page-body">
        <div className="page-intro">
          <div>
            <span className="eyebrow">记忆库管理 / team + project</span>
            <h2>项目团队记忆库</h2>
            <p>服务端是唯一事实源；记忆捕获、召回和治理都按项目授权范围执行。</p>
          </div>
          <span className="count-badge">{records.length} 条</span>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="记忆库页签">
          {(
            [
              ['list', '记忆列表'],
              ['policy', '策略'],
              ['jobs', '任务'],
              ['audit', '审计'],
            ] as const
          ).map(([id, label]) => (
            <button type="button" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => void loadGovernance(id)} key={id}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'list' && (
          <>
            <div className="account-toolbar">
              <label>
                项目
                <select
                  aria-label="记忆项目"
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(event.target.value)
                    setCursor(undefined)
                  }}
                >
                  {projects.map(project => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="inline-create"
                onSubmit={(event) => {
                  event.preventDefault()
                  const nextQuery = keyword.trim()
                  setQuery(nextQuery)
                  setCursor(undefined)
                  void loadRecords(undefined, nextQuery)
                }}
              >
                <input
                  aria-label="记忆关键词"
                  placeholder="关键词"
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value)
                  }}
                />
                <button type="submit" className="button secondary" disabled={busy}>
                  <RefreshCw size={14} />
                  筛选
                </button>
              </form>
            </div>
            <div className="content-grid">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>正文</th>
                      <th>项目</th>
                      <th>来源</th>
                      <th>修订</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(record => (
                      <tr key={record.memory_id} className={selected?.memory_id === record.memory_id ? 'selected-row' : undefined} onClick={() => void select(record)}>
                        <td>
                          <button type="button" className="table-link" aria-label={record.content}>
                            {record.content}
                          </button>
                        </td>
                        <td>{record.project_id}</td>
                        <td>{record.captured_by_user_id}</td>
                        <td>r{record.revision}</td>
                        <td>
                          <Status status={record.status.toLowerCase()} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listError !== undefined ? (
                  <div className="auth-error" role="alert">
                    {listError}
                  </div>
                ) : (
                  records.length === 0 && <Empty text="当前项目没有可见记忆" />
                )}
                <div className="pagination">
                  <button type="button" className="button secondary" disabled={!cursor || busy} onClick={() => void loadRecords()}>
                    上一页
                  </button>
                  <button type="button" className="button secondary" disabled={!nextCursor || busy} onClick={() => void loadRecords(nextCursor ?? undefined)}>
                    下一页
                  </button>
                </div>
              </div>
              {selected !== undefined && (
                <aside className="detail-panel">
                  <div className="editor-heading">
                    <div>
                      <span className="eyebrow">记忆详情</span>
                      <h3>{selected.memory_id}</h3>
                    </div>
                    <span className="revision">r{selected.revision}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>项目</dt>
                      <dd>{selected.project_id}</dd>
                    </div>
                    <div>
                      <dt>捕获者</dt>
                      <dd>{selected.captured_by_user_id}</dd>
                    </div>
                    <div>
                      <dt>召回次数</dt>
                      <dd>{selected.recall_count}</dd>
                    </div>
                  </dl>
                  <label>
                    记忆正文
                    <textarea
                      aria-label="记忆正文"
                      value={content}
                      disabled={!editing || !canEdit(selected) || busy}
                      onChange={(event) => {
                        setContent(event.target.value)
                      }}
                    />
                  </label>
                  <div className="review-actions">
                    {editing ? (
                      <button type="button" className="button secondary" disabled={!canEdit(selected) || busy || content.trim().length === 0} onClick={() => void save()}>
                        <Save size={14} />
                        保存记忆
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!canEdit(selected) || busy}
                        onClick={() => {
                          setEditing(true)
                        }}
                      >
                        <FilePenLine size={14} />
                        编辑记忆
                      </button>
                    )}
                    <button type="button" className="button danger" disabled={!canEdit(selected) || busy} onClick={() => void remove()}>
                      删除记忆
                    </button>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
        {tab === 'policy' && (
          <section className="editor-panel">
            <div className="section-title">
              <strong>记忆召回策略</strong>
              {policy !== undefined && <span className="revision">r{policy.revision}</span>}
            </div>
            {policy === undefined ? (
              <Loading />
            ) : (
              <>
                <div className="form-columns">
                  <label>
                    top_k
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={policy.values.top_k}
                      onChange={(event) => {
                        setPolicy({
                          ...policy,
                          values: {
                            ...policy.values,
                            top_k: Number(event.target.value),
                          },
                        })
                      }}
                    />
                  </label>
                  <label>
                    relevance_threshold
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={policy.values.relevance_threshold}
                      onChange={(event) => {
                        setPolicy({
                          ...policy,
                          values: {
                            ...policy.values,
                            relevance_threshold: Number(event.target.value),
                          },
                        })
                      }}
                    />
                  </label>
                  <label>
                    token_budget
                    <input
                      type="number"
                      min="1"
                      value={policy.values.token_budget}
                      onChange={(event) => {
                        setPolicy({
                          ...policy,
                          values: {
                            ...policy.values,
                            token_budget: Number(event.target.value),
                          },
                        })
                      }}
                    />
                  </label>
                </div>
                <p>继承来源：{policy.inherited_from ?? '无'}</p>
                <button type="button" className="button primary" disabled={!canWrite} onClick={() => void savePolicy()}>
                  <Save size={14} />
                  保存策略
                </button>
              </>
            )}
          </section>
        )}
        {tab === 'jobs' && (
          <section className="table-wrap">
            <h3>记忆处理任务</h3>
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>错误</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.job_id}>
                    <td>{job.job_id}</td>
                    <td>{job.kind}</td>
                    <td>{job.status}</td>
                    <td>{job.error_code ?? '-'}</td>
                    <td>
                      {job.retryable && (
                        <button type="button" className="button secondary" disabled={!canWrite} onClick={() => void retry(job)}>
                          重试
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobs.length === 0 && <Empty text="暂无记忆处理任务" />}
          </section>
        )}
        {tab === 'audit' && (
          <section className="table-wrap">
            <h3>记忆治理审计</h3>
            <table>
              <thead>
                <tr>
                  <th>操作</th>
                  <th>记忆</th>
                  <th>项目</th>
                  <th>操作者</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {audits.map(audit => (
                  <tr key={audit.audit_id}>
                    <td>{audit.operation}</td>
                    <td>{audit.memory_id ?? '-'}</td>
                    <td>{audit.project_id}</td>
                    <td>{audit.operated_by_user_id}</td>
                    <td>{audit.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audits.length === 0 && <Empty text="暂无记忆治理审计" />}
          </section>
        )}
      </section>
      {confirmationDialog}
    </>
  )
}

function DraftsPage({
  items,
  api,
  onAction,
}: {
  items: readonly TeamSkill[]
  api: TeamSkillApi
  onAction: (result: ApiResult<unknown>, message: string) => void
}) {
  const editable = items.filter(item => item.status === 'draft' || item.status === 'published' || item.status === 'withdrawn')
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [detail, setDetail] = useState<{ readonly skill: TeamSkill; readonly versions: readonly SkillVersion[] } | undefined>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('工程效率')
  const [tags, setTags] = useState('团队')
  const [visibility, setVisibility] = useState<TeamSkill['visibility']>('organization')
  const [groupId, setGroupId] = useState('platform')
  const [peopleIds, setPeopleIds] = useState<readonly string[]>([])
  const [directoryUsers, setDirectoryUsers] = useState<readonly DirectoryUser[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (visibility !== 'people') return
    setDirectoryLoading(true)
    void api.listDirectoryUsers().then((result) => {
      setDirectoryLoading(false)
      if (result.ok) setDirectoryUsers(result.value)
      else onAction(result, '读取组织目录失败')
    })
  }, [api, onAction, visibility])

  const loadDetail = async (skillId: string): Promise<void> => {
    setSelectedId(skillId)
    setDetailLoading(true)
    const result = await api.getSkill(skillId)
    setDetailLoading(false)
    if (result.ok) setDetail(result.value)
    else onAction(result, '读取草稿详情失败')
  }

  const create = async (): Promise<void> => {
    setBusy(true)
    const result = await api.createSkill({
      displayName: name.trim(),
      summary: summary.trim(),
      category: category.trim(),
      tags: splitList(tags),
      visibility,
      ...(visibility === 'group' ? { groupId } : {}),
      ...(visibility === 'people' && peopleIds.length > 0 ? { peopleIds } : {}),
    })
    setBusy(false)
    onAction(result, '草稿已创建')
  }

  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">作者工作区</span>
          <h2>我的草稿</h2>
          <p>作者只能编辑草稿；服务端会校验制品、依赖、权限和可见范围后再允许提交审核。</p>
        </div>
        <span className="count-badge">{editable.length} 项</span>
      </div>
      <div className="draft-layout">
        <div className="draft-list">
          <div className="list-title">
            我的 Skill <span>{editable.length}</span>
          </div>
          {editable.map(item => (
            <button type="button" className={selectedId === item.skillId ? 'draft-row selected-draft' : 'draft-row'} key={item.skillId} onClick={() => void loadDetail(item.skillId)}>
              <span>
                <strong>{item.displayName}</strong>
                <small>
                  r{item.revision} · {visibilityLabel(item.visibility)}
                </small>
              </span>
              <Status status={item.status} />
            </button>
          ))}
          {editable.length === 0 && <Empty text="没有待编辑草稿" />}
        </div>
        <CreateSkillForm
          name={name}
          summary={summary}
          category={category}
          tags={tags}
          visibility={visibility}
          groupId={groupId}
          peopleIds={peopleIds}
          directoryUsers={directoryUsers}
          directoryLoading={directoryLoading}
          busy={busy}
          onName={setName}
          onSummary={setSummary}
          onCategory={setCategory}
          onTags={setTags}
          onVisibility={setVisibility}
          onGroupId={setGroupId}
          onPeopleIds={setPeopleIds}
          onSubmit={() => void create()}
        />
      </div>
      {selectedId !== undefined && <div className="draft-editor-wrap">{detailLoading || detail === undefined ? <Loading /> : <DraftEditor detail={detail} api={api} onAction={onAction} onRefresh={() => loadDetail(selectedId)} />}</div>}
    </section>
  )
}

function CreateSkillForm({
  name,
  summary,
  category,
  tags,
  visibility,
  groupId,
  peopleIds,
  directoryUsers,
  directoryLoading,
  busy,
  onName,
  onSummary,
  onCategory,
  onTags,
  onVisibility,
  onGroupId,
  onPeopleIds,
  onSubmit,
}: {
  name: string
  summary: string
  category: string
  tags: string
  visibility: TeamSkill['visibility']
  groupId: string
  peopleIds: readonly string[]
  directoryUsers: readonly DirectoryUser[]
  directoryLoading: boolean
  busy: boolean
  onName: (value: string) => void
  onSummary: (value: string) => void
  onCategory: (value: string) => void
  onTags: (value: string) => void
  onVisibility: (value: TeamSkill['visibility']) => void
  onGroupId: (value: string) => void
  onPeopleIds: (value: readonly string[]) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="form-panel"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <span className="eyebrow">新建 Skill</span>
      <h3>创建草稿版本</h3>
      <label>
        中文名称
        <input
          value={name}
          onChange={(event) => {
            onName(event.target.value)
          }}
          required
          placeholder="例如：代码评审"
        />
      </label>
      <label>
        简介
        <textarea
          value={summary}
          onChange={(event) => {
            onSummary(event.target.value)
          }}
          required
          placeholder="说明 Skill 的适用场景和边界"
        />
      </label>
      <div className="form-columns">
        <label>
          分类
          <input
            aria-label="分类"
            value={category}
            onChange={(event) => {
              onCategory(event.target.value)
            }}
            required
          />
        </label>
        <label>
          标签
          <input
            aria-label="标签"
            value={tags}
            onChange={(event) => {
              onTags(event.target.value)
            }}
            placeholder="用逗号分隔"
          />
        </label>
      </div>
      <label>
        可见范围
        <select
          value={visibility}
          onChange={(event) => {
            onVisibility(event.target.value as TeamSkill['visibility'])
          }}
        >
          <option value="organization">所有人可见</option>
          <option value="group">本组内可见</option>
          <option value="people">特定人员可见</option>
        </select>
      </label>
      {visibility === 'group' && (
        <label>
          可见组
          <select
            aria-label="可见组"
            value={groupId}
            onChange={(event) => {
              onGroupId(event.target.value)
            }}
          >
            <option value="platform">平台组</option>
          </select>
        </label>
      )}
      {visibility === 'people' && <PeopleSelector users={directoryUsers} selected={peopleIds} loading={directoryLoading} onChange={onPeopleIds} />}
      <div className="form-note">版本说明、依赖、权限和 ZIP 制品将在创建后编辑；特定人员只能从服务端组织目录加入。</div>
      <button className="button primary" disabled={busy || name.trim().length === 0 || summary.trim().length === 0}>
        <Plus size={15} />
        {busy ? '正在创建…' : '创建草稿'}
      </button>
    </form>
  )
}

function DraftEditor({
  detail,
  api,
  onAction,
  onRefresh,
}: {
  detail: {
    readonly skill: TeamSkill
    readonly versions: readonly SkillVersion[]
  }
  api: TeamSkillApi
  onAction: (result: ApiResult<unknown>, message: string) => void
  onRefresh: () => Promise<void>
}) {
  const { skill, versions } = detail
  const draftVersion = versions.find(version => version.status === 'draft')
  const [name, setName] = useState(skill.displayName)
  const [summary, setSummary] = useState(skill.summary)
  const [category, setCategory] = useState(skill.category)
  const [tags, setTags] = useState(skill.tags.join(', '))
  const [visibility, setVisibility] = useState<TeamSkill['visibility']>(skill.visibility)
  const [groupId, setGroupId] = useState(skill.groupId ?? 'platform')
  const [peopleIds, setPeopleIds] = useState<readonly string[]>(skill.peopleIds ?? [])
  const [directoryUsers, setDirectoryUsers] = useState<readonly DirectoryUser[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState(draftVersion?.releaseNotes ?? '')
  const [dependencies, setDependencies] = useState(draftVersion?.dependencies.join('\n') ?? '')
  const [permissions, setPermissions] = useState(draftVersion?.permissions.join('\n') ?? '')
  const [newVersion, setNewVersion] = useState('')
  const [newReleaseNotes, setNewReleaseNotes] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [uploaded, setUploaded] = useState(false)
  const [busy, setBusy] = useState<string | undefined>()

  useEffect(() => {
    setName(skill.displayName)
    setSummary(skill.summary)
    setCategory(skill.category)
    setTags(skill.tags.join(', '))
    setVisibility(skill.visibility)
    setGroupId(skill.groupId ?? 'platform')
    setPeopleIds(skill.peopleIds ?? [])
    setReleaseNotes(draftVersion?.releaseNotes ?? '')
    setDependencies(draftVersion?.dependencies.join('\n') ?? '')
    setPermissions(draftVersion?.permissions.join('\n') ?? '')
    setFile(undefined)
    setUploaded(draftVersion?.artifactSizeBytes !== undefined && draftVersion.artifactSizeBytes > 0)
  }, [
    draftVersion?.artifactSizeBytes,
    draftVersion?.releaseNotes,
    draftVersion?.revision,
    skill.category,
    skill.displayName,
    skill.groupId,
    skill.peopleIds,
    skill.revision,
    skill.summary,
    skill.tags,
    skill.visibility,
  ])

  useEffect(() => {
    if (visibility !== 'people') return
    setDirectoryLoading(true)
    void api.listDirectoryUsers().then((result) => {
      setDirectoryLoading(false)
      if (result.ok) setDirectoryUsers(result.value)
      else onAction(result, '读取组织目录失败')
    })
  }, [api, onAction, visibility])

  const run = async (key: string, resultPromise: Promise<ApiResult<unknown>>, message: string): Promise<void> => {
    setBusy(key)
    const result = await resultPromise
    setBusy(undefined)
    onAction(result, message)
    if (result.ok) await onRefresh()
  }
  const saveSkill = (): Promise<void> =>
    run(
      'skill',
      api.updateSkill(
        skill.skillId,
        {
          displayName: name.trim(),
          summary: summary.trim(),
          category: category.trim(),
          tags: splitList(tags),
          visibility,
          ...(visibility === 'group' ? { groupId } : {}),
          ...(visibility === 'people' ? { peopleIds } : {}),
        },
        skill.revision,
        crypto.randomUUID(),
      ),
      'Skill 信息已保存',
    )
  const saveVersion = (): Promise<void> =>
    draftVersion === undefined
      ? Promise.resolve()
      : run(
        'version',
        api.updateVersion(
          skill.skillId,
          draftVersion.version,
          {
            releaseNotes,
            dependencies: splitLines(dependencies),
            permissions: splitLines(permissions),
          },
          draftVersion.revision,
          crypto.randomUUID(),
        ),
        '版本信息已保存',
      )
  const upload = async (): Promise<void> => {
    if (draftVersion === undefined || file === undefined) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    await run('upload', api.uploadArtifact(skill.skillId, draftVersion.version, bytes, draftVersion.revision, crypto.randomUUID()), 'ZIP 已上传并完成服务端校验')
    setUploaded(true)
  }
  const submit = (): Promise<void> => (draftVersion === undefined || !uploaded ? Promise.resolve() : run('submit', api.submitReview(skill.skillId, draftVersion.version, draftVersion.revision, skill.revision, crypto.randomUUID()), '版本已提交审核'))
  const createVersion = (): Promise<void> =>
    newVersion.trim().length === 0
      ? Promise.resolve()
      : run(
        'new-version',
        api.createVersion(
          skill.skillId,
          {
            version: newVersion.trim(),
            releaseNotes: newReleaseNotes.trim(),
          },
          skill.revision,
          crypto.randomUUID(),
        ),
        '新版本草稿已创建',
      )
  const editable = skill.status === 'draft'
  return (
    <section className="editor-panel">
      <div className="editor-heading">
        <div>
          <span className="eyebrow">草稿编辑器</span>
          <h3>{skill.displayName}</h3>
        </div>
        <Status status={skill.status} />
      </div>
      <div className="editor-section">
        <div className="section-title">
          <strong>基本信息与可见范围</strong>
          <span className="revision">Skill r{skill.revision}</span>
        </div>
        <div className="form-columns">
          <label>
            中文名称
            <input
              value={name}
              disabled={!editable}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </label>
          <label>
            分类
            <input
              aria-label="分类"
              value={category}
              disabled={!editable}
              onChange={(event) => {
                setCategory(event.target.value)
              }}
            />
          </label>
        </div>
        <label>
          简介
          <textarea
            value={summary}
            disabled={!editable}
            onChange={(event) => {
              setSummary(event.target.value)
            }}
          />
        </label>
        <label>
          标签
          <input
            aria-label="标签"
            value={tags}
            disabled={!editable}
            onChange={(event) => {
              setTags(event.target.value)
            }}
          />
        </label>
        <label>
          可见范围
          <select
            value={visibility}
            disabled={!editable}
            onChange={(event) => {
              setVisibility(event.target.value as TeamSkill['visibility'])
            }}
          >
            <option value="organization">所有人可见</option>
            <option value="group">本组内可见</option>
            <option value="people">特定人员可见</option>
          </select>
        </label>
        {editable && visibility === 'group' && (
          <label>
            可见组
            <select
              aria-label="可见组"
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value)
              }}
            >
              <option value="platform">平台组</option>
            </select>
          </label>
        )}
        {editable && visibility === 'people' && <PeopleSelector users={directoryUsers} selected={peopleIds} loading={directoryLoading} onChange={setPeopleIds} />}
        <button type="button" className="button secondary" disabled={!editable || busy !== undefined} onClick={() => void saveSkill()}>
          <Save size={14} />
          保存 Skill 信息
        </button>
      </div>
      {draftVersion === undefined ? (
        <div className="editor-section">
          <div className="section-title">
            <strong>创建新版本</strong>
            <span className="callout-inline">已发布内容不可编辑</span>
          </div>
          <div className="form-columns">
            <label>
              语义化版本
              <input
                aria-label="新版本号"
                value={newVersion}
                placeholder="例如：1.1.0"
                onChange={(event) => {
                  setNewVersion(event.target.value)
                }}
              />
            </label>
            <label>
              版本说明
              <input
                aria-label="新版本说明"
                value={newReleaseNotes}
                onChange={(event) => {
                  setNewReleaseNotes(event.target.value)
                }}
              />
            </label>
          </div>
          <button type="button" className="button primary" disabled={busy !== undefined || newVersion.trim().length === 0} onClick={() => void createVersion()}>
            <Plus size={14} />
            创建版本草稿
          </button>
        </div>
      ) : (
        <>
          <div className="editor-section">
            <div className="section-title">
              <strong>版本信息</strong>
              <span className="revision">
                v{draftVersion.version} · r{draftVersion.revision}
              </span>
            </div>
            <label>
              版本说明
              <textarea
                aria-label="版本说明"
                value={releaseNotes}
                onChange={(event) => {
                  setReleaseNotes(event.target.value)
                }}
              />
            </label>
            <div className="form-columns">
              <label>
                依赖
                <textarea
                  aria-label="依赖"
                  value={dependencies}
                  onChange={(event) => {
                    setDependencies(event.target.value)
                  }}
                  placeholder="每行一个依赖"
                />
              </label>
              <label>
                权限
                <textarea
                  aria-label="权限"
                  value={permissions}
                  onChange={(event) => {
                    setPermissions(event.target.value)
                  }}
                  placeholder="每行一个权限"
                />
              </label>
            </div>
            <button type="button" className="button secondary" disabled={busy !== undefined} onClick={() => void saveVersion()}>
              <Save size={14} />
              保存版本信息
            </button>
          </div>
          <div className="editor-section">
            <div className="section-title">
              <strong>平台托管制品</strong>
              <span className="revision">{draftVersion.artifactSizeBytes === undefined || draftVersion.artifactSizeBytes === 0 ? '尚未上传' : `${draftVersion.artifactSizeBytes} bytes`}</span>
            </div>
            <label>
              Skill ZIP
              <input
                aria-label="Skill ZIP"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  setFile(event.target.files?.[0])
                  setUploaded(false)
                }}
              />
            </label>
            <div className="validation-list">
              {draftVersion.validation.map(item => (
                <span key={item.name} className={item.status === 'passed' ? 'validation passed' : 'validation failed'}>
                  {item.status === 'passed' ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}
                  {item.name}
                </span>
              ))}
            </div>
            <button type="button" className="button secondary" disabled={busy !== undefined || file === undefined} onClick={() => void upload()}>
              <Upload size={14} />
              上传 ZIP
            </button>
          </div>
          <div className="editor-section submit-section">
            <div>
              <strong>提交审核</strong>
              <p>只有平台制品的自动校验全部通过后，服务端才会接受提交。</p>
            </div>
            <button type="button" className="button primary" disabled={busy !== undefined || !uploaded} onClick={() => void submit()}>
              <ShieldCheck size={14} />
              提交审核
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function PeopleSelector({
  users,
  selected,
  loading,
  onChange,
}: {
  users: readonly DirectoryUser[]
  selected: readonly string[]
  loading: boolean
  onChange: (value: readonly string[]) => void
}) {
  const toggle = (userId: string): void => {
    onChange(selected.includes(userId) ? selected.filter(value => value !== userId) : [...selected, userId])
  }
  return (
    <fieldset className="people-selector">
      <legend>
        <Users size={13} />
        可见人员
      </legend>
      {loading ? (
        <span className="field-hint">正在读取组织目录…</span>
      ) : users.length === 0 ? (
        <span className="field-hint">组织目录没有可选人员</span>
      ) : (
        users.map(user => (
          <label key={user.userId}>
            <input
              type="checkbox"
              checked={selected.includes(user.userId)}
              onChange={() => {
                toggle(user.userId)
              }}
            />
            {user.displayName}
            <small>{user.email}</small>
          </label>
        ))
      )}
    </fieldset>
  )
}

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}
function splitLines(value: string): readonly string[] {
  return value
    .split(/\r?\n/u)
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

function ReviewsPage({
  items,
  api,
  onAction,
}: {
  items: readonly ReviewItem[]
  api: TeamSkillApi
  onAction: (result: ApiResult<unknown>, message: string) => void
}) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>()
  const [checks, setChecks] = useState<Record<string, 'pass' | 'fail' | 'na'>>({})
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const current = useMemo(() => items.find(item => reviewKey(item) === selectedKey) ?? items.at(0), [items, selectedKey])
  const currentKey = current === undefined ? undefined : reviewKey(current)

  useEffect(() => {
    setChecks({})
    setRejectOpen(false)
    setRejectReason('')
  }, [currentKey])

  const approve = async (): Promise<void> => {
    if (current === undefined) return
    setBusy(true)
    const result = await api.approve(
      current.skill.skillId,
      current.version.version,
      checks,
      current.version.revision,
      current.skill.revision,
      crypto.randomUUID(),
    )
    setBusy(false)
    onAction(result, '版本已批准')
  }

  const reject = async (): Promise<void> => {
    if (current === undefined || rejectReason.trim().length === 0) return
    setBusy(true)
    const result = await api.reject(
      current.skill.skillId,
      current.version.version,
      rejectReason.trim(),
      current.version.revision,
      current.skill.revision,
      crypto.randomUUID(),
    )
    setBusy(false)
    if (result.ok) {
      setRejectOpen(false)
      setRejectReason('')
    }
    onAction(result, '版本已驳回')
  }

  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">管理员工作区</span>
          <h2>审核队列</h2>
          <p>未完成结构化审核项不能批准。驳回原因必须由服务端记录。</p>
        </div>
        <span className="count-badge warning">{items.length} 待处理</span>
      </div>
      {current === undefined ? (
        <Empty text="当前没有待审核版本" />
      ) : (
        <div className="review-layout">
          <div className="review-list">
            {items.map(item => (
              <button
                type="button"
                className={reviewKey(item) === currentKey ? 'review-item selected-review' : 'review-item'}
                key={reviewKey(item)}
                onClick={() => {
                  setSelectedKey(reviewKey(item))
                }}
              >
                <strong>{item.skill.displayName}</strong>
                <small>
                  v{item.version.version} · {item.skill.authorName ?? '作者未提供'}
                </small>
                <Status status={item.version.status} />
              </button>
            ))}
          </div>
          <div className="review-panel">
            <div className="review-title">
              <div>
                <span className="eyebrow">待审版本</span>
                <h3>
                  {current.skill.displayName} v{current.version.version}
                </h3>
              </div>
              <span className="revision">r{current.version.revision}</span>
            </div>
            <ReviewBlock title="内容与文件" value={current.version.releaseNotes} />
            <ReviewBlock title="依赖与权限" value={[...current.version.dependencies, ...current.version.permissions].join('、') || '未声明'} />
            <fieldset className="checks">
              <legend>人工审核清单</legend>
              {current.reviewChecks.map(check => (
                <label key={check.id}>
                  <input
                    type="checkbox"
                    checked={checks[check.id] === 'pass'}
                    onChange={(event) => {
                      setChecks(previous => ({
                        ...previous,
                        [check.id]: event.target.checked ? 'pass' : 'fail',
                      }))
                    }}
                  />
                  {check.label}
                </label>
              ))}
            </fieldset>
            <div className="review-actions">
              <button type="button" className="button primary" disabled={busy || current.reviewChecks.some(check => checks[check.id] !== 'pass')} onClick={() => void approve()}>
                <ShieldCheck size={15} />
                批准版本
              </button>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={() => {
                  setRejectOpen(true)
                }}
              >
                驳回版本
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectOpen && current !== undefined && (
        <ReasonDialog
          title="驳回版本"
          label="驳回原因"
          value={rejectReason}
          busy={busy}
          confirmLabel="确认驳回"
          onChange={setRejectReason}
          onCancel={() => {
            setRejectOpen(false)
          }}
          onConfirm={() => void reject()}
        />
      )}
    </section>
  )
}

function reviewKey(item: ReviewItem): string {
  return `${item.skill.skillId}-${item.version.version}`
}
function ReviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="review-block">
      <strong>{title}</strong>
      <p>{value}</p>
    </div>
  )
}

function ReasonDialog({
  title,
  label,
  value,
  busy,
  confirmLabel,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string
  label: string
  value: string
  busy: boolean
  confirmLabel: string
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
        <h2 id="reason-dialog-title">{title}</h2>
        <label>
          {label}
          <textarea
            aria-label={label}
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
            }}
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="button danger" disabled={busy || value.trim().length === 0} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

function ConfirmDialog({
  title,
  message,
  busy,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  busy: boolean
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

type ConfirmationRequest = {
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
}

function useConfirmDialog(): readonly [(request: ConfirmationRequest) => Promise<boolean>, React.ReactNode] {
  const [request, setRequest] = useState<(ConfirmationRequest & { readonly resolve: (value: boolean) => void }) | undefined>()
  const ask = useCallback(
    (next: ConfirmationRequest): Promise<boolean> =>
      new Promise((resolve) => {
        setRequest({ ...next, resolve })
      }),
    [],
  )
  const dialog =
    request === undefined ? null : (
      <ConfirmDialog
        title={request.title}
        message={request.message}
        busy={false}
        confirmLabel={request.confirmLabel ?? '确认'}
        onCancel={() => {
          const current = request
          setRequest(undefined)
          current.resolve(false)
        }}
        onConfirm={() => {
          const current = request
          setRequest(undefined)
          current.resolve(true)
        }}
      />
    )
  return [ask, dialog]
}

function RollbackDialog({
  versions,
  current,
  value,
  busy,
  onChange,
  onCancel,
  onConfirm,
}: {
  versions: readonly string[]
  current: string | undefined
  value: string
  busy: boolean
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const options = versions.filter(version => version !== current)
  return (
    <div className="dialog-backdrop">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="rollback-dialog-title">
        <h2 id="rollback-dialog-title">回滚版本</h2>
        <p>选择一个历史已发布版本作为当前推荐版本。</p>
        <label>
          目标版本
          <select
            aria-label="回滚目标版本"
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
            }}
          >
            <option value="">请选择版本</option>
            {options.map(version => (
              <option key={version} value={version}>
                v{version}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="button primary" disabled={busy || value.length === 0} onClick={onConfirm}>
            确认回滚
          </button>
        </div>
      </section>
    </div>
  )
}

function ReleasesPage({
  items,
  api,
  onAction,
}: {
  items: readonly TeamSkill[]
  api: TeamSkillApi
  onAction: (result: ApiResult<unknown>, message: string) => void
}) {
  const governed = items.filter(item => item.status === 'approved' || item.status === 'published' || item.status === 'withdrawn')
  const [busyKey, setBusyKey] = useState<string | undefined>()
  const [dialog, setDialog] = useState<
    | {
      readonly kind: 'publish' | 'withdraw' | 'rollback'
      readonly item: TeamSkill
    }
    | undefined
  >()
  const [reason, setReason] = useState('')
  const [rollbackVersion, setRollbackVersion] = useState('')

  const closeDialog = (): void => {
    setDialog(undefined)
    setReason('')
    setRollbackVersion('')
  }
  const confirm = async (): Promise<void> => {
    if (dialog === undefined) return
    const { item } = dialog
    const version = item.currentVersion ?? item.latestVersion
    if (version === undefined) return
    if (dialog.kind === 'withdraw' && reason.trim().length === 0) return
    if (dialog.kind === 'rollback' && rollbackVersion.length === 0) return
    setBusyKey(item.skillId)
    const result = dialog.kind === 'publish' ? await api.publish(item.skillId, version, item.latestVersionRevision ?? item.revision, item.revision, crypto.randomUUID()) : dialog.kind === 'withdraw' ? await api.withdraw(item.skillId, version, reason.trim(), item.latestVersionRevision ?? item.revision, item.revision, crypto.randomUUID()) : await api.rollback(item.skillId, rollbackVersion, item.revision, crypto.randomUUID())
    setBusyKey(undefined)
    if (result.ok) closeDialog()
    onAction(result, dialog.kind === 'publish' ? '版本已发布' : dialog.kind === 'withdraw' ? '版本已下线' : '已回滚到指定版本')
  }

  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">版本治理</span>
          <h2>发布管理</h2>
          <p>发布、下线和回滚均要求当前修订号，历史制品不可变。</p>
        </div>
      </div>
      <div className="release-list">
        {governed.map((item) => {
          const versions = item.publishedVersions ?? []
          const canRollback = item.status === 'published' && versions.some(version => version !== item.currentVersion)
          return (
            <article className="release-row" key={`${item.skillId}-${item.status}-${item.currentVersion ?? 'none'}-${item.revision}`}>
              <div className="release-name">
                <strong>{item.displayName}</strong>
                <small>
                  {item.runtimeName} · {item.authorName ?? '平台作者'}
                </small>
              </div>
              <span>{item.currentVersion ? `v${item.currentVersion}` : '无推荐版本'}</span>
              <Status status={item.status} />
              <span className="revision">r{item.revision}</span>
              <div className="release-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busyKey !== undefined || item.status !== 'approved'}
                  onClick={() => {
                    setDialog({ kind: 'publish', item })
                  }}
                >
                  <Rocket size={14} />
                  发布
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busyKey !== undefined || item.status !== 'published'}
                  onClick={() => {
                    setDialog({ kind: 'withdraw', item })
                  }}
                >
                  下线
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busyKey !== undefined || !canRollback}
                  onClick={() => {
                    setRollbackVersion(versions.find(version => version !== item.currentVersion) ?? '')
                    setDialog({ kind: 'rollback', item })
                  }}
                >
                  回滚
                </button>
              </div>
            </article>
          )
        })}
        {governed.length === 0 && <Empty text="没有可治理的已批准或已发布版本" />}
      </div>
      {dialog !== undefined && dialog.kind === 'withdraw' && <ReasonDialog title="下线版本" label="下线原因" value={reason} busy={busyKey !== undefined} confirmLabel="确认下线" onChange={setReason} onCancel={closeDialog} onConfirm={() => void confirm()} />}
      {dialog !== undefined && dialog.kind === 'publish' && <ConfirmDialog title="发布版本" message={`确认发布 ${dialog.item.displayName} v${dialog.item.currentVersion ?? ''}？`} busy={busyKey !== undefined} confirmLabel="确认发布" onCancel={closeDialog} onConfirm={() => void confirm()} />}
      {dialog !== undefined && dialog.kind === 'rollback' && <RollbackDialog versions={dialog.item.publishedVersions ?? []} current={dialog.item.currentVersion} value={rollbackVersion} busy={busyKey !== undefined} onChange={setRollbackVersion} onCancel={closeDialog} onConfirm={() => void confirm()} />}
    </section>
  )
}

function AuditPage({ items }: { items: readonly AuditLogEntry[] }) {
  return (
    <section className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">管理员专属</span>
          <h2>审计日志</h2>
          <p>只展示服务端记录的治理和本地安装生命周期，不包含本地目录、Prompt 或代码正文。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>Skill / 版本</th>
              <th>作用域</th>
              <th>结果</th>
              <th>请求编号</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{formatDate(item.occurredAt)}</td>
                <td>{item.actor_name}</td>
                <td>{item.action}</td>
                <td>
                  {item.skillName} · v{item.version}
                </td>
                <td>{item.scope === undefined ? '治理操作' : item.scope === 'project' ? '项目' : '全局'}</td>
                <td>
                  <Status status={item.result === 'succeeded' ? 'published' : item.result === 'cancelled' ? 'withdrawn' : 'draft'} />
                </td>
                <td className="request-id">{item.requestId}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <Empty text="暂无审计记录" />}
      </div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Library size={19} />
      <span>{text}</span>
    </div>
  )
}
function Status({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已批准',
    published: '已发布',
    withdrawn: '已下线',
    succeeded: '成功',
  }
  return <span className={`status status-${status}`}>{labels[status] ?? status}</span>
}
function visibilityLabel(value: TeamSkill['visibility']): string {
  return value === 'organization' ? '所有人可见' : value === 'group' ? '本组内可见' : '特定人员可见'
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

type TelemetryWindowState = { readonly state: 'loading' } | { readonly state: 'ready' } | { readonly state: 'empty' } | { readonly state: 'error'; readonly error: ApiError }

function errorCode(error: ApiError): string {
  return error.kind === 'not-ready' ? 'NOT_READY' : error.code
}

function telemetryWindowDefaults(): {
  readonly from: string
  readonly to: string
} {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

function formatTelemetryTime(value: string | null): string {
  return value === null ? '—' : new Date(value).toLocaleString()
}

function formatDuration(value: number | null): string {
  return value === null ? '—' : `${value} ms`
}

function formatTokens(value: number | null): string {
  return value === null ? '缺失' : String(value)
}

/** Shared time-window filter row; requests always carry explicit UTC ISO bounds. */
function TelemetryWindowBar({
  from,
  to,
  onFrom,
  onTo,
  onRefresh,
  busy,
  children,
}: {
  readonly from: string
  readonly to: string
  readonly onFrom: (value: string) => void
  readonly onTo: (value: string) => void
  readonly onRefresh: () => void
  readonly busy: boolean
  readonly children?: React.ReactNode
}) {
  const localValue = (iso: string): string => {
    const date = new Date(iso)
    const pad = (input: number): string => String(input).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  return (
    <div className="account-toolbar" role="search" aria-label="可观测筛选">
      <label>
        开始 (UTC)
        <input
          type="datetime-local"
          value={localValue(from)}
          onChange={(event) => {
            const next = event.target.value
            if (next.length > 0) onFrom(new Date(next).toISOString())
          }}
        />
      </label>
      <label>
        结束 (UTC)
        <input
          type="datetime-local"
          value={localValue(to)}
          onChange={(event) => {
            const next = event.target.value
            if (next.length > 0) onTo(new Date(next).toISOString())
          }}
        />
      </label>
      {children}
      <button className="button secondary" disabled={busy} onClick={onRefresh}>
        <RefreshCw size={15} />
        {busy ? '读取中…' : '刷新'}
      </button>
    </div>
  )
}

function TelemetrySummaryCards({ summary }: { readonly summary: TelemetrySummary }) {
  return (
    <div className="form-columns" aria-label="运行摘要">
      <section className="editor-section">
        <h3 className="section-title">Session</h3>
        <p>
          总数 {summary.sessions.total} · 完成 {summary.sessions.completed} · 错误 {summary.sessions.errors} · 中断 {summary.sessions.interrupted} ·{' '}
          取消 {summary.sessions.cancelled}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">Turn</h3>
        <p>
          总数 {summary.turns.total} · 完成 {summary.turns.completed} · 错误 {summary.turns.errors} · 阻断 {summary.turns.blocked} · Token 上限 {summary.turns.max_tokens} · p50 {formatDuration(summary.turns.p50_duration_ms)} ·{' '}
          p95 {formatDuration(summary.turns.p95_duration_ms)}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">Step</h3>
        <p>
          开始 {summary.steps.started} · 结束 {summary.steps.finished} · p50 {formatDuration(summary.steps.p50_duration_ms)} ·{' '}
          p95 {formatDuration(summary.steps.p95_duration_ms)}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">模型与 Token</h3>
        <p>
          请求 {summary.llm.requests} · 重试 {summary.llm.retries} · 输入 {summary.llm.input_tokens} · 输出 {summary.llm.output_tokens} · 总 Token {formatTokens(summary.llm.total_tokens)} ·{' '}
          Token 样本 {summary.llm.token_sample_size}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">工具</h3>
        <p>
          调用 {summary.tools.calls} · 错误 {summary.tools.errors} · p50 {formatDuration(summary.tools.p50_duration_ms)} ·{' '}
          p95 {formatDuration(summary.tools.p95_duration_ms)}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">审批与压缩</h3>
        <p>
          审批 {summary.approvals.requested}（允许 {summary.approvals.allowed_once} · 拒绝 {summary.approvals.rejected} · 取消 {summary.approvals.cancelled} · 不可用{' '}
          {summary.approvals.unavailable}）· 压缩 {summary.compactions}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">采集管道</h3>
        <p>
          accepted {summary.delivery.accepted} · duplicate {summary.delivery.duplicate} · retryable {summary.delivery.retryable} · rejected {summary.delivery.rejected} ·{' '}
          queued（fixture 恒为 0） {summary.delivery.queued} · 缺口 {summary.delivery.gaps}
          {summary.delivery.gaps > 0 || summary.delivery.rejected > 0 ? '（存在丢弃、拒收或未上报数据）' : ''}
        </p>
      </section>
      <section className="editor-section">
        <h3 className="section-title">Token 说明</h3>
        <p>仅统计服务端真实 Token 数量；缺失保持缺失，不计算成本或金额。</p>
      </section>
    </div>
  )
}

function TelemetryWindowFilterError({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null
  return (
    <div className="action-message" role="alert">
      {message}
    </div>
  )
}

/** Overview page: role-visible aggregation and pipeline health for one window. */
export function TelemetryOverviewPage({ api }: { readonly api: TeamSkillApi }) {
  const initial = telemetryWindowDefaults()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [organizationId, setOrganizationId] = useState<string | undefined>()
  const [projectId, setProjectId] = useState<string | undefined>()
  const [projects, setProjects] = useState<readonly AdminProject[]>([])
  const [state, setState] = useState<TelemetryWindowState>({
    state: 'loading',
  })
  const [overview, setOverview] = useState<TelemetryOverview | undefined>()
  const [busy, setBusy] = useState(false)
  const [filterError, setFilterError] = useState<string | undefined>()
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>()
  const requestSequence = useRef(0)

  const load = async (): Promise<void> => {
    const sequence = ++requestSequence.current
    setBusy(true)
    setFilterError(undefined)
    const result = await api.getTelemetryOverview({
      from,
      to,
      ...(organizationId === undefined ? {} : { organizationId }),
      ...(projectId === undefined ? {} : { projectId }),
    })
    if (sequence !== requestSequence.current) return
    setBusy(false)
    if (!result.ok) {
      if (errorCode(result.error) === 'INVALID_TIME_RANGE' || errorCode(result.error) === 'PROJECT_CONTEXT_MISMATCH') {
        setFilterError(errorMessage(result.error))
        return
      }
      setState({ state: 'error', error: result.error })
      return
    }
    setLastLoadedAt(new Date().toLocaleString())
    setOverview(result.value)
    setState(result.value.has_data ? { state: 'ready' } : { state: 'empty' })
  }

  useEffect(() => {
    void api.listProjects().then((result) => {
      if (result.ok) setProjects(result.value)
    })
  }, [api])

  useEffect(() => {
    void load()
  }, [from, to, organizationId, projectId])

  return (
    <div className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">AI CODING 可观测</span>
          <h2>总览</h2>
          <p>服务端按当前角色授权范围返回聚合；不合并未授权项目，不在浏览器计算 Token 或成本。</p>
        </div>
      </div>
      <TelemetryWindowBar from={from} to={to} onFrom={setFrom} onTo={setTo} onRefresh={() => void load()} busy={busy}>
        <label>
          组织
          <select
            value={organizationId ?? ''}
            onChange={(event) => {
              setOrganizationId(event.target.value === '' ? undefined : event.target.value)
              setProjectId(undefined)
            }}
          >
            <option value="">全部授权组织</option>
            {[...new Set(projects.map(project => `${project.organization_id}\u0000${project.organization_name}`))].map((pair) => {
              const parts = pair.split('\u0000')
              const id = parts[0] ?? ''
              const name = parts[1] ?? id
              return (
                <option key={id} value={id}>
                  {name}
                </option>
              )
            })}
          </select>
        </label>
        <label>
          项目
          <select
            value={projectId ?? ''}
            onChange={(event) => {
              setProjectId(event.target.value === '' ? undefined : event.target.value)
            }}
          >
            <option value="">全部授权项目</option>
            {projects
              .filter(project => organizationId === undefined || project.organization_id === organizationId)
              .map(project => (
                <option key={project.project_id} value={project.project_id}>
                  {project.name}
                </option>
              ))}
          </select>
        </label>
      </TelemetryWindowBar>
      <TelemetryWindowFilterError message={filterError} />
      {state.state === 'loading' && <Loading />}
      {state.state === 'error' && <ErrorState error={state.error} onRetry={() => void load()} />}
      {state.state === 'empty' && (
        <section className="state-panel">
          <h2>当前窗口没有数据</h2>
          <p>
            服务端确认空结果（has_data=false）
            {lastLoadedAt === undefined ? '' : ` · 最近成功读取 ${lastLoadedAt}`}。
          </p>
        </section>
      )}
      {state.state === 'ready' && overview !== undefined && (
        <>
          <TelemetrySummaryCards summary={overview.summary} />
          <section className="editor-section">
            <h3 className="section-title">时间桶</h3>
            {overview.buckets.length === 0 ? (
              <p>当前窗口没有时间桶数据。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <caption>按天聚合（保留 {overview.retention_days} 天原始事件；Token 缺失保持缺失，不计算成本）</caption>
                  <thead>
                    <tr>
                      <th>桶起点 (UTC)</th>
                      <th>Session</th>
                      <th>Turn</th>
                      <th>LLM 请求</th>
                      <th>输入 Token</th>
                      <th>输出 Token</th>
                      <th>总 Token</th>
                      <th>工具调用</th>
                      <th>缺口</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.buckets.map((bucket: TelemetryBucket) => (
                      <tr key={bucket.bucket_start}>
                        <td>{bucket.bucket_start}</td>
                        <td>{bucket.sessions.total}</td>
                        <td>{bucket.turns.total}</td>
                        <td>{bucket.llm.requests}</td>
                        <td>{bucket.llm.input_tokens}</td>
                        <td>{bucket.llm.output_tokens}</td>
                        <td>{formatTokens(bucket.llm.total_tokens)}</td>
                        <td>{bucket.tools.calls}</td>
                        <td>{bucket.delivery.gaps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** Project page: one authorized project's runtime, token, tool, approval and pipeline summary. */
export function TelemetryProjectPage({ api }: { readonly api: TeamSkillApi }) {
  const initial = telemetryWindowDefaults()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [projects, setProjects] = useState<readonly AdminProject[]>([])
  const [projectId, setProjectId] = useState<string | undefined>()
  const [state, setState] = useState<TelemetryWindowState>({
    state: 'loading',
  })
  const [summary, setSummary] = useState<TelemetryProjectSummary | undefined>()
  const [busy, setBusy] = useState(false)
  const [filterError, setFilterError] = useState<string | undefined>()
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>()
  const requestSequence = useRef(0)

  useEffect(() => {
    void api.listProjects().then((result) => {
      if (result.ok) setProjects(result.value)
    })
  }, [api])

  const load = async (): Promise<void> => {
    if (projectId === undefined) {
      setState({ state: 'empty' })
      return
    }
    const sequence = ++requestSequence.current
    setBusy(true)
    setFilterError(undefined)
    const result = await api.getProjectTelemetrySummary(projectId, {
      from,
      to,
    })
    if (sequence !== requestSequence.current) return
    setBusy(false)
    if (!result.ok) {
      if (errorCode(result.error) === 'INVALID_TIME_RANGE' || errorCode(result.error) === 'PROJECT_CONTEXT_MISMATCH') {
        setFilterError(errorMessage(result.error))
        return
      }
      setState({ state: 'error', error: result.error })
      return
    }
    setLastLoadedAt(new Date().toLocaleString())
    setSummary(result.value)
    setState(result.value.has_data ? { state: 'ready' } : { state: 'empty' })
  }

  useEffect(() => {
    void load()
  }, [from, to, projectId])

  return (
    <div className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">AI CODING 可观测</span>
          <h2>项目详情</h2>
          <p>必须选择服务端授权的项目；项目失权后服务端返回 403/404，页面不会用旧数据替代。</p>
        </div>
      </div>
      <TelemetryWindowBar from={from} to={to} onFrom={setFrom} onTo={setTo} onRefresh={() => void load()} busy={busy}>
        <label>
          项目
          <select
            value={projectId ?? ''}
            aria-label="可观测项目"
            onChange={(event) => {
              setProjectId(event.target.value === '' ? undefined : event.target.value)
            }}
          >
            <option value="">请选择授权项目</option>
            {projects.map(project => (
              <option key={project.project_id} value={project.project_id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </TelemetryWindowBar>
      <TelemetryWindowFilterError message={filterError} />
      {projectId === undefined && (
        <section className="state-panel">
          <h2>请先选择项目</h2>
          <p>项目列表来自服务端授权；未授权项目不在候选中。</p>
        </section>
      )}
      {projectId !== undefined && state.state === 'loading' && <Loading />}
      {projectId !== undefined && state.state === 'error' && <ErrorState error={state.error} onRetry={() => void load()} />}
      {projectId !== undefined && state.state === 'empty' && (
        <section className="state-panel">
          <h2>当前窗口没有数据</h2>
          <p>
            服务端确认空结果
            {lastLoadedAt === undefined ? '' : ` · 最近成功读取 ${lastLoadedAt}`}。
          </p>
        </section>
      )}
      {projectId !== undefined && state.state === 'ready' && summary !== undefined && (
        <>
          <TelemetrySummaryCards summary={summary.summary} />
          <section className="editor-section">
            <h3 className="section-title">模型与 Token 分布</h3>
            <div className="table-wrap">
              <table>
                <caption>未知 provider/model 显示为 unknown；缺失总 Token 保持缺失，不计算成本。</caption>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>请求数</th>
                    <th>输入 Token</th>
                    <th>输出 Token</th>
                    <th>总 Token</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.models.map((model: TelemetryModelUsage) => (
                    <tr key={`${model.provider}:${model.model}`}>
                      <td>{model.provider}</td>
                      <td>{model.model}</td>
                      <td>{model.requests}</td>
                      <td>{model.input_tokens}</td>
                      <td>{model.output_tokens}</td>
                      <td>{formatTokens(model.total_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="editor-section">
            <h3 className="section-title">工具分布</h3>
            <div className="table-wrap">
              <table>
                <caption>只展示工具名与聚合；不显示工具参数或结果正文。</caption>
                <thead>
                  <tr>
                    <th>工具</th>
                    <th>调用量</th>
                    <th>错误率</th>
                    <th>p50</th>
                    <th>p95</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.tools.map((tool: TelemetryToolUsage) => (
                    <tr key={tool.tool_name}>
                      <td>{tool.tool_name}</td>
                      <td>{tool.calls}</td>
                      <td>{tool.calls === 0 ? '—' : `${Math.round((tool.errors / tool.calls) * 100)}%`}</td>
                      <td>{formatDuration(tool.p50_duration_ms)}</td>
                      <td>{formatDuration(tool.p95_duration_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

const TELEMETRY_KINDS: readonly string[] = ['session.started', 'session.finished', 'turn.started', 'turn.finished', 'step.started', 'step.finished', 'llm.request', 'llm.response', 'tool.call', 'tool.result', 'approval.requested', 'approval.resolved', 'compaction.completed', 'agent.error', 'delivery.gap']

const TELEMETRY_OUTCOMES: readonly string[] = ['success', 'error', 'interrupted', 'cancelled', 'blocked', 'max_tokens']

/** Events page: structured event diagnostics with opaque-cursor pagination. */
export function TelemetryEventsPage({ api }: { readonly api: TeamSkillApi }) {
  const initial = telemetryWindowDefaults()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [projects, setProjects] = useState<readonly AdminProject[]>([])
  const [projectId, setProjectId] = useState<string | undefined>()
  const [kind, setKind] = useState<string | undefined>()
  const [outcome, setOutcome] = useState<string | undefined>()
  const [page, setPage] = useState<TelemetryEventPage | undefined>()
  const [state, setState] = useState<TelemetryWindowState>({
    state: 'loading',
  })
  const [busy, setBusy] = useState(false)
  const [filterError, setFilterError] = useState<string | undefined>()
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>()
  const cursorStack = useRef<readonly string[]>([])
  const requestSequence = useRef(0)

  useEffect(() => {
    void api.listProjects().then((result) => {
      if (result.ok) setProjects(result.value)
    })
  }, [api])

  const load = async (cursor?: string): Promise<void> => {
    if (projectId === undefined) {
      setState({ state: 'empty' })
      return
    }
    const sequence = ++requestSequence.current
    setBusy(true)
    setFilterError(undefined)
    const result = await api.listProjectTelemetryEvents(projectId, {
      from,
      to,
      ...(kind === undefined ? {} : { kind }),
      ...(outcome === undefined ? {} : { outcome }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: 50,
    })
    if (sequence !== requestSequence.current) return
    setBusy(false)
    if (!result.ok) {
      if (errorCode(result.error) === 'INVALID_CURSOR') {
        // A stale or mismatched cursor resets to the first page instead of surfacing an error.
        cursorStack.current = []
        await load()
        return
      }
      if (errorCode(result.error) === 'INVALID_TIME_RANGE' || errorCode(result.error) === 'PROJECT_CONTEXT_MISMATCH') {
        setFilterError(errorMessage(result.error))
        return
      }
      setState({ state: 'error', error: result.error })
      return
    }
    setLastLoadedAt(new Date().toLocaleString())
    setPage(result.value)
    setState(result.value.items.length === 0 ? { state: 'empty' } : { state: 'ready' })
  }

  useEffect(() => {
    cursorStack.current = []
    void load()
  }, [from, to, projectId, kind, outcome])

  return (
    <div className="page-body">
      <div className="page-intro">
        <div>
          <span className="eyebrow">AI CODING 可观测</span>
          <h2>事件诊断</h2>
          <p>结构化事件查看器，不是会话记录浏览器；只显示服务端白名单字段和清洗后的错误摘要。</p>
        </div>
      </div>
      <TelemetryWindowBar
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        onRefresh={() => {
          cursorStack.current = []
          void load()
        }}
        busy={busy}
      >
        <label>
          项目
          <select
            value={projectId ?? ''}
            aria-label="诊断项目"
            onChange={(event) => {
              setProjectId(event.target.value === '' ? undefined : event.target.value)
            }}
          >
            <option value="">请选择授权项目</option>
            {projects.map(project => (
              <option key={project.project_id} value={project.project_id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          kind
          <select
            value={kind ?? ''}
            onChange={(event) => {
              setKind(event.target.value === '' ? undefined : event.target.value)
            }}
          >
            <option value="">全部 kind</option>
            {TELEMETRY_KINDS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          outcome
          <select
            value={outcome ?? ''}
            onChange={(event) => {
              setOutcome(event.target.value === '' ? undefined : event.target.value)
            }}
          >
            <option value="">全部 outcome</option>
            {TELEMETRY_OUTCOMES.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </TelemetryWindowBar>
      <TelemetryWindowFilterError message={filterError} />
      {projectId === undefined && (
        <section className="state-panel">
          <h2>请先选择项目</h2>
          <p>项目列表来自服务端授权；筛选变化会清空游标并从第一页读取。</p>
        </section>
      )}
      {projectId !== undefined && state.state === 'loading' && <Loading />}
      {projectId !== undefined && state.state === 'error' && <ErrorState error={state.error} onRetry={() => void load()} />}
      {projectId !== undefined && state.state === 'empty' && (
        <section className="state-panel">
          <h2>没有匹配的结构化事件</h2>
          <p>
            服务端确认空结果
            {lastLoadedAt === undefined ? '' : ` · 最近成功读取 ${lastLoadedAt}`}。
          </p>
        </section>
      )}
      {projectId !== undefined && page !== undefined && page.items.length > 0 && (
        <section className="editor-section">
          <h3 className="section-title">结构化事件（原始事件保留 {page.retention_days} 天；缺口事件用于解释不连续数据）</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>发生时间</th>
                  <th>接收时间</th>
                  <th>kind</th>
                  <th>session</th>
                  <th>seq</th>
                  <th>turn/step</th>
                  <th>model</th>
                  <th>工具</th>
                  <th>耗时</th>
                  <th>outcome</th>
                  <th>Token (入/出/总)</th>
                  <th>错误</th>
                  <th>缺口</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((item: TelemetryEventItem) => (
                  <tr key={item.event_id}>
                    <td>{formatTelemetryTime(item.occurred_at)}</td>
                    <td>{formatTelemetryTime(item.received_at)}</td>
                    <td>{item.kind}</td>
                    <td>{item.session_id ?? '—'}</td>
                    <td>{item.source_seq ?? '—'}</td>
                    <td>
                      {item.turn ?? '—'}/{item.step ?? '—'}
                    </td>
                    <td>{item.model ?? '—'}</td>
                    <td>{item.tool_name ?? '—'}</td>
                    <td>{formatDuration(item.duration_ms)}</td>
                    <td>{item.outcome ?? '—'}</td>
                    <td>{item.token_usage === null ? '—' : `${formatTokens(item.token_usage.input_tokens)} / ${formatTokens(item.token_usage.output_tokens)} / ${formatTokens(item.token_usage.total_tokens)}`}</td>
                    <td>{item.error === null ? '—' : `${item.error.name}${item.error.code === null ? '' : `/${item.error.code}`}${item.error.summary === null ? '' : ` · ${item.error.summary}`}`}</td>
                    <td>{item.gap === null ? '—' : `${item.gap.reason} × ${item.gap.count}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dialog-actions">
            <button
              className="button secondary"
              disabled={busy || cursorStack.current.length === 0}
              onClick={() => {
                const stack = [...cursorStack.current]
                const previous = stack.pop()
                cursorStack.current = stack
                if (previous !== undefined) void load(previous)
              }}
            >
              上一页
            </button>
            <button
              className="button secondary"
              disabled={busy || !page.has_more || page.next_cursor === null}
              onClick={() => {
                if (page.next_cursor === null) return
                cursorStack.current = [...cursorStack.current, page.next_cursor]
                void load(page.next_cursor)
              }}
            >
              下一页
            </button>
            <span className="request-id">opaque cursor 分页：浏览器不解析、排序或拼接游标。</span>
          </div>
        </section>
      )}
    </div>
  )
}
