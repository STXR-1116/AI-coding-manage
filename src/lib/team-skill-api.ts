import type { AccountRole, AdminOrganization, AdminProject, AdminProjectAsset, AdminProjectMember, AdminUser, AuthorizationAudit, AuditLogEntry, DirectoryUser, PermissionDefinition, ReviewItem, RoleDefinition, SkillVersion, TeamSkill } from './team-skill-types.ts'

export type ApiError =
  | { readonly kind: 'not-ready'; readonly missing: readonly string[] }
  | { readonly kind: 'unauthorized'; readonly code: string; readonly message: string }
  | { readonly kind: 'forbidden'; readonly code: string; readonly message: string }
  | { readonly kind: 'revision-conflict'; readonly code: 'REVISION_CONFLICT'; readonly message: string }
  | { readonly kind: 'service'; readonly code: string; readonly message: string }

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError }

export interface TeamSkillApiOptions {
  readonly baseUrl?: string
  readonly accessToken?: string
  /** Use the same-origin Auth.js proxy instead of a browser-held service token. */
  readonly sessionAuth?: boolean
  readonly fetcher?: typeof fetch
}

export interface CreateSkillRequest {
  readonly displayName: string
  readonly summary: string
  readonly visibility: TeamSkill['visibility']
  readonly category?: string
  readonly tags?: readonly string[]
  readonly groupId?: string
  readonly peopleIds?: readonly string[]
}

export interface UpdateSkillRequest {
  readonly displayName?: string
  readonly summary?: string
  readonly visibility?: TeamSkill['visibility']
  readonly category?: string
  readonly tags?: readonly string[]
  readonly groupId?: string
  readonly peopleIds?: readonly string[]
}

export interface CreateVersionRequest {
  readonly version: string
  readonly releaseNotes: string
}

export interface UpdateVersionRequest {
  readonly releaseNotes?: string
  readonly dependencies?: readonly string[]
  readonly permissions?: readonly string[]
}

/** Minimal typed REST client for the Skill administration API. */
export class TeamSkillApi {
  private readonly baseUrl?: string
  private readonly accessToken?: string
  private readonly sessionAuth: boolean
  private readonly fetcher: typeof fetch

  constructor(options: TeamSkillApiOptions) {
    const baseUrl = options.baseUrl?.trim()
    const accessToken = options.accessToken?.trim()
    this.baseUrl = baseUrl === undefined || baseUrl.length === 0 ? undefined : baseUrl.replace(/\/$/, '')
    this.accessToken = accessToken === undefined || accessToken.length === 0 ? undefined : accessToken
    this.sessionAuth = options.sessionAuth === true
    const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
    this.fetcher = (input, init) => fetcher(input, init)
  }

  /** List directory rows visible to the current admin role. */
  listSkills(): Promise<ApiResult<readonly TeamSkill[]>> { return this.request('/admin/team-skills') }
  /** Search current-organization users for the manual visibility selector. */
  listDirectoryUsers(query = ''): Promise<ApiResult<readonly DirectoryUser[]>> {
    return this.request(`/admin/directory/users?query=${encodeURIComponent(query)}`).then(result => {
      if (!result.ok) return result
      const payload = result.value as { readonly items?: readonly { readonly user_id: string; readonly display_name: string; readonly email: string; readonly groups: readonly string[] }[] }
      return { ok: true, value: (payload.items ?? []).map(item => ({ userId: item.user_id, displayName: item.display_name, email: item.email, groups: item.groups })) }
    })
  }
  /** List the review queue. */
  listReviews(): Promise<ApiResult<readonly ReviewItem[]>> { return this.request('/admin/team-skill-reviews?status=pending_review') }
  /** List audit records visible to administrators. */
  listAuditLogs(): Promise<ApiResult<readonly AuditLogEntry[]>> { return this.request('/admin/team-skill-audit-logs') }
  /** List organizations visible to the current administrator role. */
  listOrganizations(): Promise<ApiResult<readonly AdminOrganization[]>> { return this.listEnvelope('/admin/organizations') }
  /** Create an organization and optionally assign its initial manager. */
  createOrganization(name: string, managerUserId: string | undefined, idempotencyKey: string): Promise<ApiResult<AdminOrganization>> {
    return this.request('/admin/organizations', { method: 'POST', body: JSON.stringify({ name, ...(managerUserId === undefined ? {} : { manager_user_id: managerUserId }) }), headers: { 'Idempotency-Key': idempotencyKey } })
  }
  /** Update organization metadata with optimistic concurrency protection. */
  updateOrganization(organizationId: string, input: { readonly name?: string; readonly status?: 'active' | 'archived' }, revision: number, idempotencyKey: string): Promise<ApiResult<AdminOrganization>> {
    return this.mutate(`/admin/organizations/${encodeURIComponent(organizationId)}`, revision, undefined, idempotencyKey, input, 'PATCH') as Promise<ApiResult<AdminOrganization>>
  }
  /** List users in the current administrator scope. */
  listUsers(organizationId?: string, query = ''): Promise<ApiResult<readonly AdminUser[]>> {
    const search = new URLSearchParams()
    if (organizationId !== undefined) search.set('organization_id', organizationId)
    if (query.trim().length > 0) search.set('query', query.trim())
    return this.listEnvelope(`/admin/users${search.size === 0 ? '' : `?${search.toString()}`}`)
  }
  /** Create a manager/member and return the one-time initial password. */
  createUser(input: { readonly username: string; readonly displayName: string; readonly organizationIds: readonly string[]; readonly globalRole: 'manager' | 'member'; readonly projectIds?: readonly string[] }, idempotencyKey: string): Promise<ApiResult<{ readonly user: AdminUser; readonly initial_password: string }>> {
    return this.request('/admin/users', { method: 'POST', body: JSON.stringify({ username: input.username, display_name: input.displayName, organization_ids: input.organizationIds, global_role: input.globalRole, project_ids: input.projectIds ?? [] }), headers: { 'Idempotency-Key': idempotencyKey } })
  }
  /** Suspend or restore an account with optimistic concurrency protection. */
  updateUser(userId: string, input: { readonly displayName?: string; readonly status?: 'active' | 'suspended' }, revision: number, idempotencyKey: string): Promise<ApiResult<AdminUser>> {
    return this.mutate(`/admin/users/${encodeURIComponent(userId)}`, revision, undefined, idempotencyKey, { ...(input.displayName === undefined ? {} : { display_name: input.displayName }), ...(input.status === undefined ? {} : { status: input.status }) }, 'PATCH') as Promise<ApiResult<AdminUser>>
  }
  /** Add or reactivate an organization membership without changing the global role. */
  setMembership(organizationId: string, userId: string, revision: number | undefined, idempotencyKey: string): Promise<ApiResult<AdminUser>> {
    return this.mutate(`/admin/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, revision, undefined, idempotencyKey, {}, 'PUT') as Promise<ApiResult<AdminUser>>
  }
  /** Remove an organization membership. */
  removeMembership(organizationId: string, userId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminUser>> {
    return this.mutate(`/admin/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, revision, undefined, idempotencyKey, undefined, 'DELETE') as Promise<ApiResult<AdminUser>>
  }
  /** Read the fixed role dictionary. */
  listRoles(): Promise<ApiResult<readonly RoleDefinition[]>> { return this.listEnvelope('/admin/roles') }
  /** Read the server-owned permission dictionary. */
  listPermissions(): Promise<ApiResult<readonly PermissionDefinition[]>> { return this.listEnvelope('/admin/permissions') }
  /** List projects visible to the current administrator role. */
  listProjects(options: { readonly organizationId?: string; readonly status?: AdminProject['status']; readonly name?: string } = {}): Promise<ApiResult<readonly AdminProject[]>> {
    const search = new URLSearchParams()
    if (options.organizationId !== undefined) search.set('organization_id', options.organizationId)
    if (options.status !== undefined) search.set('status', options.status)
    if (options.name !== undefined && options.name.trim().length > 0) search.set('name', options.name.trim())
    const suffix = search.size === 0 ? '' : `?${search.toString()}`
    return this.listEnvelope(`/admin/projects${suffix}`)
  }
  /** Read one project. */
  getProject(projectId: string): Promise<ApiResult<AdminProject>> { return this.request(`/admin/projects/${encodeURIComponent(projectId)}`) }
  /** Create a draft project in one explicitly selected organization. */
  createProject(input: { readonly organizationId: string; readonly name: string; readonly description?: string }, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.request('/admin/projects', { method: 'POST', body: JSON.stringify({ organization_id: input.organizationId, name: input.name, ...(input.description === undefined ? {} : { description: input.description }) }), headers: { 'Idempotency-Key': idempotencyKey } })
  }
  /** Update project metadata with optimistic concurrency protection. */
  updateProject(projectId: string, input: { readonly name?: string; readonly description?: string }, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}`, revision, undefined, idempotencyKey, input, 'PATCH') as Promise<ApiResult<AdminProject>>
  }
  /** Explicitly activate a draft project. */
  activateProject(projectId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}:activate`, revision, undefined, idempotencyKey) as Promise<ApiResult<AdminProject>>
  }
  /** Explicitly archive an active project. */
  archiveProject(projectId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}:archive`, revision, undefined, idempotencyKey) as Promise<ApiResult<AdminProject>>
  }
  /** List project members and their relation revisions. */
  listProjectMembers(projectId: string): Promise<ApiResult<readonly AdminProjectMember[]>> { return this.listEnvelope(`/admin/projects/${encodeURIComponent(projectId)}/members`) }
  /** Add or update a project member relation; new relations use the project revision and existing ones use the relation revision. */
  setProjectMember(projectId: string, userId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, revision, undefined, idempotencyKey, {}, 'PUT') as Promise<ApiResult<AdminProject>>
  }
  /** Remove a project member relation. */
  removeProjectMember(projectId: string, userId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, revision, undefined, idempotencyKey, undefined, 'DELETE') as Promise<ApiResult<AdminProject>>
  }
  /** List the project's authorized asset relations. */
  listProjectAssets(projectId: string): Promise<ApiResult<readonly AdminProjectAsset[]>> { return this.listEnvelope(`/admin/projects/${encodeURIComponent(projectId)}/assets`) }
  /** Add one asset relation to a project. */
  addProjectAsset(projectId: string, input: { readonly assetType: AdminProjectAsset['asset_type']; readonly assetId: string; readonly relationKind: AdminProjectAsset['relation_kind']; readonly revision: number }, idempotencyKey: string): Promise<ApiResult<AdminProjectAsset>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}/assets`, input.revision, undefined, idempotencyKey, { asset_type: input.assetType, asset_id: input.assetId, relation_kind: input.relationKind, expected_revision: input.revision }, 'POST') as Promise<ApiResult<AdminProjectAsset>>
  }
  /** Update one asset relation kind. */
  updateProjectAsset(projectId: string, assetType: AdminProjectAsset['asset_type'], assetId: string, relationKind: AdminProjectAsset['relation_kind'], revision: number, idempotencyKey: string): Promise<ApiResult<AdminProjectAsset>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(assetId)}`, revision, undefined, idempotencyKey, { relation_kind: relationKind }, 'PATCH') as Promise<ApiResult<AdminProjectAsset>>
  }
  /** Remove one asset relation. */
  removeProjectAsset(projectId: string, assetType: AdminProjectAsset['asset_type'], assetId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(assetId)}`, revision, undefined, idempotencyKey, undefined, 'DELETE') as Promise<ApiResult<AdminProject>>
  }
  /** List authorization audits filtered by organization/action. */
  listAuthorizationAudits(organizationId?: string, action?: string, projectId?: string): Promise<ApiResult<readonly AuthorizationAudit[]>> {
    const search = new URLSearchParams()
    if (organizationId !== undefined) search.set('organization_id', organizationId)
    if (action !== undefined && action.length > 0) search.set('action', action)
    if (projectId !== undefined && projectId.length > 0) search.set('project_id', projectId)
    return this.listEnvelope(`/admin/authorization-audits${search.size === 0 ? '' : `?${search.toString()}`}`)
  }
  /** Read a Skill with its version timeline. */
  getSkill(skillId: string): Promise<ApiResult<{ readonly skill: TeamSkill; readonly versions: readonly SkillVersion[] }>> { return this.request(`/admin/team-skills/${encodeURIComponent(skillId)}`) }
  /** Create the first author-owned draft. */
  createSkill(request: CreateSkillRequest): Promise<ApiResult<TeamSkill>> {
    return this.request('/admin/team-skills', { method: 'POST', body: JSON.stringify({
      display_name: request.displayName,
      summary: request.summary,
      visibility: request.visibility,
      ...(request.category === undefined ? {} : { category: request.category }),
      ...(request.tags === undefined ? {} : { tags: request.tags }),
      ...(request.groupId === undefined ? {} : { group_id: request.groupId }),
      ...(request.peopleIds === undefined ? {} : { people_ids: request.peopleIds }),
    }), headers: { 'Idempotency-Key': crypto.randomUUID() } })
  }
  /** Update author-owned metadata for a draft Skill. */
  updateSkill(skillId: string, request: UpdateSkillRequest, revision: number, idempotencyKey: string): Promise<ApiResult<TeamSkill>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}`, revision, undefined, idempotencyKey, {
      ...(request.displayName === undefined ? {} : { display_name: request.displayName }),
      ...(request.summary === undefined ? {} : { summary: request.summary }),
      ...(request.visibility === undefined ? {} : { visibility: request.visibility }),
      ...(request.category === undefined ? {} : { category: request.category }),
      ...(request.tags === undefined ? {} : { tags: request.tags }),
      ...(request.groupId === undefined ? {} : { group_id: request.groupId }),
      ...(request.peopleIds === undefined ? {} : { people_ids: request.peopleIds }),
    }, 'PATCH') as Promise<ApiResult<TeamSkill>>
  }
  /** Create a new immutable-version draft for a Skill. */
  createVersion(skillId: string, request: CreateVersionRequest, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions`, revision, undefined, idempotencyKey, { version: request.version, release_notes: request.releaseNotes })
  }
  /** Update fields that belong to an unsubmitted draft version. */
  updateVersion(skillId: string, version: string, request: UpdateVersionRequest, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}`, revision, undefined, idempotencyKey, {
      ...(request.releaseNotes === undefined ? {} : { release_notes: request.releaseNotes }),
      ...(request.dependencies === undefined ? {} : { dependencies: request.dependencies }),
      ...(request.permissions === undefined ? {} : { permissions: request.permissions }),
    }, 'PATCH')
  }
  /** Upload a platform-hosted immutable DSH Skill ZIP. */
  uploadArtifact(skillId: string, version: string, artifact: Uint8Array, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    const body = new ArrayBuffer(artifact.byteLength)
    new Uint8Array(body).set(artifact)
    return this.request(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/artifact`, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/zip', 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    })
  }
  /** Submit a validated draft version for administrator review. */
  submitReview(skillId: string, version: string, versionRevision: number, skillRevision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.request(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/submit-review`, {
      method: 'POST',
      body: '{}',
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(versionRevision), 'X-Skill-Revision': String(skillRevision) },
    })
  }
  /** Publish an approved version with optimistic concurrency protection. */
  publish(skillId: string, version: string, versionRevision: number, skillRevision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/publish`, versionRevision, skillRevision, idempotencyKey)
  }
  /** Withdraw a published version. */
  withdraw(skillId: string, version: string, reason: string, versionRevision: number, skillRevision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/withdraw`, versionRevision, skillRevision, idempotencyKey, { reason })
  }
  /** Approve a version after its structured review checks are complete. */
  approve(skillId: string, version: string, checks: Record<string, 'pass' | 'fail' | 'na'>, versionRevision: number, skillRevision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/approve`, versionRevision, skillRevision, idempotencyKey, { checks })
  }
  /** Reject a version with an author-visible reason. */
  reject(skillId: string, version: string, reason: string, versionRevision: number, skillRevision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/reject`, versionRevision, skillRevision, idempotencyKey, { reason })
  }
  /** Select a previously published version as the recommended release. */
  rollback(skillId: string, version: string, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/rollback`, revision, undefined, idempotencyKey, { version })
  }

  private async mutate(path: string, versionRevision: number | undefined, skillRevision: number | undefined, idempotencyKey: string, body?: unknown, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST'): Promise<ApiResult<unknown>> {
    return this.request(path, { method, headers: { 'Idempotency-Key': idempotencyKey, ...(versionRevision === undefined ? {} : { 'If-Match': String(versionRevision) }), ...(skillRevision === undefined ? {} : { 'X-Skill-Revision': String(skillRevision) }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    const missing = [this.baseUrl === undefined ? 'baseUrl' : undefined, this.accessToken === undefined && !this.sessionAuth ? 'accessToken' : undefined].filter((value): value is string => value !== undefined)
    if (missing.length > 0) return { ok: false, error: { kind: 'not-ready', missing } }
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.accessToken === undefined ? {} : { Authorization: `Bearer ${this.accessToken}` }),
          ...init.headers,
        },
      })
      const payload = await readJson(response)
      if (response.ok) return { ok: true, value: payload as T }
      const code = typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`
      const message = typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string' ? payload.message : '服务端请求失败'
      if (response.status === 401 || code === 'UNAUTHORIZED' || code === 'AUTH_REQUIRED') return { ok: false, error: { kind: 'unauthorized', code, message } }
      if (response.status === 403 || code === 'FORBIDDEN') return { ok: false, error: { kind: 'forbidden', code, message } }
      if (code === 'REVISION_CONFLICT') return { ok: false, error: { kind: 'revision-conflict', code: 'REVISION_CONFLICT', message } }
      return { ok: false, error: { kind: 'service', code, message } }
    } catch (error) {
      return { ok: false, error: { kind: 'service', code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : '无法连接 Skill 服务' } }
    }
  }

  private listEnvelope<T>(path: string): Promise<ApiResult<readonly T[]>> {
    return this.request<{ readonly items?: readonly T[] }>(path).then(result => result.ok ? { ok: true, value: result.value.items ?? [] } : result)
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return {}
  try { return JSON.parse(text) as unknown } catch { return { code: 'INVALID_JSON', message: '服务端返回了无效 JSON' } }
}
