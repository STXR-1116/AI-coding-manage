import type {
  AccountRole,
  AdminKnowledgeBase,
  AdminKnowledgeDeleteImpact,
  AdminKnowledgeDocument,
  AdminKnowledgeGraph,
  AdminKnowledgeOperation,
  AdminMemoryAudit,
  AdminMemoryJob,
  AdminMemoryList,
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
} from './team-skill-types.ts'

export type ApiError =
  | { readonly kind: 'not-ready'; readonly missing: readonly string[] }
  | { readonly kind: 'unauthorized'; readonly code: string; readonly message: string }
  | { readonly kind: 'forbidden'; readonly code: string; readonly message: string }
  | { readonly kind: 'revision-conflict'; readonly code: 'REVISION_CONFLICT' | 'MEMORY_REVISION_CONFLICT'; readonly message: string }
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
  listSkills(): Promise<ApiResult<readonly TeamSkill[]>> {
    return this.request<unknown>('/admin/team-skills').then(result => {
      if (!result.ok) return result
      const value = Array.isArray(result.value)
        ? result.value
        : isRecord(result.value) && Array.isArray(result.value.items)
          ? result.value.items
          : undefined
      return value === undefined
        ? { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的 Skill 列表' } }
        : { ok: true, value: value as readonly TeamSkill[] }
    })
  }
  /** Search current-organization users for the manual visibility selector. */
  listDirectoryUsers(query = ''): Promise<ApiResult<readonly DirectoryUser[]>> {
    return this.request(`/admin/directory/users?query=${encodeURIComponent(query)}`).then(result => {
      if (!result.ok) return result
      const payload = result.value as {
        readonly items?: readonly {
          readonly user_id: string
          readonly display_name: string
          readonly email: string
          readonly groups: readonly string[]
        }[]
      }
      return {
        ok: true,
        value: (payload.items ?? []).map(item => ({
          userId: item.user_id,
          displayName: item.display_name,
          email: item.email,
          groups: item.groups,
        })),
      }
    })
  }
  /** List the review queue. */
  listReviews(): Promise<ApiResult<readonly ReviewItem[]>> {
    return this.request('/admin/team-skill-reviews?status=pending_review')
  }
  /** List audit records visible to administrators. */
  listAuditLogs(): Promise<ApiResult<readonly AuditLogEntry[]>> {
    return this.request('/admin/team-skill-audit-logs')
  }
  /** List organizations visible to the current administrator role. */
  listOrganizations(): Promise<ApiResult<readonly AdminOrganization[]>> {
    return this.listEnvelope('/admin/organizations')
  }
  /** Create an organization and optionally assign its initial manager. */
  createOrganization(name: string, managerUserId: string | undefined, idempotencyKey: string): Promise<ApiResult<AdminOrganization>> {
    return this.request('/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, ...(managerUserId === undefined ? {} : { manager_user_id: managerUserId }) }),
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  }
  /** Update organization metadata with optimistic concurrency protection. */
  updateOrganization(
    organizationId: string,
    input: { readonly name?: string; readonly status?: 'active' | 'archived' },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminOrganization>> {
    return this.mutate(
      `/admin/organizations/${encodeURIComponent(organizationId)}`,
      revision,
      undefined,
      idempotencyKey,
      input,
      'PATCH',
    ) as Promise<ApiResult<AdminOrganization>>
  }
  /** List users in the current administrator scope. */
  listUsers(organizationId?: string, query = ''): Promise<ApiResult<readonly AdminUser[]>> {
    const search = new URLSearchParams()
    if (organizationId !== undefined) search.set('organization_id', organizationId)
    if (query.trim().length > 0) search.set('query', query.trim())
    return this.listEnvelope(`/admin/users${search.size === 0 ? '' : `?${search.toString()}`}`)
  }
  /** Create a manager/member and return the one-time initial password. */
  createUser(
    input: {
      readonly username: string
      readonly displayName: string
      readonly organizationIds: readonly string[]
      readonly globalRole: 'manager' | 'member'
      readonly projectIds?: readonly string[]
    },
    idempotencyKey: string,
  ): Promise<ApiResult<{ readonly user: AdminUser; readonly initial_password: string }>> {
    return this.request('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: input.username,
        display_name: input.displayName,
        organization_ids: input.organizationIds,
        global_role: input.globalRole,
        project_ids: input.projectIds ?? [],
      }),
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  }
  /** Suspend or restore an account with optimistic concurrency protection. */
  updateUser(
    userId: string,
    input: { readonly displayName?: string; readonly status?: 'active' | 'suspended' },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminUser>> {
    return this.mutate(
      `/admin/users/${encodeURIComponent(userId)}`,
      revision,
      undefined,
      idempotencyKey,
      {
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      'PATCH',
    ) as Promise<ApiResult<AdminUser>>
  }
  /** Add or reactivate an organization membership without changing the global role. */
  setMembership(
    organizationId: string,
    userId: string,
    revision: number | undefined,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminUser>> {
    return this.mutate(
      `/admin/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      revision,
      undefined,
      idempotencyKey,
      {},
      'PUT',
    ) as Promise<ApiResult<AdminUser>>
  }
  /** Remove an organization membership. */
  removeMembership(organizationId: string, userId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminUser>> {
    return this.mutate(
      `/admin/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      revision,
      undefined,
      idempotencyKey,
      undefined,
      'DELETE',
    ) as Promise<ApiResult<AdminUser>>
  }
  /** Read the fixed role dictionary. */
  listRoles(): Promise<ApiResult<readonly RoleDefinition[]>> {
    return this.listEnvelope('/admin/roles')
  }
  /** Read the server-owned permission dictionary. */
  listPermissions(): Promise<ApiResult<readonly PermissionDefinition[]>> {
    return this.listEnvelope('/admin/permissions')
  }
  /** List projects visible to the current administrator role. */
  listProjects(
    options: { readonly organizationId?: string; readonly status?: AdminProject['status']; readonly name?: string } = {},
  ): Promise<ApiResult<readonly AdminProject[]>> {
    const search = new URLSearchParams()
    if (options.organizationId !== undefined) search.set('organization_id', options.organizationId)
    if (options.status !== undefined) search.set('status', options.status)
    if (options.name !== undefined && options.name.trim().length > 0) search.set('name', options.name.trim())
    const suffix = search.size === 0 ? '' : `?${search.toString()}`
    return this.listEnvelope(`/admin/projects${suffix}`)
  }
  /** List active projects authorized for project-memory context resolution. */
  listMemoryProjects(): Promise<ApiResult<readonly AdminProject[]>> {
    return this.listEnvelope('/me/projects')
  }
  /** Read one project. */
  getProject(projectId: string): Promise<ApiResult<AdminProject>> {
    return this.request(`/admin/projects/${encodeURIComponent(projectId)}`)
  }
  /** Create a draft project in one explicitly selected organization. */
  createProject(
    input: { readonly organizationId: string; readonly name: string; readonly description?: string },
    idempotencyKey: string,
  ): Promise<ApiResult<AdminProject>> {
    return this.request('/admin/projects', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: input.organizationId,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
      }),
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  }
  /** Update project metadata with optimistic concurrency protection. */
  updateProject(
    projectId: string,
    input: { readonly name?: string; readonly description?: string },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}`, revision, undefined, idempotencyKey, input, 'PATCH') as Promise<
      ApiResult<AdminProject>
    >
  }
  /** Explicitly activate a draft project. */
  activateProject(projectId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}:activate`, revision, undefined, idempotencyKey) as Promise<
      ApiResult<AdminProject>
    >
  }
  /** Explicitly archive an active project. */
  archiveProject(projectId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(`/admin/projects/${encodeURIComponent(projectId)}:archive`, revision, undefined, idempotencyKey) as Promise<
      ApiResult<AdminProject>
    >
  }
  /** List project members and their relation revisions. */
  listProjectMembers(projectId: string): Promise<ApiResult<readonly AdminProjectMember[]>> {
    return this.listEnvelope(`/admin/projects/${encodeURIComponent(projectId)}/members`)
  }
  /** Add or update a project member relation; new relations use the project revision and existing ones use the relation revision. */
  setProjectMember(projectId: string, userId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(
      `/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      revision,
      undefined,
      idempotencyKey,
      {},
      'PUT',
    ) as Promise<ApiResult<AdminProject>>
  }
  /** Remove a project member relation. */
  removeProjectMember(projectId: string, userId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminProject>> {
    return this.mutate(
      `/admin/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      revision,
      undefined,
      idempotencyKey,
      undefined,
      'DELETE',
    ) as Promise<ApiResult<AdminProject>>
  }
  /** List the project's authorized asset relations. */
  listProjectAssets(projectId: string): Promise<ApiResult<readonly AdminProjectAsset[]>> {
    return this.listEnvelope(`/admin/projects/${encodeURIComponent(projectId)}/assets`)
  }
  /** Add one asset relation to a project. */
  addProjectAsset(
    projectId: string,
    input: {
      readonly assetType: AdminProjectAsset['asset_type']
      readonly assetId: string
      readonly relationKind: AdminProjectAsset['relation_kind']
      readonly revision: number
    },
    idempotencyKey: string,
  ): Promise<ApiResult<AdminProjectAsset>> {
    return this.mutate(
      `/admin/projects/${encodeURIComponent(projectId)}/assets`,
      input.revision,
      undefined,
      idempotencyKey,
      { asset_type: input.assetType, asset_id: input.assetId, relation_kind: input.relationKind, expected_revision: input.revision },
      'POST',
    ) as Promise<ApiResult<AdminProjectAsset>>
  }
  /** Update one asset relation kind. */
  updateProjectAsset(
    projectId: string,
    assetType: AdminProjectAsset['asset_type'],
    assetId: string,
    relationKind: AdminProjectAsset['relation_kind'],
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminProjectAsset>> {
    return this.mutate(
      `/admin/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(assetId)}`,
      revision,
      undefined,
      idempotencyKey,
      { relation_kind: relationKind },
      'PATCH',
    ) as Promise<ApiResult<AdminProjectAsset>>
  }
  /** Remove one asset relation. */
  removeProjectAsset(
    projectId: string,
    assetType: AdminProjectAsset['asset_type'],
    assetId: string,
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminProject>> {
    return this.mutate(
      `/admin/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(assetId)}`,
      revision,
      undefined,
      idempotencyKey,
      undefined,
      'DELETE',
    ) as Promise<ApiResult<AdminProject>>
  }
  /** List authorization audits filtered by organization/action. */
  listAuthorizationAudits(organizationId?: string, action?: string, projectId?: string): Promise<ApiResult<readonly AuthorizationAudit[]>> {
    const search = new URLSearchParams()
    if (organizationId !== undefined) search.set('organization_id', organizationId)
    if (action !== undefined && action.length > 0) search.set('action', action)
    if (projectId !== undefined && projectId.length > 0) search.set('project_id', projectId)
    return this.listEnvelope(`/admin/authorization-audits${search.size === 0 ? '' : `?${search.toString()}`}`)
  }
  /** List organization knowledge bases in the current management scope. */
  listKnowledgeBases(organizationId?: string): Promise<ApiResult<readonly AdminKnowledgeBase[]>> {
    if (organizationId === undefined) return this.listEnvelope('/admin/knowledge-bases')
    return this.listEnvelope(`/admin/organizations/${encodeURIComponent(organizationId)}/knowledge-bases`)
  }
  /** Create a knowledge base and return its external-operation state. */
  createKnowledgeBase(
    organizationId: string,
    input: { readonly name: string; readonly description: string; readonly type: AdminKnowledgeBase['type'] },
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/organizations/${encodeURIComponent(organizationId)}/knowledge-bases`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': '1' },
    }) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Read one knowledge base. */
  getKnowledgeBase(knowledgeBaseId: string): Promise<ApiResult<AdminKnowledgeBase>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`)
  }
  /** Read projects affected by external knowledge-base deletion. */
  getKnowledgeDeleteImpact(knowledgeBaseId: string): Promise<ApiResult<AdminKnowledgeDeleteImpact>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/delete-impact`)
  }
  /** Start an external knowledge-base deletion after an impact confirmation. */
  deleteKnowledgeBase(
    knowledgeBaseId: string,
    revision: number,
    affectedProjectCount: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expected_revision: revision, confirm_affected_project_count: affectedProjectCount }),
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    }) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Update basic knowledge-base configuration with optimistic concurrency. */
  updateKnowledgeBase(
    knowledgeBaseId: string,
    input: { readonly name?: string; readonly description?: string },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeBase>> {
    return this.mutate(
      `/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
      revision,
      undefined,
      idempotencyKey,
      input,
      'PATCH',
    ) as Promise<ApiResult<AdminKnowledgeBase>>
  }
  /** List documents and their authoritative processing states. */
  listKnowledgeDocuments(knowledgeBaseId: string): Promise<ApiResult<readonly AdminKnowledgeDocument[]>> {
    return this.listEnvelope(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`)
  }
  /** Read one document. */
  getKnowledgeDocument(knowledgeBaseId: string, documentId: string): Promise<ApiResult<AdminKnowledgeDocument>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/${encodeURIComponent(documentId)}`)
  }
  /** Start document reprocessing. */
  reparseKnowledgeDocument(
    knowledgeBaseId: string,
    documentId: string,
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(
      `/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/${encodeURIComponent(documentId)}/reparse`,
      {
        method: 'POST',
        body: JSON.stringify({ expected_revision: revision }),
        headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
      },
    ) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Start document deletion. */
  deleteKnowledgeDocument(
    knowledgeBaseId: string,
    documentId: string,
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expected_revision: revision }),
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    }) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Read wiki graph data. */
  getKnowledgeGraph(knowledgeBaseId: string): Promise<ApiResult<AdminKnowledgeGraph>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/graph`)
  }
  /** Import hand-authored Markdown through an asynchronous service operation. */
  importKnowledgeMarkdown(
    knowledgeBaseId: string,
    input: { readonly title: string; readonly markdown: string },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/markdown`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    }) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Import a URL as an asynchronous document operation. */
  importKnowledgeUrl(
    knowledgeBaseId: string,
    input: { readonly title?: string; readonly url: string },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/urls`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    }) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Import one uploaded file descriptor as an asynchronous document operation. */
  importKnowledgeFile(
    knowledgeBaseId: string,
    input: { readonly title: string; readonly file_name: string },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/files`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    }) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** Read one operation status. */
  getKnowledgeOperation(operationId: string): Promise<ApiResult<AdminKnowledgeOperation>> {
    return this.request(`/admin/operations/${encodeURIComponent(operationId)}`) as Promise<ApiResult<AdminKnowledgeOperation>>
  }
  /** List active project memories in the caller's management scope. */
  listMemoryRecords(
    options: {
      readonly projectId?: string
      readonly keyword?: string
      readonly status?: AdminMemoryRecord['status']
      readonly cursor?: string
      readonly limit?: number
    } = {},
  ): Promise<ApiResult<AdminMemoryList>> {
    return this.memoryRequest<AdminMemoryList>(
      '/project-memory/list',
      Object.fromEntries(
        Object.entries({
          project_id: options.projectId,
          keyword: options.keyword,
          status: options.status,
          cursor: options.cursor,
          limit: options.limit,
        }).filter(([, value]) => value !== undefined),
      ),
    ).then(result => {
      if (!result.ok) return result
      if (!isMemoryList(result.value))
        return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆列表' } }
      return result
    })
  }
  /** Read one project-memory detail. */
  getMemoryRecord(memoryId: string): Promise<ApiResult<AdminMemoryRecord>> {
    return this.memoryRequest<unknown>('/project-memory/get', { memory_id: memoryId }).then(result => {
      if (!result.ok) return result
      const value = isRecord(result.value) && isRecord(result.value.memory) ? result.value.memory : result.value
      return isMemoryRecord(value)
        ? { ok: true, value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆详情' } }
    })
  }
  /** Update one memory with optimistic concurrency. */
  updateMemoryRecord(memoryId: string, content: string, revision: number): Promise<ApiResult<AdminMemoryRecord>> {
    return this.memoryRequest<unknown>(
      '/project-memory/update',
      { memory_id: memoryId, content, expected_revision: revision },
      { 'If-Match': String(revision) },
    ).then(result => {
      if (!result.ok) return result
      const value = isRecord(result.value) ? result.value.memory : undefined
      return isMemoryRecord(value)
        ? { ok: true, value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回更新后的记忆' } }
    })
  }
  /** Delete one memory and return the asynchronous cleanup result. */
  deleteMemoryRecord(memoryId: string, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.memoryRequest(
      '/project-memory/delete',
      { memory_id: memoryId, expected_revision: revision },
      { 'If-Match': String(revision), 'Idempotency-Key': idempotencyKey },
    )
  }
  /** Move a memory to another authorized project with optimistic concurrency. */
  moveMemoryRecord(
    memoryId: string,
    targetProjectId: string,
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminMemoryRecord>> {
    return this.memoryRequest<{ readonly memory?: AdminMemoryRecord }>(
      '/project-memory/scope/update',
      { memory_id: memoryId, target_project_id: targetProjectId, expected_revision: revision },
      { 'If-Match': String(revision), 'Idempotency-Key': idempotencyKey },
    ).then(result => {
      if (!result.ok) return result
      return result.value.memory === undefined
        ? { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回调整后的记忆' } }
        : { ok: true, value: result.value.memory }
    })
  }
  /** Read one project's memory policy. */
  getMemoryPolicy(projectId: string): Promise<ApiResult<AdminMemoryPolicy>> {
    return this.memoryRequest('/project-memory/policy/get', { scope_type: 'project', scope_id: projectId })
  }
  /** Update one project's memory policy. */
  updateMemoryPolicy(
    projectId: string,
    patch: { readonly top_k?: number; readonly relevance_threshold?: number; readonly token_budget?: number },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminMemoryPolicy>> {
    return this.memoryRequest(
      '/project-memory/policy/update',
      { scope_type: 'project', scope_id: projectId, patch, expected_revision: revision },
      { 'If-Match': String(revision), 'Idempotency-Key': idempotencyKey },
    )
  }
  /** Read project-memory jobs. */
  listMemoryJobs(projectId?: string): Promise<ApiResult<readonly AdminMemoryJob[]>> {
    return this.memoryList('/project-memory/jobs/list', projectId === undefined ? {} : { project_id: projectId })
  }
  /** Read project-memory governance audit records. */
  listMemoryAudit(projectId?: string): Promise<ApiResult<readonly AdminMemoryAudit[]>> {
    return this.memoryList('/project-memory/audit/list', projectId === undefined ? {} : { project_id: projectId })
  }
  /** Retry one failed project-memory job. */
  retryMemoryJob(jobId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminMemoryJob>> {
    return this.memoryRequest(
      '/project-memory/jobs/retry',
      { job_id: jobId, expected_revision: revision },
      { 'Idempotency-Key': idempotencyKey },
    ).then(result => (result.ok ? { ok: true, value: result.value as AdminMemoryJob } : result))
  }
  /** Read a Skill with its version timeline. */
  getSkill(skillId: string): Promise<ApiResult<{ readonly skill: TeamSkill; readonly versions: readonly SkillVersion[] }>> {
    return this.request(`/admin/team-skills/${encodeURIComponent(skillId)}`)
  }
  /** Create the first author-owned draft. */
  createSkill(request: CreateSkillRequest): Promise<ApiResult<TeamSkill>> {
    return this.request('/admin/team-skills', {
      method: 'POST',
      body: JSON.stringify({
        display_name: request.displayName,
        summary: request.summary,
        visibility: request.visibility,
        ...(request.category === undefined ? {} : { category: request.category }),
        ...(request.tags === undefined ? {} : { tags: request.tags }),
        ...(request.groupId === undefined ? {} : { group_id: request.groupId }),
        ...(request.peopleIds === undefined ? {} : { people_ids: request.peopleIds }),
      }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
  }
  /** Update author-owned metadata for a draft Skill. */
  updateSkill(skillId: string, request: UpdateSkillRequest, revision: number, idempotencyKey: string): Promise<ApiResult<TeamSkill>> {
    return this.mutate(
      `/admin/team-skills/${encodeURIComponent(skillId)}`,
      revision,
      undefined,
      idempotencyKey,
      {
        ...(request.displayName === undefined ? {} : { display_name: request.displayName }),
        ...(request.summary === undefined ? {} : { summary: request.summary }),
        ...(request.visibility === undefined ? {} : { visibility: request.visibility }),
        ...(request.category === undefined ? {} : { category: request.category }),
        ...(request.tags === undefined ? {} : { tags: request.tags }),
        ...(request.groupId === undefined ? {} : { group_id: request.groupId }),
        ...(request.peopleIds === undefined ? {} : { people_ids: request.peopleIds }),
      },
      'PATCH',
    ) as Promise<ApiResult<TeamSkill>>
  }
  /** Create a new immutable-version draft for a Skill. */
  createVersion(skillId: string, request: CreateVersionRequest, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/versions`, revision, undefined, idempotencyKey, {
      version: request.version,
      release_notes: request.releaseNotes,
    })
  }
  /** Update fields that belong to an unsubmitted draft version. */
  updateVersion(
    skillId: string,
    version: string,
    request: UpdateVersionRequest,
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    return this.mutate(
      `/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}`,
      revision,
      undefined,
      idempotencyKey,
      {
        ...(request.releaseNotes === undefined ? {} : { release_notes: request.releaseNotes }),
        ...(request.dependencies === undefined ? {} : { dependencies: request.dependencies }),
        ...(request.permissions === undefined ? {} : { permissions: request.permissions }),
      },
      'PATCH',
    )
  }
  /** Upload a platform-hosted immutable DSH Skill ZIP. */
  uploadArtifact(
    skillId: string,
    version: string,
    artifact: Uint8Array,
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    const body = new ArrayBuffer(artifact.byteLength)
    new Uint8Array(body).set(artifact)
    return this.request(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/artifact`, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/zip', 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    })
  }
  /** Submit a validated draft version for administrator review. */
  submitReview(
    skillId: string,
    version: string,
    versionRevision: number,
    skillRevision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    return this.request(`/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/submit-review`, {
      method: 'POST',
      body: '{}',
      headers: { 'Idempotency-Key': idempotencyKey, 'If-Match': String(versionRevision), 'X-Skill-Revision': String(skillRevision) },
    })
  }
  /** Publish an approved version with optimistic concurrency protection. */
  publish(
    skillId: string,
    version: string,
    versionRevision: number,
    skillRevision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    return this.mutate(
      `/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/publish`,
      versionRevision,
      skillRevision,
      idempotencyKey,
    )
  }
  /** Withdraw a published version. */
  withdraw(
    skillId: string,
    version: string,
    reason: string,
    versionRevision: number,
    skillRevision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    return this.mutate(
      `/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/withdraw`,
      versionRevision,
      skillRevision,
      idempotencyKey,
      { reason },
    )
  }
  /** Approve a version after its structured review checks are complete. */
  approve(
    skillId: string,
    version: string,
    checks: Record<string, 'pass' | 'fail' | 'na'>,
    versionRevision: number,
    skillRevision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    return this.mutate(
      `/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/approve`,
      versionRevision,
      skillRevision,
      idempotencyKey,
      { checks },
    )
  }
  /** Reject a version with an author-visible reason. */
  reject(
    skillId: string,
    version: string,
    reason: string,
    versionRevision: number,
    skillRevision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<unknown>> {
    return this.mutate(
      `/admin/team-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(version)}/reject`,
      versionRevision,
      skillRevision,
      idempotencyKey,
      { reason },
    )
  }
  /** Select a previously published version as the recommended release. */
  rollback(skillId: string, version: string, revision: number, idempotencyKey: string): Promise<ApiResult<unknown>> {
    return this.mutate(`/admin/team-skills/${encodeURIComponent(skillId)}/rollback`, revision, undefined, idempotencyKey, { version })
  }

  private async mutate(
    path: string,
    versionRevision: number | undefined,
    skillRevision: number | undefined,
    idempotencyKey: string,
    body?: unknown,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
  ): Promise<ApiResult<unknown>> {
    return this.request(path, {
      method,
      headers: {
        'Idempotency-Key': idempotencyKey,
        ...(versionRevision === undefined ? {} : { 'If-Match': String(versionRevision) }),
        ...(skillRevision === undefined ? {} : { 'X-Skill-Revision': String(skillRevision) }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    return this.requestAt(this.baseUrl, path, init)
  }

  private listEnvelope<T>(path: string): Promise<ApiResult<readonly T[]>> {
    return this.request<{ readonly items?: readonly T[] }>(path).then(result =>
      result.ok ? { ok: true, value: result.value.items ?? [] } : result,
    )
  }

  private memoryRequest<T>(path: string, body: unknown, headers: HeadersInit = {}): Promise<ApiResult<T>> {
    const baseUrl = this.baseUrl?.replace(/\/v1\/?$/u, '/v3')
    const requestPath = baseUrl === this.baseUrl && this.baseUrl?.startsWith('/api/team-skill') === true ? `/v3${path}` : path
    return this.requestAt<Record<string, unknown>>(baseUrl, requestPath, { method: 'POST', headers, body: JSON.stringify(body) }).then(
      result => {
        if (!result.ok) return result
        const value = result.value.data ?? result.value
        return { ok: true, value: value as T }
      },
    )
  }

  private requestAt<T>(baseUrl: string | undefined, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    const missing = [
      baseUrl === undefined ? 'baseUrl' : undefined,
      this.accessToken === undefined && !this.sessionAuth ? 'accessToken' : undefined,
    ].filter((value): value is string => value !== undefined)
    if (missing.length > 0) return Promise.resolve({ ok: false, error: { kind: 'not-ready', missing } })
    return this.fetchRequest<T>(baseUrl!, path, init)
  }

  private async fetchRequest<T>(baseUrl: string, path: string, init: RequestInit): Promise<ApiResult<T>> {
    try {
      const response = await this.fetcher(`${baseUrl}${path}`, {
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
      const code =
        typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string'
          ? payload.code
          : `HTTP_${response.status}`
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : '服务端请求失败'
      if (response.status === 401 || code === 'UNAUTHORIZED' || code === 'AUTH_REQUIRED')
        return { ok: false, error: { kind: 'unauthorized', code, message } }
      if (response.status === 403 || code === 'FORBIDDEN' || code === 'PROJECT_ACCESS_DENIED')
        return { ok: false, error: { kind: 'forbidden', code, message } }
      if (code === 'REVISION_CONFLICT' || code === 'MEMORY_REVISION_CONFLICT')
        return { ok: false, error: { kind: 'revision-conflict', code, message } }
      return { ok: false, error: { kind: 'service', code, message } }
    } catch (error) {
      return {
        ok: false,
        error: { kind: 'service', code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : '无法连接 Skill 服务' },
      }
    }
  }

  private memoryList<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<readonly T[]>> {
    return this.memoryRequest<unknown>(path, body).then(result => {
      if (!result.ok) return result
      const value = isRecord(result.value) && Array.isArray(result.value.items) ? (result.value.items as readonly T[]) : undefined
      return value === undefined
        ? { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆列表' } }
        : { ok: true, value }
    })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isMemoryRecord(value: unknown): value is AdminMemoryRecord {
  return (
    isRecord(value) &&
    typeof value.memory_id === 'string' &&
    typeof value.project_id === 'string' &&
    typeof value.content === 'string' &&
    typeof value.revision === 'number'
  )
}
function isMemoryList(value: unknown): value is AdminMemoryList {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isMemoryRecord) &&
    (value.next_cursor === null || typeof value.next_cursor === 'string' || value.next_cursor === undefined)
  )
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { code: 'INVALID_JSON', message: '服务端返回了无效 JSON' }
  }
}
