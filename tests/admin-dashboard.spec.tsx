// @vitest-environment jsdom
/* oxlint-disable typescript/no-base-to-string -- Fetch spy assertions inspect RequestInfo and BodyInit wire values. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { signOut } from 'next-auth/react'
import { AdminDashboard, AdminLoginPage } from '../src/components/admin-dashboard.tsx'

vi.mock('next-auth/react', () => ({ signIn: vi.fn(), signOut: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const skill = {
  skillId: 'skill-1',
  displayName: '代码评审',
  summary: '检查代码风险',
  runtimeName: 'aicp-code-review',
  category: '质量',
  tags: ['审核'],
  currentVersion: '1.0.0',
  status: 'published' as const,
  visibility: 'organization' as const,
  revision: 2,
  authorName: '申屠相镕',
  publishedAt: '2026-08-29T08:00:00Z',
}

function response(value: unknown, status = 200): Response {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  const data = status < 400 && record !== undefined && Object.hasOwn(record, 'data') ? record.data : value
  return new Response(JSON.stringify({
    code: status >= 400 ? (typeof record?.code === 'string' ? record.code : `HTTP_${status}`) : 0,
    message: status >= 400 ? (typeof record?.message === 'string' ? record.message : 'failed') : 'ok',
    request_id: 'test-request',
    data: status >= 400 ? null : data,
  }), { status, headers: { 'content-type': 'application/json' } })
}

function configure(fetcher: typeof fetch): void {
  vi.stubEnv('NEXT_PUBLIC_TEAM_SKILL_API_URL', 'http://service.test/v1')
  vi.stubEnv('NEXT_PUBLIC_TEAM_SKILL_ACCESS_TOKEN', 'admin-demo')
  vi.stubGlobal('fetch', fetcher)
}

describe('AdminDashboard', () => {
  it('clears a stale Auth.js session before accepting credentials', async () => {
    render(React.createElement(AdminLoginPage, { clearStaleSession: true }))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ redirect: false })
    })
  })

  it('renders Skill pages under a second-level module and reserves future modules', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response([]))
    configure(fetcher)
    render(React.createElement(AdminDashboard))

    const navigation = screen.getByRole('navigation', { name: '管理后台导航' })
    expect(screen.getByText('Skill 管理', { exact: true })).toBeTruthy()
    expect(navigation.querySelector('[aria-label="Skill 管理子导航"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Skill 目录/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: /我的草稿/ }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('button', { name: /项目管理/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /知识库管理/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /权限管理/ })).toHaveProperty('disabled', true)
    expect(await screen.findByText('当前没有可见的 Skill 资产')).toBeTruthy()
  })

  it('shows the knowledge-base management page for an authenticated administrator', async () => {
    const fetcher = vi.fn<typeof fetch>(async input =>
      String(input).includes('knowledge-bases')
        ? response({
          items: [
            {
              knowledge_base_id: 'k-1',
              organization_id: 'org-alpha',
              name: '发布流程',
              description: '发布规范',
              type: 'document',
              state: 'active',
              searchable: true,
              updated_at: '2026-09-02T00:00:00Z',
              revision: 1,
            },
          ],
        })
        : response([]),
    )
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /知识库管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /知识库文档、FAQ 与 Wiki/ }))
    expect(await screen.findByRole('heading', { name: '知识库' })).toBeTruthy()
    expect(screen.getByText('发布流程')).toBeTruthy()
  })

  it('manages project memories with server filtering, revision editing, and governance tabs', async () => {
    const memory = {
      memory_id: 'm-1',
      team_id: 'team-alpha',
      project_id: 'project-alpha',
      content: 'Alpha uses strict TypeScript checks.',
      layer: 'L1',
      captured_by_user_id: 'member-1',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
      revision: 1,
      status: 'ACTIVE',
      importance: 0.8,
      recall_count: 0,
      last_recalled_at: null,
      source_kind: 'agent_turn',
    }
    const fetcher = vi.fn<typeof fetch>(async (input, _init) => {
      const url = String(input)
      if (url.endsWith('/admin/projects'))
        return response({
          items: [{ project_id: 'project-alpha', organization_id: 'org-alpha', name: '协作台前端', status: 'active', revision: 1 }],
        })
      if (url.endsWith('/project-memory/list')) return response({ data: { items: [memory], next_cursor: null, total_estimate: 1 } })
      if (url.endsWith('/project-memory/get')) return response({ data: memory })
      if (url.endsWith('/project-memory/update'))
        return response({
          data: {
            memory: { ...memory, content: '更新后的项目记忆。', revision: 2 },
            event_id: 'e-1',
            job_id: 'j-1',
            status: 'INDEX_PENDING',
          },
        })
      if (url.endsWith('/project-memory/delete'))
        return response({ data: { event_id: 'e-2', job_id: 'j-2', cleanup_status: 'PENDING' } }, 202)
      if (url.endsWith('/project-memory/policy/get'))
        return response({
          data: {
            scope_type: 'project',
            scope_id: 'project-alpha',
            revision: 1,
            values: { top_k: 8, relevance_threshold: 0.4, token_budget: 1200 },
            inherited_from: 'organization',
          },
        })
      if (url.endsWith('/project-memory/jobs/list')) return response({ data: { items: [] } })
      if (url.endsWith('/project-memory/audit/list')) return response({ data: { items: [] } })
      return response({ items: [] })
    })
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /记忆库管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /记忆列表、策略、任务与审计/ }))
    expect(await screen.findByText('Alpha uses strict TypeScript checks.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Alpha uses strict TypeScript checks/ }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑记忆' }))
    fireEvent.change(screen.getByRole('textbox', { name: '记忆正文' }), { target: { value: '更新后的项目记忆。' } })
    fireEvent.click(screen.getByRole('button', { name: '保存记忆' }))
    await waitFor(() => {
      expect(
        fetcher.mock.calls.some(
          ([url, init]) => String(url).endsWith('/project-memory/update') && String(init?.body).includes('更新后的项目记忆'),
        ),
      ).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: '策略' }))
    expect(await screen.findByText('记忆召回策略')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '任务' }))
    expect(await screen.findByText('记忆处理任务')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '审计' }))
    expect(await screen.findByText('记忆治理审计')).toBeTruthy()
  })

  it('shows a forbidden memory response instead of an empty list', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/admin/projects') || url.endsWith('/me/projects'))
        return response({
          items: [{ project_id: 'project-alpha', organization_id: 'org-alpha', name: 'Alpha 项目', status: 'active', revision: 1 }],
        })
      if (url.endsWith('/project-memory/list')) return response({ code: 'PROJECT_ACCESS_DENIED', message: '当前账号无权访问项目' }, 403)
      return response([])
    })
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /记忆库管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /记忆列表、策略、任务与审计/ }))
    expect(await screen.findByText('PROJECT_ACCESS_DENIED：当前账号无权访问项目')).toBeTruthy()
    expect(screen.queryByText('当前项目没有可见记忆')).toBeNull()
  })

  it('shows an unavailable memory response from the service', async () => {
    const fetcher = vi.fn<typeof fetch>(async input =>
      String(input).endsWith('/project-memory/list')
        ? response({ code: 'MEMORY_SERVICE_UNAVAILABLE', message: '记忆服务暂不可用' }, 503)
        : response({
          items: [{ project_id: 'project-alpha', organization_id: 'org-alpha', name: 'Alpha 项目', status: 'active', revision: 1 }],
        }),
    )
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /记忆库管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /记忆列表、策略、任务与审计/ }))
    expect(await screen.findByText('MEMORY_SERVICE_UNAVAILABLE：记忆服务暂不可用')).toBeTruthy()
  })

  it('keeps edited memory content visible after a revision conflict', async () => {
    const memory = {
      memory_id: 'm-1',
      team_id: 'team-alpha',
      project_id: 'project-alpha',
      content: '原始记忆',
      layer: 'L1',
      captured_by_user_id: 'member-1',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
      revision: 1,
      status: 'ACTIVE',
      importance: 0.8,
      recall_count: 0,
      last_recalled_at: null,
      source_kind: 'agent_turn',
    }
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/admin/projects') || url.endsWith('/me/projects'))
        return response({
          items: [{ project_id: 'project-alpha', organization_id: 'org-alpha', name: 'Alpha 项目', status: 'active', revision: 1 }],
        })
      if (url.endsWith('/project-memory/list') || url.endsWith('/project-memory/get'))
        return response({ data: url.endsWith('/project-memory/list') ? { items: [memory], next_cursor: null, total_estimate: 1 } : memory })
      if (url.endsWith('/project-memory/update'))
        return response({ code: 'MEMORY_REVISION_CONFLICT', message: '记忆已更新，请刷新后重试' }, 409)
      return response({ items: [] })
    })
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /记忆库管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /记忆列表、策略、任务与审计/ }))
    fireEvent.click(await screen.findByRole('button', { name: /原始记忆/ }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑记忆' }))
    fireEvent.change(screen.getByRole('textbox', { name: '记忆正文' }), { target: { value: '本地未提交修改' } })
    fireEvent.click(screen.getByRole('button', { name: '保存记忆' }))
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '记忆正文' }).value).toBe('本地未提交修改')
    })
    expect(await screen.findByText('MEMORY_REVISION_CONFLICT：记忆已更新，请刷新后重试')).toBeTruthy()
  })

  it('resolves an authorized project before requesting memory records', async () => {
    const memory = {
      memory_id: 'm-1',
      team_id: 'team-alpha',
      project_id: 'project-alpha',
      content: '成员项目记忆',
      layer: 'L1',
      captured_by_user_id: 'member-1',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
      revision: 1,
      status: 'ACTIVE',
      importance: 0.8,
      recall_count: 0,
      last_recalled_at: null,
      source_kind: 'agent_turn',
    }
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/admin/projects'))
        return response({
          items: [{ project_id: 'project-alpha', organization_id: 'org-alpha', name: 'Alpha 项目', status: 'active', revision: 1 }],
        })
      if (url.endsWith('/project-memory/list')) return response({ data: { items: [memory], next_cursor: null, total_estimate: 1 } })
      if (url.endsWith('/project-memory/get')) return response({ data: memory })
      return response([])
    })
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /记忆库管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /记忆列表、策略、任务与审计/ }))
    expect(await screen.findByText('成员项目记忆')).toBeTruthy()
    const listCall = [...fetcher.mock.calls].reverse().find(([input]) => String(input).endsWith('/project-memory/list'))
    expect(JSON.parse(String(listCall?.[1]?.body))).toMatchObject({ project_id: 'project-alpha' })
  })

  it('hides the memory-library navigation from member sessions', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ items: [] }))
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'member-1', name: '成员' }, role: 'member', mustChangePassword: false },
      }),
    )
    expect(screen.queryByRole('button', { name: /记忆库管理/ })).toBeNull()
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/project-memory/list'))).toBe(false)
  })

  it('expands only the selected primary navigation menu', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response([]))
    configure(fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )

    const navigation = screen.getByRole('navigation', { name: '管理后台导航' })
    const skillMenu = screen.getByRole('button', { name: /Skill 管理/ })
    const permissionMenu = screen.getByRole('button', { name: /权限管理/ })
    expect(skillMenu.getAttribute('aria-expanded')).toBe('true')
    expect(permissionMenu.getAttribute('aria-expanded')).toBe('false')
    expect(navigation.querySelector('[aria-label="Skill 管理子导航"]')).toBeTruthy()
    expect(navigation.querySelector('[aria-label="权限管理子导航"]')).toBeNull()

    fireEvent.click(permissionMenu)
    expect(skillMenu.getAttribute('aria-expanded')).toBe('false')
    expect(permissionMenu.getAttribute('aria-expanded')).toBe('true')
    expect(navigation.querySelector('[aria-label="Skill 管理子导航"]')).toBeNull()
    expect(navigation.querySelector('[aria-label="权限管理子导航"]')).toBeTruthy()

    fireEvent.click(skillMenu)
    expect(skillMenu.getAttribute('aria-expanded')).toBe('true')
    expect(permissionMenu.getAttribute('aria-expanded')).toBe('false')
    expect(navigation.querySelector('[aria-label="Skill 管理子导航"]')).toBeTruthy()
    expect(navigation.querySelector('[aria-label="权限管理子导航"]')).toBeNull()
  })

  it('shows an explicit not-ready state when the service is not configured', async () => {
    const fetcher = vi.fn<typeof fetch>()
    configure(fetcher)
    vi.stubEnv('NEXT_PUBLIC_TEAM_SKILL_API_URL', '')
    vi.stubEnv('NEXT_PUBLIC_TEAM_SKILL_ACCESS_TOKEN', '')
    render(React.createElement(AdminDashboard))
    expect(await screen.findByRole('heading', { name: 'Skill 服务尚未配置' })).toBeTruthy()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('renders the directory empty state from the authoritative response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response([]))
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    expect(await screen.findByText('当前没有可见的 Skill 资产')).toBeTruthy()
  })

  it('keeps approval disabled until every review check is complete', async () => {
    const review = {
      skill,
      version: {
        skillId: skill.skillId,
        version: '1.1.0',
        status: 'pending_review' as const,
        releaseNotes: '新增检查项',
        dependencies: [],
        permissions: ['read_file'],
        validation: [],
        revision: 1,
      },
      reviewChecks: [
        { id: 'check-1', label: '内容与文件' },
        { id: 'check-2', label: '依赖与权限' },
      ],
    }
    const fetcher = vi.fn<typeof fetch>(async input =>
      String(input).includes('team-skill-reviews') ? response([review]) : response([skill]),
    )
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /审核队列/ }))
    const approve = await screen.findByRole('button', { name: /批准版本/ })
    expect(approve).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByLabelText('内容与文件'))
    expect(approve).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByLabelText('依赖与权限'))
    expect(approve).toHaveProperty('disabled', false)
  })

  it('only enables publishing for an approved version', async () => {
    const approved = { ...skill, status: 'approved' as const, currentVersion: '1.0.0' }
    const published = { ...skill, status: 'published' as const }
    const fetcher = vi.fn<typeof fetch>(async () => response([approved, published]))
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /发布管理/ }))
    const publishButtons = await screen.findAllByRole('button', { name: /^发布$/ })
    expect(publishButtons[0]).toHaveProperty('disabled', false)
    expect(publishButtons[1]).toHaveProperty('disabled', true)
  })

  it('changes the review details when an administrator selects another pending version', async () => {
    const second = {
      skill: { ...skill, skillId: 'skill-2', displayName: 'API 可靠性检查', currentVersion: undefined, status: 'pending_review' as const },
      version: {
        skillId: 'skill-2',
        version: '0.2.0',
        status: 'pending_review' as const,
        releaseNotes: '覆盖超时与重试',
        dependencies: ['DSH >= 0.1.0'],
        permissions: ['read_file'],
        validation: [],
        revision: 1,
      },
      reviewChecks: [{ id: 'check-1', label: '内容与文件' }],
    }
    const first = {
      skill: { ...skill, displayName: '代码评审', status: 'pending_review' as const },
      version: {
        skillId: skill.skillId,
        version: '1.1.0',
        status: 'pending_review' as const,
        releaseNotes: '覆盖变更边界',
        dependencies: [],
        permissions: [],
        validation: [],
        revision: 1,
      },
      reviewChecks: [{ id: 'check-1', label: '内容与文件' }],
    }
    const fetcher = vi.fn<typeof fetch>(async input =>
      String(input).includes('team-skill-reviews') ? response([first, second]) : response([skill]),
    )
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /审核队列/ }))
    expect(await screen.findByRole('heading', { name: '代码评审 v1.1.0' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /API 可靠性检查/ }))
    expect(await screen.findByRole('heading', { name: 'API 可靠性检查 v0.2.0' })).toBeTruthy()
  })

  it('asks for a reason before a published version is withdrawn', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response([skill]))
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /发布管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /下线/ }))
    expect(screen.getByRole('dialog', { name: '下线版本' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认下线' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('下线原因'), { target: { value: '发现权限范围异常' } })
    expect(screen.getByRole('button', { name: '确认下线' })).toHaveProperty('disabled', false)
  })

  it('sends a rejection reason for the selected review item', async () => {
    const review = {
      skill: { ...skill, status: 'pending_review' as const },
      version: {
        skillId: skill.skillId,
        version: '1.1.0',
        status: 'pending_review' as const,
        releaseNotes: '新增检查',
        dependencies: [],
        permissions: [],
        validation: [],
        revision: 1,
      },
      reviewChecks: [{ id: 'check-1', label: '内容与文件' }],
    }
    const fetcher = vi.fn<typeof fetch>(async input =>
      String(input).includes('team-skill-reviews') ? response([review]) : response([skill]),
    )
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /审核队列/ }))
    fireEvent.click(await screen.findByRole('button', { name: '驳回版本' }))
    fireEvent.change(screen.getByLabelText('驳回原因'), { target: { value: '权限声明需要收敛' } })
    fireEvent.click(screen.getByRole('button', { name: '确认驳回' }))
    await waitFor(() => {
      expect(fetcher.mock.calls.some(([, init]) => String(init?.body).includes('权限声明需要收敛'))).toBe(true)
    })
  })

  it('lets an author edit a draft, upload its ZIP, and submit it for review', async () => {
    const draft = {
      ...skill,
      status: 'draft' as const,
      currentVersion: undefined,
      latestVersion: '0.1.0',
      latestVersionRevision: 1,
      revision: 3,
      visibility: 'people' as const,
      peopleIds: ['manager-1'],
    }
    const version = {
      skillId: draft.skillId,
      version: '0.1.0',
      status: 'draft' as const,
      releaseNotes: '首个版本',
      artifactSha256: undefined,
      artifactSizeBytes: 0,
      dependencies: ['DSH >= 0.1.0'],
      permissions: ['read_file'],
      validation: [{ name: '制品上传', status: 'failed' as const }],
      revision: 1,
    }
    let currentVersion = version
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.includes('/directory/users'))
        return response({ items: [{ user_id: 'manager-1', display_name: '组织经理', email: 'manager@example.com', groups: ['platform'] }] })
      if (url.endsWith('/team-skills')) return response([draft])
      if (url.includes('/artifact') && init?.method === 'PUT') {
        currentVersion = {
          ...currentVersion,
          artifactSizeBytes: 100,
          validation: [{ name: 'DSH 单层目录', status: 'passed' as const }],
          revision: currentVersion.revision + 1,
        }
        return response({ skill: draft, version: currentVersion })
      }
      if (url.includes('/team-skills/skill-1') && (init?.method === undefined || init.method === 'GET'))
        return response({ skill: draft, versions: [currentVersion] })
      return response({ skill: draft, version: currentVersion })
    })
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /我的草稿/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^代码评审/ }))
    expect(await screen.findByDisplayValue('质量')).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('分类')[1], { target: { value: '工程效率' } })
    fireEvent.change(screen.getAllByLabelText('标签')[1], { target: { value: '发布,审核' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 Skill 信息' }))
    await waitFor(() => {
      expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH' && String(init.body).includes('工程效率'))).toBe(true)
    })
    fireEvent.change(screen.getByLabelText('版本说明'), { target: { value: '补充发布检查' } })
    fireEvent.change(screen.getByLabelText('依赖'), { target: { value: 'DSH >= 0.1.1\nnode >= 22' } })
    fireEvent.change(screen.getByLabelText('权限'), { target: { value: 'read_file\nwrite_file' } })
    fireEvent.click(screen.getByRole('button', { name: '保存版本信息' }))
    await waitFor(() => {
      expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH' && String(init.body).includes('补充发布检查'))).toBe(true)
    })
    fireEvent.change(screen.getByLabelText('Skill ZIP'), {
      target: { files: [new File(['zip'], 'skill.zip', { type: 'application/zip' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: '上传 ZIP' }))
    await waitFor(() => {
      expect(
        fetcher.mock.calls.some(
          ([, init]) => init?.method === 'PUT' && new Headers(init.headers).get('Content-Type') === 'application/zip',
        ),
      ).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: '提交审核' }))
    await waitFor(() => {
      expect(fetcher.mock.calls.some(([input, init]) => String(input).includes('submit-review') && init?.method === 'POST')).toBe(true)
    })
  })

  it('sends the selected historical release and current Skill revision for rollback', async () => {
    const rollbackSkill = {
      ...skill,
      publishedVersions: ['1.0.0', '0.9.0'],
      currentVersion: '1.0.0',
      status: 'published' as const,
      revision: 8,
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'POST') return response({ skill: rollbackSkill })
      return response([rollbackSkill])
    })
    configure(fetcher)
    render(React.createElement(AdminDashboard))
    fireEvent.click(await screen.findByRole('button', { name: /发布管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '回滚' }))
    expect(screen.getByRole('dialog', { name: '回滚版本' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '回滚目标版本' })).toHaveProperty('value', '0.9.0')
    fireEvent.click(screen.getByRole('button', { name: '确认回滚' }))
    await waitFor(() => {
      expect(
        fetcher.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/rollback') &&
            init?.method === 'POST' &&
            String(init.body).includes('0.9.0') &&
            new Headers(init.headers).get('If-Match') === '8',
        ),
      ).toBe(true)
    })
  })

  it('hides permission management for a member session and never sends a browser access token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => response({ code: 'FORBIDDEN', message: '需要管理员权限' }, 403))
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'member-1', name: '演示成员', email: 'member@example.com' }, role: 'member', mustChangePassword: false },
      }),
    )
    expect(screen.queryByText('权限管理', { exact: true })).toBeNull()
    await screen.findByRole('heading', { name: '服务请求失败' })
    expect(fetcher).toHaveBeenCalled()
    const [, init] = fetcher.mock.calls[0]
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
  })

  it('clears the Auth.js session when the service rejects the current token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ code: 'AUTH_REQUIRED', message: '需要有效的后台 Session' }, 401))
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ redirect: true, redirectTo: '/' })
    })
  })

  it('clears the Auth.js session when a mutation reports token expiry', async () => {
    const project = {
      project_id: 'project-alpha',
      organization_id: 'org-alpha',
      organization_name: '星河 AI 平台',
      name: '协作台前端',
      description: '第一方项目',
      status: 'active' as const,
      created_by: 'admin-1',
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      member_count: 0,
      asset_count: 0,
      revision: 1,
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/admin/projects/project-alpha') && method === 'PATCH') return response({ code: 'TOKEN_EXPIRED', message: '会话已失效' }, 401)
      if (url.endsWith('/admin/projects/project-alpha')) return response(project)
      if (url.endsWith('/admin/projects')) return response({ items: [project] })
      if (url.includes('/admin/organizations')) return response({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /项目管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '项目列表项目资源与生命周期' }))
    fireEvent.click(await screen.findByRole('button', { name: /协作台前端/ }))
    await screen.findByRole('heading', { name: '协作台前端' })
    fireEvent.change(screen.getByLabelText('项目名称详情'), { target: { value: '新名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目' }))
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ redirect: true, redirectTo: '/' })
    })
  })

  it('shows archived projects in permission management as read-only', async () => {
    const active = { project_id: 'project-alpha', organization_id: 'org-alpha', name: '协作台前端', status: 'active' as const, revision: 1 }
    const archived = { project_id: 'project-archived', organization_id: 'org-alpha', name: '归档项目', status: 'archived' as const, revision: 2 }
    const user = {
      user_id: 'member-1',
      username: 'member@example.com',
      email: 'member@example.com',
      display_name: '演示成员',
      status: 'active' as const,
      global_role: 'member' as const,
      must_change_password: false,
      revision: 1,
      memberships: [{ organization_id: 'org-alpha', organization_name: '星河 AI 平台', status: 'active' as const, revision: 1 }],
    }
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/admin/projects?status=archived')) return response({ items: [archived] })
      if (url.endsWith('/admin/projects')) return response({ items: [active] })
      if (url.includes('/admin/projects/project-archived/members')) return response({ items: [{ project_id: 'project-archived', organization_id: 'org-alpha', user_id: 'member-1', display_name: '演示成员', status: 'active', revision: 1 }] })
      if (url.includes('/admin/users')) return response({ items: [user] })
      if (url.includes('/admin/organizations')) return response({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /权限管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '项目授权项目成员关系' }))
    expect(await screen.findByRole('button', { name: /归档项目/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /归档项目/ }))
    expect(await screen.findByText('归档项目只读，不能调整成员授权。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '授权' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: '移除' })).toBeNull()
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/admin/projects?status=archived'))).toBe(true)
  })

  it('fills role and scope labels when the service omits role descriptions', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/admin/roles')) return response({ items: [{ role: 'admin', scope: 'platform', description: '' }] })
      if (url.includes('/admin/permissions')) return response({ items: [{ key: 'project.manage', admin: true, manager: 'organization', member: false }] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /权限管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '角色与权限服务端固定矩阵' }))
    expect(await screen.findByText('平台管理员')).toBeTruthy()
    expect(screen.getAllByText('平台').length).toBeGreaterThan(0)
    expect(screen.getByText('管理平台全部组织、账号和项目')).toBeTruthy()
  })

  it('distinguishes an unavailable service from an authorization failure', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    expect(await screen.findByRole('heading', { name: '服务不可达' })).toBeTruthy()
    expect(screen.getByText('后端服务未启动或当前不可达')).toBeTruthy()
  })

  it('opens an in-app confirmation dialog before project lifecycle changes', async () => {
    const project = {
      project_id: 'project-alpha',
      organization_id: 'org-alpha',
      organization_name: '星河 AI 平台',
      name: '协作台前端',
      description: '第一方项目',
      status: 'draft' as const,
      created_by: 'admin-1',
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      member_count: 0,
      asset_count: 0,
      revision: 1,
    }
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/admin/projects')) return response({ items: [project] })
      if (url.endsWith('/admin/projects/project-alpha')) return response(project)
      if (url.includes('/members') || url.includes('/assets') || url.includes('/authorization-audits')) return response({ items: [] })
      if (url.includes('/admin/organizations')) return response({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
      return response([])
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /项目管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '项目列表项目资源与生命周期' }))
    fireEvent.click(await screen.findByRole('button', { name: /协作台前端/ }))
    await screen.findByRole('heading', { name: '协作台前端' })
    fireEvent.click(screen.getByRole('button', { name: '激活项目' }))
    expect(screen.getByRole('dialog', { name: '确认项目操作' })).toBeTruthy()
    expect(screen.getByText('确认激活该项目？')).toBeTruthy()
    expect(fetcher.mock.calls.some(([input, init]) => String(input).includes(':activate') && init?.method === 'POST')).toBe(false)
  })

  it('opens the account permission pages for an admin session and shows a one-time password', async () => {
    const user = {
      user_id: 'member-1',
      username: 'member@example.com',
      email: 'member@example.com',
      display_name: '演示成员',
      status: 'active' as const,
      global_role: 'member' as const,
      must_change_password: false,
      revision: 1,
      memberships: [{ organization_id: 'org-alpha', organization_name: '星河 AI 平台', status: 'active' as const, revision: 1 }],
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.includes('/admin/users') && init?.method === 'POST') return response({ user, initial_password: 'one-time-password' }, 201)
      if (url.includes('/admin/users')) return response({ items: [user] })
      if (url.includes('/admin/organizations'))
        return response({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /权限管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /用户与成员/ }))
    expect(await screen.findByRole('heading', { name: '用户与成员' })).toBeTruthy()
    expect(await screen.findByText('演示成员')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('新账号用户名'), { target: { value: 'new.member@example.com' } })
    fireEvent.change(screen.getByLabelText('新账号显示名'), { target: { value: '新成员' } })
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }))
    expect(await screen.findByText('one-time-password')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: '角色与权限服务端固定矩阵' }))
    expect(await screen.findByRole('heading', { name: '角色与权限' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '项目授权项目成员关系' }))
    expect(await screen.findByRole('heading', { name: '项目授权' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /授权审计/ }))
    expect(await screen.findByRole('heading', { name: '授权审计' })).toBeTruthy()
  })

  it('sends the removed project-member revision when restoring authorization', async () => {
    const project = {
      project_id: 'project-alpha',
      organization_id: 'org-alpha',
      name: '协作台前端',
      status: 'active' as const,
      revision: 5,
    }
    const removedMember = {
      project_id: 'project-alpha',
      organization_id: 'org-alpha',
      user_id: 'member-1',
      display_name: '演示成员',
      status: 'removed' as const,
      revision: 4,
    }
    const user = {
      user_id: 'member-1',
      username: 'member@example.com',
      email: 'member@example.com',
      display_name: '演示成员',
      status: 'active' as const,
      global_role: 'member' as const,
      must_change_password: false,
      revision: 1,
      memberships: [{ organization_id: 'org-alpha', organization_name: '星河 AI 平台', status: 'active' as const, revision: 1 }],
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.includes('/admin/projects/project-alpha/members/member-1') && init?.method === 'PUT') return response(project)
      if (url.endsWith('/admin/projects/project-alpha/members')) return response({ items: [removedMember], revision: project.revision })
      if (url.includes('/admin/users')) return response({ items: [user] })
      if (url.includes('/admin/projects')) return response({ items: [project] })
      return response([])
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /权限管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '项目授权项目成员关系' }))
    const memberSelector = await screen.findByRole('combobox', { name: '选择组织成员' })
    await waitFor(() => {
      expect([...(memberSelector as HTMLSelectElement).options].some(option => option.value === 'member-1')).toBe(true)
    })
    fireEvent.change(memberSelector, { target: { value: 'member-1' } })
    fireEvent.click(screen.getByRole('button', { name: '授权' }))
    await waitFor(() => {
      expect(
        fetcher.mock.calls.some(
          ([input, init]) =>
            String(input).includes('/admin/projects/project-alpha/members/member-1') &&
            init?.method === 'PUT' &&
            new Headers(init.headers).get('If-Match') === '4',
        ),
      ).toBe(true)
    })
  })

  it('opens independent project management and renders lifecycle tabs', async () => {
    const project = {
      project_id: 'project-alpha',
      organization_id: 'org-alpha',
      organization_name: '星河 AI 平台',
      name: '协作台前端',
      description: '第一方项目',
      status: 'draft' as const,
      created_by: 'admin-1',
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      member_count: 0,
      asset_count: 0,
      revision: 1,
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/admin/projects') && init?.method === 'POST') return response(project, 201)
      if (url.endsWith('/admin/projects')) return response({ items: [project] })
      if (url.endsWith('/admin/projects/project-alpha')) return response(project)
      if (url.includes('/members')) return response({ items: [] })
      if (url.includes('/assets')) return response({ items: [] })
      if (url.includes('/authorization-audits')) return response({ items: [] })
      if (url.includes('/admin/organizations'))
        return response({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /项目管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '项目列表项目资源与生命周期' }))
    expect(await screen.findByRole('heading', { name: '项目列表' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '新项目' } })
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => {
      expect(fetcher.mock.calls.some(([input, init]) => String(input).endsWith('/admin/projects') && init?.method === 'POST')).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /协作台前端/ }))
    expect(await screen.findByRole('heading', { name: '协作台前端' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '项目状态筛选' }).value).toBe('')
    expect(screen.getAllByText('草稿').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: '概览' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '成员' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '资产关联' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '审计' })).toBeTruthy()
  })

  it('keeps project management and detail tab state in stable URLs', async () => {
    window.history.replaceState({}, '', '/')
    const project = {
      project_id: 'project-alpha',
      organization_id: 'org-alpha',
      organization_name: '星河 AI 平台',
      name: '协作台前端',
      description: '第一方项目',
      status: 'active' as const,
      created_by: 'admin-1',
      created_at: '2026-08-30T00:00:00Z',
      updated_at: '2026-08-30T00:00:00Z',
      member_count: 0,
      asset_count: 0,
      revision: 1,
    }
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/admin/projects')) return response({ items: [project] })
      if (url.endsWith('/admin/projects/project-alpha')) return response(project)
      if (url.includes('/members')) return response({ items: [] })
      if (url.includes('/assets')) return response({ items: [] })
      if (url.includes('/authorization-audits')) return response({ items: [] })
      if (url.includes('/admin/organizations'))
        return response({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员', email: 'admin@example.com' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /项目管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: '项目列表项目资源与生命周期' }))
    fireEvent.click(await screen.findByRole('button', { name: /协作台前端/ }))
    await screen.findByRole('heading', { name: '协作台前端' })
    expect(window.location.pathname).toBe('/projects/project-alpha')
    fireEvent.click(screen.getByRole('tab', { name: '资产关联' }))
    expect(window.location.pathname).toBe('/projects/project-alpha')
    expect(window.location.search).toBe('?tab=assets')
  })

  it('surfaces the server-side project binding state for published skills', async () => {
    const unbound = {
      ...skill,
      skillId: 'skill-unbound',
      displayName: '未绑定技能',
      status: 'published' as const,
      organizationId: 'org-alpha',
      projectIds: [],
    }
    const bound = {
      ...skill,
      skillId: 'skill-bound',
      displayName: '已绑定技能',
      status: 'published' as const,
      organizationId: 'org-alpha',
      projectIds: ['project-alpha'],
    }
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('/admin/team-skills')) return response([unbound, bound])
      return response([])
    })
    configure(fetcher)
    // Earlier route tests leave a project URL behind; reset it so the skills nav group is expanded.
    window.history.replaceState(null, '', '/')
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Skill 目录/ }))
    expect(await screen.findByText('未绑定技能')).toBeTruthy()

    fireEvent.click(screen.getByText('未绑定技能'))
    expect(
      await screen.findByText('未绑定任何项目：发布后还需在项目资产中绑定，插件目录才会发现该 Skill'),
    ).toBeTruthy()

    fireEvent.click(screen.getByText('已绑定技能'))
    await waitFor(() => {
      const detail = screen.getAllByText('project-alpha')
      expect(detail.length).toBeGreaterThan(0)
    })
  })

  it('manages organization lifecycle and manager binding with revision and idempotency', async () => {
    const organization = { organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active' as const, revision: 3 }
    const manager = {
      user_id: 'manager-2',
      username: 'manager2@example.com',
      email: 'manager2@example.com',
      display_name: '候选经理',
      status: 'active' as const,
      global_role: 'manager' as const,
      must_change_password: false,
      revision: 1,
      memberships: [],
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/admin/organizations') && method === 'POST')
        return response({ organization_id: 'org-new', name: '新组织', status: 'active', revision: 1 }, 201)
      if (url.endsWith('/admin/organizations/org-alpha') && method === 'PATCH')
        return response({ ...organization, name: '改名后的组织', revision: 4 })
      if (url.includes('/admin/organizations/org-alpha/members/manager-2') && method === 'PUT')
        return response({ ...manager, memberships: [{ organization_id: 'org-alpha', organization_name: '星河 AI 平台', status: 'active', revision: 1 }] })
      if (url.includes('/admin/users') && method === 'GET') return response({ items: [manager] })
      if (url.includes('/admin/organizations')) return response({ items: [organization] })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    configure(fetcher)
    vi.spyOn(window, 'prompt').mockReturnValue('改名后的组织')
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /权限管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /组织管理/ }))
    expect(await screen.findByRole('heading', { name: '组织管理' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('新组织名称'), { target: { value: '新组织' } })
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }))
    await waitFor(() => {
      const call = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/admin/organizations') && init?.method === 'POST')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ name: '新组织' })
      expect(new Headers(call?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u)
    })

    fireEvent.click(await screen.findByRole('button', { name: '重命名' }))
    await waitFor(() => {
      const call = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/admin/organizations/org-alpha') && init?.method === 'PATCH')
      expect(call).toBeDefined()
      expect(new Headers(call?.[1]?.headers).get('If-Match')).toBe('3')
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ name: '改名后的组织' })
    })

    fireEvent.change(screen.getByLabelText('为 星河 AI 平台 绑定经理'), { target: { value: 'manager-2' } })
    fireEvent.click(screen.getByRole('button', { name: '绑定经理' }))
    await waitFor(() => {
      const call = fetcher.mock.calls.find(([url, init]) => String(url).includes('/members/manager-2') && init?.method === 'PUT')
      expect(call).toBeDefined()
      expect(new Headers(call?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u)
    })
  })

  it('edits a display name and adds an organization membership with revision and idempotency', async () => {
    const user = {
      user_id: 'user-7',
      username: 'user7@example.com',
      email: 'user7@example.com',
      display_name: '待改名成员',
      status: 'active' as const,
      global_role: 'member' as const,
      must_change_password: false,
      revision: 5,
      memberships: [{ organization_id: 'org-alpha', organization_name: '星河 AI 平台', status: 'active' as const, revision: 2 }],
    }
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/admin/users/user-7') && method === 'PATCH') return response({ ...user, display_name: '新显示名', revision: 6 })
      if (url.includes('/admin/organizations/org-beta/members/user-7') && method === 'PUT') return response(user)
      if (url.includes('/admin/users') && method === 'GET') return response({ items: [user] })
      if (url.includes('/admin/organizations'))
        return response({
          items: [
            { organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 },
            { organization_id: 'org-beta', name: '星河数据平台', status: 'active', revision: 1 },
          ],
        })
      if (url.includes('/admin/team-skills')) return response([])
      return response({ items: [] })
    })
    configure(fetcher)
    vi.spyOn(window, 'prompt').mockReturnValue('新显示名')
    render(
      React.createElement(AdminDashboard, {
        session: { user: { id: 'admin-1', name: '平台管理员' }, role: 'admin', mustChangePassword: false },
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /权限管理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /用户与成员/ }))
    expect(await screen.findByText('待改名成员')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '编辑显示名' }))
    await waitFor(() => {
      const call = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/admin/users/user-7') && init?.method === 'PATCH')
      expect(call).toBeDefined()
      expect(new Headers(call?.[1]?.headers).get('If-Match')).toBe('5')
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ display_name: '新显示名' })
    })

    fireEvent.change(screen.getByLabelText('为 待改名成员 新增组织'), { target: { value: 'org-beta' } })
    fireEvent.click(screen.getByRole('button', { name: '新增组织成员' }))
    await waitFor(() => {
      const call = fetcher.mock.calls.find(([url, init]) => String(url).includes('/members/user-7') && init?.method === 'PUT')
      expect(call).toBeDefined()
      expect(new Headers(call?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u)
    })
  })
})
