import { describe, expect, it, vi } from 'vitest'
import { refreshServiceSession } from '../src/auth-session.ts'
import { TeamSkillApi } from '../src/lib/team-skill-api.ts'

describe('TeamSkillApi', () => {
  it('returns an explicit not-ready result when the service is not configured', async () => {
    const api = new TeamSkillApi({})
    expect(await api.listSkills()).toEqual({ ok: false, error: { kind: 'not-ready', missing: ['baseUrl', 'accessToken'] } })
  })

  it('sends bearer authentication and concurrency headers for a mutation', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({ skill: { skillId: 'skill-1' } }), { status: 200 }))
    const api = new TeamSkillApi({ baseUrl: 'https://skills.example/v1', accessToken: 'token-1', fetcher })
    const result = await api.publish('skill-1', '1.2.0', 7, 9, 'idem-1')
    expect(result.ok).toBe(true)
    const [, init] = fetcher.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('idem-1')
    expect(new Headers(init?.headers).get('If-Match')).toBe('7')
    expect(new Headers(init?.headers).get('X-Skill-Revision')).toBe('9')
  })

  it('maps revision conflicts to a stable business error', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({ code: 'REVISION_CONFLICT', message: '资源已更新' }), { status: 409 }))
    const api = new TeamSkillApi({ baseUrl: 'https://skills.example/v1', accessToken: 'token-1', fetcher })
    expect(await api.publish('skill-1', '1.2.0', 7, 9, 'idem-2')).toEqual({ ok: false, error: { kind: 'revision-conflict', code: 'REVISION_CONFLICT', message: '资源已更新' } })
  })

  it('does not bind the TeamSkillApi instance as fetch receiver', async () => {
    let receiver: unknown = 'unset'
    const fetcher: typeof fetch = function (this: unknown, _input, _init) {
      receiver = this
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    const api = new TeamSkillApi({ baseUrl: 'https://skills.example/v1', accessToken: 'token-1', fetcher })
    expect(await api.listSkills()).toEqual({ ok: true, value: {} })
    expect(receiver).toBeUndefined()
  })

  it('sends author draft and artifact requests with their revision and idempotency headers', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ skill: { skillId: 'skill-1' }, version: { version: '1.3.0' } }), { status: 200 }))
    const api = new TeamSkillApi({ baseUrl: 'https://skills.example/v1', accessToken: 'token-1', fetcher })
    await api.updateSkill('skill-1', { displayName: '代码评审', summary: '更新说明', visibility: 'organization' }, 3, 'idem-update')
    await api.createVersion('skill-1', { version: '1.3.0', releaseNotes: '新增规则' }, 4, 'idem-version')
    await api.updateVersion('skill-1', '1.3.0', { releaseNotes: '补充说明', dependencies: ['DSH >= 0.1.0'], permissions: ['read_file'] }, 5, 'idem-version-update')
    await api.uploadArtifact('skill-1', '1.3.0', new Uint8Array([1, 2, 3]), 6, 'idem-artifact')
    await api.submitReview('skill-1', '1.3.0', 7, 8, 'idem-submit')
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      'https://skills.example/v1/admin/team-skills/skill-1',
      'https://skills.example/v1/admin/team-skills/skill-1/versions',
      'https://skills.example/v1/admin/team-skills/skill-1/versions/1.3.0',
      'https://skills.example/v1/admin/team-skills/skill-1/versions/1.3.0/artifact',
      'https://skills.example/v1/admin/team-skills/skill-1/versions/1.3.0/submit-review',
    ])
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('Content-Type')).toBe('application/zip')
    expect(new Headers(fetcher.mock.calls[4]?.[1]?.headers).get('If-Match')).toBe('7')
  })

  it('uses same-origin session authentication without exposing an access token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({ items: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] }), { status: 200 }))
    const api = new TeamSkillApi({ baseUrl: '/api/team-skill', sessionAuth: true, fetcher })
    expect(await api.listOrganizations()).toEqual({ ok: true, value: [{ organization_id: 'org-alpha', name: '星河 AI 平台', status: 'active', revision: 1 }] })
    const [, init] = fetcher.mock.calls[0]
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
  })

  it('sends account mutations with idempotency and revision headers', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({ user_id: 'member-1', username: 'member@example.com', email: 'member@example.com', display_name: '成员', status: 'suspended', must_change_password: false, revision: 2 }), { status: 200 }))
    const api = new TeamSkillApi({ baseUrl: 'https://skills.example/v1', accessToken: 'token-1', fetcher })
    expect((await api.updateUser('member-1', { status: 'suspended' }, 1, 'suspend-1')).ok).toBe(true)
    const [, init] = fetcher.mock.calls[0]
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('suspend-1')
    expect(new Headers(init?.headers).get('If-Match')).toBe('1')
  })

  it('rotates Auth.js refresh sessions with an idempotency key and the service-owned global role', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u)
      expect(init?.body).toBe(JSON.stringify({ refresh_token: 'refresh-old' }))
      return new Response(JSON.stringify({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 900, must_change_password: false, user: { global_role: 'admin' }, memberships: [{ status: 'active' }, { status: 'active' }] }), { status: 200 })
    })
    await expect(refreshServiceSession('https://service.example/v1', 'refresh-old', fetcher)).resolves.toMatchObject({ accessToken: 'access-new', refreshToken: 'refresh-new', role: 'admin', mustChangePassword: false })
  })

  it('uses the service global role even when memberships have no role field', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 900, must_change_password: false, user: { global_role: 'manager' }, memberships: [{ status: 'active' }] }), { status: 200 }))
    await expect(refreshServiceSession('https://service.example/v1', 'refresh-old', fetcher)).resolves.toMatchObject({ role: 'manager' })
  })

  it('rejects an incomplete Auth.js refresh response instead of retaining stale credentials', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ access_token: 'access-new', expires_in: 900 }), { status: 200 }))
    await expect(refreshServiceSession('https://service.example/v1', 'refresh-old', fetcher)).resolves.toBeUndefined()
  })
})
