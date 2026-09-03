'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  FilePenLine,
  FolderKanban,
  KeyRound,
  Library,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  Upload,
  Users,
  UserRound,
  SlidersHorizontal,
  ScrollText as AuditIcon,
} from 'lucide-react'
import { TeamSkillApi, type ApiError, type ApiResult } from '../lib/team-skill-api.ts'
import type {
  AccountRole,
  AdminKnowledgeBase,
  AdminKnowledgeDocument,
  AdminMemoryAudit,
  AdminMemoryJob,
  AdminMemoryPolicy,
  AdminMemoryRecord,
  AdminOrganization,
  AdminProject,
  AdminProjectAsset,
  AdminProjectMember,
  AdminUser,
  AuthorizationAudit,
  AuditLogEntry,
  DirectoryUser,
  PermissionDefinition,
  ReviewItem,
  RoleDefinition,
  SkillVersion,
  TeamSkill,
} from '../lib/team-skill-types.ts'

type PageId =
  | 'directory'
  | 'drafts'
  | 'reviews'
  | 'releases'
  | 'audit'
  | 'knowledge-bases'
  | 'memory-library'
  | 'projects'
  | 'account-users'
  | 'account-roles'
  | 'account-projects'
  | 'account-audit'
type NavGroup = 'skills' | 'memory' | 'projects' | 'permissions'
type Loaded =
  | { readonly page: PageId; readonly state: 'loading' }
  | { readonly page: PageId; readonly state: 'ready'; readonly value: readonly unknown[] }
  | { readonly page: PageId; readonly state: 'error'; readonly error: ApiError }
type NavIcon = typeof Library
type NavItem = { readonly id: PageId; readonly label: string; readonly hint: string; readonly icon: NavIcon }
type FutureNavItem = { readonly label: string; readonly hint: string; readonly icon: NavIcon }
export interface DashboardSession {
  readonly user: { readonly id: string; readonly name?: string | null; readonly email?: string | null }
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
const KNOWLEDGE_NAV: readonly NavItem[] = [{ id: 'knowledge-bases', label: '知识库', hint: '文档、FAQ 与 Wiki', icon: BookOpen }]
const MEMORY_NAV: readonly NavItem[] = [
  { id: 'memory-library', label: '记忆列表、策略、任务与审计', hint: '项目团队记忆治理', icon: Database },
]

const PROJECT_NAV: readonly NavItem[] = [{ id: 'projects', label: '项目列表', hint: '项目资源与生命周期', icon: FolderKanban }]

const PERMISSION_NAV: readonly NavItem[] = [
  { id: 'account-users', label: '用户与成员', hint: '账号与组织关系', icon: UserRound },
  { id: 'account-roles', label: '角色与权限', hint: '服务端固定矩阵', icon: KeyRound },
  { id: 'account-projects', label: '项目授权', hint: '项目成员关系', icon: SlidersHorizontal },
  { id: 'account-audit', label: '授权审计', hint: '账号与授权事件', icon: AuditIcon },
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
    const result = await signIn('credentials', { username, password, redirect: false })
    setBusy(false)
    if (result.error !== undefined) {
      setError('用户名或密码错误')
      return
    }
    window.location.reload()
  }
  return (
    <AuthPage
      title="登录团队 Skill 管理后台"
      description="使用服务端账号登录后才能查看组织、账号和 Skill 数据。"
      onSubmit={submit}
      error={error}
      busy={busy}
      username={username}
      password={password}
      onUsername={setUsername}
      onPassword={setPassword}
      submitLabel="登录"
    />
  )
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
        headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      if (!response.ok) {
        setError('密码修改失败，请检查当前密码和新密码')
        setBusy(false)
        return
      }
      const result = await signIn('credentials', { username, password: newPassword, redirect: false })
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
            用户名
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
  const [page, setPage] = useState<PageId>('directory')
  const [routeRevision, setRouteRevision] = useState(0)
  const [expandedGroup, setExpandedGroup] = useState<NavGroup>('skills')
  const [loaded, setLoaded] = useState<Loaded>({ page: 'directory', state: 'loading' })
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
    setExpandedGroup(route.page === 'projects' ? 'projects' : route.page === 'memory-library' ? 'memory' : 'skills')
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
      void reload(false)
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
            <span className="crumb">
              团队治理 /{' '}
              {page === 'projects'
                ? '项目管理'
                : page === 'knowledge-bases'
                  ? '知识库管理'
                  : page === 'memory-library'
                    ? '记忆库管理'
                    : page.startsWith('account-')
                      ? '权限管理'
                      : 'Skill 管理'}
            </span>
            <h1>{pageLabel(page)}</h1>
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
        {loaded.page === page && loaded.state === 'ready' && page === 'directory' && (
          <DirectoryPage items={loaded.value as TeamSkill[]} selected={selectedSkill} onSelect={setSelectedSkill} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'drafts' && (
          <DraftsPage items={loaded.value as TeamSkill[]} api={api} onAction={showAction} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'reviews' && (
          <ReviewsPage items={loaded.value as ReviewItem[]} api={api} onAction={showAction} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'releases' && (
          <ReleasesPage items={loaded.value as TeamSkill[]} api={api} onAction={showAction} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'audit' && <AuditPage items={loaded.value as AuditLogEntry[]} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'knowledge-bases' && (
          <KnowledgeBasesPage items={loaded.value as AdminKnowledgeBase[]} api={api} role={effectiveRole} onAction={showAction} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'memory-library' && (
          <MemoryLibraryPage
            items={loaded.value as AdminMemoryRecord[]}
            api={api}
            role={effectiveRole}
            userId={session?.user.id}
            onAction={showAction}
          />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-users' && (
          <UsersPage items={loaded.value as AdminUser[]} api={api} role={effectiveRole} onAction={showAction} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-roles' && <RolesPage api={api} role={effectiveRole} />}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-projects' && (
          <ProjectsPage items={loaded.value as AdminProject[]} api={api} role={effectiveRole} onAction={showAction} />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'projects' && (
          <ProjectManagementPage
            key={routeRevision}
            items={loaded.value as AdminProject[]}
            api={api}
            role={effectiveRole}
            onAction={showAction}
            route={readAdminRoute()}
          />
        )}
        {loaded.page === page && loaded.state === 'ready' && page === 'account-audit' && (
          <AuthorizationAuditPage items={loaded.value as AuthorizationAudit[]} api={api} role={effectiveRole} />
        )}
      </main>
    </div>
  )
}

type ProjectTab = 'overview' | 'members' | 'assets' | 'audit'
type AdminRoute = { readonly page: PageId; readonly projectId?: string; readonly tab?: ProjectTab }

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
  if (page === 'memory-library' && role === 'member') return Promise.resolve({ ok: true, value: [] })
  if (page === 'memory-library')
    return api.listMemoryRecords().then(result => (result.ok ? { ok: true, value: result.value.items } : result))
  if (page === 'account-users') return api.listUsers()
  if (page === 'account-projects' || page === 'projects') return api.listProjects()
  if (page === 'account-audit') return api.listAuthorizationAudits()
  return api.listRoles()
}

function pageLabel(page: PageId): string {
  return (
    [...NAV, ...KNOWLEDGE_NAV, ...MEMORY_NAV, ...PROJECT_NAV, ...PERMISSION_NAV].find(item => item.id === page)?.label ??
    (page === 'memory-library' ? '记忆列表、策略、任务与审计' : '管理后台')
  )
}
function roleLabel(role: AccountRole): string {
  return role === 'admin' ? '平台管理员' : role === 'manager' ? '组织经理' : '成员'
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
      { username: username.trim(), displayName: displayName.trim(), organizationIds: [organizationId], globalRole: newRole },
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
    if (!window.confirm(`${next === 'suspended' ? '停用' : '恢复'}账号 ${user.display_name}？`)) return
    setBusyId(user.user_id)
    const result = await api.updateUser(user.user_id, { status: next }, user.revision, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, next === 'suspended' ? '账号已停用' : '账号已恢复')
  }
  const removeMembership = async (user: AdminUser, membership: NonNullable<AdminUser['memberships']>[number]): Promise<void> => {
    if (!window.confirm(`从 ${membership.organization_name} 移除 ${user.display_name}？`)) return
    setBusyId(`${user.user_id}-${membership.organization_id}`)
    const result = await api.removeMembership(membership.organization_id, user.user_id, membership.revision, crypto.randomUUID())
    setBusyId(undefined)
    onAction(result, '成员关系已移除')
  }
  return (
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
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busyId === user.user_id}
                    onClick={() => void updateStatus(user)}
                  >
                    {user.status === 'active' ? '停用' : '恢复'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <Empty text="当前范围没有可见账号" />}
      </div>
    </section>
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
                      <strong>{item.role}</strong>
                    </td>
                    <td>{item.scope}</td>
                    <td>{item.description}</td>
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
  const [rows, setRows] = useState<readonly AdminProject[]>(items)

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
    const timer = window.setTimeout(() => {
      void api
        .listProjects({
          ...(filterOrganizationId.length === 0 ? {} : { organizationId: filterOrganizationId }),
          ...(status === '' ? {} : { status }),
          ...(query.trim().length === 0 ? {} : { name: query.trim() }),
        })
        .then((result) => {
          if (result.ok) setRows(result.value)
        })
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [api, filterOrganizationId, query, status])
  useEffect(() => {
    if (selectedId === undefined) {
      setDetail(undefined)
      return
    }
    setLoadingDetail(true)
    void api.getProject(selectedId).then((result) => {
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
  const transition = async (action: 'activate' | 'archive'): Promise<void> => {
    if (detail === undefined || !window.confirm(action === 'activate' ? '确认激活该项目？' : '归档后项目不可恢复，确认归档？')) return
    const result =
      action === 'activate'
        ? await api.activateProject(detail.project_id, detail.revision, crypto.randomUUID())
        : await api.archiveProject(detail.project_id, detail.revision, crypto.randomUUID())
    onAction(result, action === 'activate' ? '项目已激活' : '项目已归档')
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
            <option value="">草稿与 active</option>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
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
                {project.organization_name ?? project.organization_id} · r{project.revision} ·{' '}
                {project.updated_at === undefined ? '' : formatDate(project.updated_at)}
              </small>
              <span className={`status status-${project.status}`}>{project.status}</span>
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
                onTransition={action => void transition(action)}
                api={api}
                onAction={onAction}
              />
            )}
          </div>
        )}
      </div>
    </section>
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
      {tab === 'overview' && (
        <ProjectOverview
          detail={detail}
          name={name}
          description={description}
          onName={onName}
          onDescription={onDescription}
          onSave={onSave}
          onTransition={onTransition}
        />
      )}
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
        项目名称
        <input
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
  const load = async (): Promise<void> => {
    const [memberResult, userResult] = await Promise.all([api.listProjectMembers(detail.project_id), api.listUsers(detail.organization_id)])
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
    if (!window.confirm(`移除 ${member.display_name}？`)) return
    const result = await api.removeProjectMember(detail.project_id, member.user_id, member.revision, crypto.randomUUID())
    onAction(result, '项目成员已移除')
    if (result.ok) await load()
  }
  return (
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
              .filter(
                user =>
                  user.global_role === 'member' &&
                  user.memberships?.some(item => item.organization_id === detail.organization_id) &&
                  !members.some(member => member.user_id === user.user_id && member.status === 'active'),
              )
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
  const load = async (): Promise<void> => {
    const result = await api.listProjectAssets(detail.project_id)
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
      { assetType, assetId: assetId.trim(), relationKind: relation, revision: detail.revision },
      crypto.randomUUID(),
    )
    onAction(result, '资产关联已添加')
    if (result.ok) {
      setAssetId('')
      await load()
    }
  }
  const update = async (asset: AdminProjectAsset): Promise<void> => {
    const result = await api.updateProjectAsset(
      detail.project_id,
      asset.asset_type,
      asset.asset_id,
      asset.relation_kind === 'reference' ? 'context' : 'reference',
      asset.revision,
      crypto.randomUUID(),
    )
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
  const selected = items.find(item => item.project_id === selectedId)
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
    if (selected === undefined || memberId.length === 0) return
    const existing = members.find(member => member.user_id === memberId)
    const result = await api.setProjectMember(selected.project_id, memberId, existing?.revision ?? selected.revision, crypto.randomUUID())
    onAction(result, '项目成员已授权')
    if (result.ok) {
      setMemberId('')
      await refreshMembers(selected)
    }
  }
  const remove = async (member: AdminProjectMember): Promise<void> => {
    if (selected === undefined || !window.confirm(`从项目移除 ${member.display_name}？`)) return
    const result = await api.removeProjectMember(selected.project_id, member.user_id, member.revision, crypto.randomUUID())
    onAction(result, '项目成员已移除')
    if (result.ok) await refreshMembers(selected)
  }
  return (
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
              <span className={`status status-${project.status}`}>{project.status === 'active' ? '正常' : '已归档'}</span>
            </button>
          ))}
          {items.length === 0 && <Empty text="当前范围没有可见项目" />}
        </div>
        {selected !== undefined && (
          <div className="detail-panel">
            <span className="eyebrow">项目成员</span>
            <h3>{selected.name}</h3>
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
                  .filter(
                    user =>
                      user.global_role === 'member' &&
                      user.memberships?.some(membership => membership.organization_id === selected.organization_id),
                  )
                  .filter(user => !members.some(member => member.user_id === user.user_id && member.status === 'active'))
                  .map(user => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name} · {user.username}
                    </option>
                  ))}
              </select>
              <button type="button" className="button primary" disabled={memberId.length === 0} onClick={() => void add()}>
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
                    <button type="button" className="text-danger" onClick={() => void remove(member)}>
                      移除
                    </button>
                  </div>
                ))}
              {members.filter(member => member.status === 'active').length === 0 && <Empty text="暂无项目成员" />}
            </div>
          </div>
        )}
      </div>
    </section>
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
      <h2>{error.kind === 'not-ready' ? 'Skill 服务尚未配置' : error.kind === 'unauthorized' ? '登录已失效' : '服务请求失败'}</h2>
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
      readonly affected_projects: readonly { readonly project_id: string; readonly name: string; readonly status: string }[]
    }
    | undefined
  >()
  useEffect(() => {
    void api.listOrganizations().then((result) => {
      if (result.ok) {
        setOrganizations(result.value)
        if (organizationId.length === 0 && result.value.length > 0) setOrganizationId(result.value[0].organization_id)
      }
    })
  }, [api, organizationId.length])
  const load = async (id: string): Promise<void> => {
    const [detail, docs] = await Promise.all([api.getKnowledgeBase(id), api.listKnowledgeDocuments(id)])
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
    if (
      operationId === undefined ||
      operationStatus === undefined ||
      operationStatus === 'succeeded' ||
      operationStatus === 'failed' ||
      operationStatus === 'cancelled'
    )
      return
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
    const result = await api.importKnowledgeMarkdown(
      selected.knowledge_base_id,
      { title: title.trim() || '未命名文档', markdown },
      selected.revision,
      crypto.randomUUID(),
    )
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
    const result = await api.getKnowledgeDeleteImpact(selected.knowledge_base_id)
    if (result.ok) setImpact(result.value)
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
  const tabs: Array<{ readonly id: typeof tab; readonly label: string; readonly visible: boolean }> = [
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
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void importMarkdown()}
                    disabled={markdown.trim().length === 0}
                  >
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
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => void importFile()}
                    disabled={fileName.trim().length === 0}
                  >
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
  const [targetProjectId, setTargetProjectId] = useState('')
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
  const [busy, setBusy] = useState(false)
  const canWrite = role !== 'member'
  const canEdit = (record: AdminMemoryRecord): boolean => canWrite || record.captured_by_user_id === userId

  useEffect(() => {
    void (role === 'member' ? api.listMemoryProjects() : api.listProjects()).then((result) => {
      if (result.ok) {
        setProjects(result.value)
        if (projectId.length === 0 && result.value.length > 0) setProjectId(result.value[0].project_id)
      } else onAction(result, '读取项目失败')
    })
  }, [api, onAction, projectId.length, role])
  const loadRecords = async (next?: string): Promise<void> => {
    setBusy(true)
    const result = await api.listMemoryRecords({ projectId: projectId || undefined, keyword: query || undefined, cursor: next })
    setBusy(false)
    if (!result.ok) {
      onAction(result, '读取记忆失败')
      return
    }
    setRecords(result.value.items)
    setNextCursor(result.value.next_cursor)
    setCursor(next)
  }
  useEffect(() => {
    if (projectId.length > 0) void loadRecords()
  }, [projectId])
  useEffect(() => {
    setRecords(items)
  }, [items])
  const select = async (record: AdminMemoryRecord): Promise<void> => {
    setSelected(record)
    setTargetProjectId('')
    setContent(record.content)
    setEditing(false)
    const result = await api.getMemoryRecord(record.memory_id)
    if (result.ok) {
      setSelected(result.value)
      setTargetProjectId('')
      setContent(result.value.content)
    } else onAction(result, '读取记忆详情失败')
  }
  const save = async (): Promise<void> => {
    if (selected === undefined || !canEdit(selected)) return
    setBusy(true)
    const result = await api.updateMemoryRecord(selected.memory_id, content, selected.revision)
    setBusy(false)
    if (result.ok) {
      setSelected(result.value)
      setContent(result.value.content)
      setEditing(false)
      await loadRecords(cursor)
    }
    onAction(result, '记忆正文已保存')
  }
  const remove = async (): Promise<void> => {
    if (selected === undefined || !canEdit(selected) || !window.confirm('删除后该记忆将立即不可召回，确认继续？')) return
    setBusy(true)
    const result = await api.deleteMemoryRecord(selected.memory_id, selected.revision, crypto.randomUUID())
    setBusy(false)
    if (result.ok) {
      setSelected(undefined)
      setEditing(false)
      await loadRecords(cursor)
    }
    onAction(result, '记忆删除任务已提交')
  }
  const move = async (): Promise<void> => {
    if (
      selected === undefined ||
      !canWrite ||
      targetProjectId.length === 0 ||
      targetProjectId === selected.project_id ||
      !window.confirm('调整项目范围后，该记忆将从当前项目移出并进入目标项目，确认继续？')
    )
      return
    setBusy(true)
    const result = await api.moveMemoryRecord(selected.memory_id, targetProjectId, selected.revision, crypto.randomUUID())
    setBusy(false)
    if (result.ok) {
      setSelected(result.value)
      setTargetProjectId('')
      setContent(result.value.content)
      setProjectId(result.value.project_id)
      setEditing(false)
    }
    onAction(result, '记忆项目范围已调整')
  }
  const loadGovernance = async (nextTab: typeof tab): Promise<void> => {
    setTab(nextTab)
    if (nextTab === 'policy' && projectId) {
      const result = await api.getMemoryPolicy(projectId)
      if (result.ok) setPolicy(result.value)
      else onAction(result, '读取记忆策略失败')
    }
    if (nextTab === 'jobs') {
      const result = await api.listMemoryJobs(projectId || undefined)
      if (result.ok) setJobs(result.value)
      else onAction(result, '读取记忆任务失败')
    }
    if (nextTab === 'audit') {
      const result = await api.listMemoryAudit(projectId || undefined)
      if (result.ok) setAudits(result.value)
      else onAction(result, '读取记忆审计失败')
    }
  }
  const savePolicy = async (): Promise<void> => {
    if (policy === undefined || !projectId) return
    const result = await api.updateMemoryPolicy(projectId, policy.values, policy.revision, crypto.randomUUID())
    if (result.ok) setPolicy(result.value)
    onAction(result, '记忆策略已保存')
  }
  const retry = async (job: AdminMemoryJob): Promise<void> => {
    const result = await api.retryMemoryJob(job.job_id, job.revision, crypto.randomUUID())
    if (result.ok) setJobs(previous => previous.map(item => (item.job_id === job.job_id ? result.value : item)))
    onAction(result, '记忆任务已重试')
  }
  return (
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
          <button
            type="button"
            aria-selected={tab === id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => void loadGovernance(id)}
            key={id}
          >
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
                setQuery(keyword.trim())
                setCursor(undefined)
                void loadRecords()
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
                    <tr
                      key={record.memory_id}
                      className={selected?.memory_id === record.memory_id ? 'selected-row' : undefined}
                      onClick={() => void select(record)}
                    >
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
              {records.length === 0 && <Empty text="当前项目没有可见记忆" />}
              <div className="pagination">
                <button type="button" className="button secondary" disabled={!cursor || busy} onClick={() => void loadRecords()}>
                  上一页
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!nextCursor || busy}
                  onClick={() => void loadRecords(nextCursor ?? undefined)}
                >
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
                {canWrite && (
                  <div className="memory-scope-editor">
                    <label>
                      目标项目
                      <select
                        aria-label="目标项目"
                        value={targetProjectId}
                        onChange={(event) => {
                          setTargetProjectId(event.target.value)
                        }}
                        disabled={busy}
                      >
                        <option value="">选择目标项目</option>
                        {projects
                          .filter(project => project.project_id !== selected.project_id)
                          .map(project => (
                            <option key={project.project_id} value={project.project_id}>
                              {project.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || targetProjectId.length === 0}
                      onClick={() => void move()}
                    >
                      调整项目范围
                    </button>
                  </div>
                )}
                <div className="review-actions">
                  {editing ? (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!canEdit(selected) || busy || content.trim().length === 0}
                      onClick={() => void save()}
                    >
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
                      setPolicy({ ...policy, values: { ...policy.values, top_k: Number(event.target.value) } })
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
                      setPolicy({ ...policy, values: { ...policy.values, relevance_threshold: Number(event.target.value) } })
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
                      setPolicy({ ...policy, values: { ...policy.values, token_budget: Number(event.target.value) } })
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
            <button
              type="button"
              className={selectedId === item.skillId ? 'draft-row selected-draft' : 'draft-row'}
              key={item.skillId}
              onClick={() => void loadDetail(item.skillId)}
            >
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
      {selectedId !== undefined && (
        <div className="draft-editor-wrap">
          {detailLoading || detail === undefined ? (
            <Loading />
          ) : (
            <DraftEditor detail={detail} api={api} onAction={onAction} onRefresh={() => loadDetail(selectedId)} />
          )}
        </div>
      )}
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
      {visibility === 'people' && (
        <PeopleSelector users={directoryUsers} selected={peopleIds} loading={directoryLoading} onChange={onPeopleIds} />
      )}
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
  detail: { readonly skill: TeamSkill; readonly versions: readonly SkillVersion[] }
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
          { releaseNotes, dependencies: splitLines(dependencies), permissions: splitLines(permissions) },
          draftVersion.revision,
          crypto.randomUUID(),
        ),
        '版本信息已保存',
      )
  const upload = async (): Promise<void> => {
    if (draftVersion === undefined || file === undefined) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    await run(
      'upload',
      api.uploadArtifact(skill.skillId, draftVersion.version, bytes, draftVersion.revision, crypto.randomUUID()),
      'ZIP 已上传并完成服务端校验',
    )
    setUploaded(true)
  }
  const submit = (): Promise<void> =>
    draftVersion === undefined || !uploaded
      ? Promise.resolve()
      : run(
        'submit',
        api.submitReview(skill.skillId, draftVersion.version, draftVersion.revision, skill.revision, crypto.randomUUID()),
        '版本已提交审核',
      )
  const createVersion = (): Promise<void> =>
    newVersion.trim().length === 0
      ? Promise.resolve()
      : run(
        'new-version',
        api.createVersion(
          skill.skillId,
          { version: newVersion.trim(), releaseNotes: newReleaseNotes.trim() },
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
        {editable && visibility === 'people' && (
          <PeopleSelector users={directoryUsers} selected={peopleIds} loading={directoryLoading} onChange={setPeopleIds} />
        )}
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
          <button
            type="button"
            className="button primary"
            disabled={busy !== undefined || newVersion.trim().length === 0}
            onClick={() => void createVersion()}
          >
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
              <span className="revision">
                {draftVersion.artifactSizeBytes === undefined || draftVersion.artifactSizeBytes === 0
                  ? '尚未上传'
                  : `${draftVersion.artifactSizeBytes} bytes`}
              </span>
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
            <button
              type="button"
              className="button secondary"
              disabled={busy !== undefined || file === undefined}
              onClick={() => void upload()}
            >
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
            <ReviewBlock
              title="依赖与权限"
              value={[...current.version.dependencies, ...current.version.permissions].join('、') || '未声明'}
            />
            <fieldset className="checks">
              <legend>人工审核清单</legend>
              {current.reviewChecks.map(check => (
                <label key={check.id}>
                  <input
                    type="checkbox"
                    checked={checks[check.id] === 'pass'}
                    onChange={(event) => {
                      setChecks(previous => ({ ...previous, [check.id]: event.target.checked ? 'pass' : 'fail' }))
                    }}
                  />
                  {check.label}
                </label>
              ))}
            </fieldset>
            <div className="review-actions">
              <button
                type="button"
                className="button primary"
                disabled={busy || current.reviewChecks.some(check => checks[check.id] !== 'pass')}
                onClick={() => void approve()}
              >
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
  const [dialog, setDialog] = useState<{ readonly kind: 'publish' | 'withdraw' | 'rollback'; readonly item: TeamSkill } | undefined>()
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
    const result =
      dialog.kind === 'publish'
        ? await api.publish(item.skillId, version, item.latestVersionRevision ?? item.revision, item.revision, crypto.randomUUID())
        : dialog.kind === 'withdraw'
          ? await api.withdraw(
            item.skillId,
            version,
            reason.trim(),
            item.latestVersionRevision ?? item.revision,
            item.revision,
            crypto.randomUUID(),
          )
          : await api.rollback(item.skillId, rollbackVersion, item.revision, crypto.randomUUID())
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
      {dialog !== undefined && dialog.kind === 'withdraw' && (
        <ReasonDialog
          title="下线版本"
          label="下线原因"
          value={reason}
          busy={busyKey !== undefined}
          confirmLabel="确认下线"
          onChange={setReason}
          onCancel={closeDialog}
          onConfirm={() => void confirm()}
        />
      )}
      {dialog !== undefined && dialog.kind === 'publish' && (
        <ConfirmDialog
          title="发布版本"
          message={`确认发布 ${dialog.item.displayName} v${dialog.item.currentVersion ?? ''}？`}
          busy={busyKey !== undefined}
          confirmLabel="确认发布"
          onCancel={closeDialog}
          onConfirm={() => void confirm()}
        />
      )}
      {dialog !== undefined && dialog.kind === 'rollback' && (
        <RollbackDialog
          versions={dialog.item.publishedVersions ?? []}
          current={dialog.item.currentVersion}
          value={rollbackVersion}
          busy={busyKey !== undefined}
          onChange={setRollbackVersion}
          onCancel={closeDialog}
          onConfirm={() => void confirm()}
        />
      )}
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
                <td>{item.actorName}</td>
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
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
