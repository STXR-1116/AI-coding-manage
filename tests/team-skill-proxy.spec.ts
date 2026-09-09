import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { handleTeamSkillProxy } from '../src/app/api/team-skill/proxy-handler.ts'

function makeRequest(path: string, method = 'GET'): NextRequest {
  const request = new Request(`http://localhost/api/team-skill/${path}`, { method })
  // handleTeamSkillProxy 读取 nextUrl.search；普通 Request 没有该字段，补齐。
  return Object.assign(request as unknown as NextRequest, { nextUrl: new URL(request.url) })
}

function makeContext(path: string[]): { params: Promise<{ readonly path: readonly string[] }> } {
  return { params: Promise.resolve({ path }) }
}

const services: Array<{ readonly server: import('node:http').Server }> = []

afterEach(async () => {
  console.log('SERVICES_BEFORE', services.length, services.map(s => typeof s))
  for (const service of services.splice(0)) {
    service.server.closeAllConnections()
    await new Promise<void>((resolve) => {
      service.server.close(() => {
        resolve()
      })
    })
  }
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('team-skill admin proxy (P1-06)', () => {
  it('returns a stable JSON 503 when the base URL is not configured', async () => {
    vi.stubEnv('TEAM_SKILL_SERVICE_URL', '')
    const response = await handleTeamSkillProxy(makeRequest('admin/team-skills'), makeContext(['admin', 'team-skills']), async () => 'token')
    expect(response.status).toBe(503)
    const body = (await response.json()) as { code: string; data: unknown; request_id: string }
    expect(body.code).toBe('SERVICE_UNAVAILABLE')
    expect(body.data).toBeNull()
    expect(body.request_id).toBeTruthy()
  })

  it('does not fall back to the account service when MemoryService is not configured', async () => {
    vi.stubEnv('TEAM_SKILL_SERVICE_URL', 'http://127.0.0.1:49990/v1')
    vi.stubEnv('MEMORY_SERVICE_URL', '')
    const response = await handleTeamSkillProxy(
      makeRequest('v3/project-memory/list', 'POST'),
      makeContext(['v3', 'project-memory', 'list']),
      async () => 'token',
    )
    expect(response.status).toBe(503)
    const body = (await response.json()) as { code: string; data: unknown; request_id: string }
    expect(body.code).toBe('MEMORY_SERVICE_UNAVAILABLE')
    expect(body.data).toBeNull()
    expect(body.request_id).toBeTruthy()
  })

  it('returns a stable JSON 503 with request_id when the upstream port is closed', async () => {
    vi.stubEnv('TEAM_SKILL_SERVICE_URL', 'http://127.0.0.1:49990')
    const response = await handleTeamSkillProxy(
      makeRequest('admin/team-skills'),
      makeContext(['admin', 'team-skills']),
      async () => 'token',
    )
    expect(response.status).toBe(503)
    const body = (await response.json()) as { code: string; data: unknown; request_id: string }
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE')
    expect(body.data).toBeNull()
    expect(body.request_id).toBeTruthy()
  })

  it('returns a complete auth error envelope when the browser session is absent', async () => {
    vi.stubEnv('TEAM_SKILL_SERVICE_URL', 'http://127.0.0.1:49990')
    const response = await handleTeamSkillProxy(
      makeRequest('admin/team-skills'),
      makeContext(['admin', 'team-skills']),
      async () => undefined,
    )
    expect(response.status).toBe(401)
    const body = (await response.json()) as { code: string; data: unknown; request_id: string }
    expect(body.code).toBe('AUTH_REQUIRED')
    expect(body.data).toBeNull()
    expect(body.request_id).toBeTruthy()
  })

  it('passes through upstream status and JSON body for non-2xx governance codes', async () => {
    const fixture = http.createServer((request, response) => {
      response.writeHead(422, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ code: 'VALIDATION_ERROR', message: '字段无效', request_id: 'up-1', data: null }))
    })
    await new Promise<void>((resolve) => {
      fixture.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })
    services.push({ server: fixture })
    const address = fixture.address() as { port: number }
    vi.stubEnv('TEAM_SKILL_SERVICE_URL', `http://127.0.0.1:${address.port}`)

    const response = await handleTeamSkillProxy(
      makeRequest('admin/team-skills'),
      makeContext(['admin', 'team-skills']),
      async () => 'token',
    )
    expect(response.status).toBe(422)
    const body = (await response.json()) as { code: string; request_id: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})
