import type {
  AccountRole,
  AdminKnowledgeBase,
  AdminKnowledgeDeleteImpact,
  AdminKnowledgeDocument,
  AdminKnowledgeGraph,
  AdminKnowledgeOperation,
  AdminMemoryAudit,
  AdminMemoryAuditList,
  AdminMemoryJob,
  AdminMemoryJobList,
  AdminMemoryList,
  AdminMemoryMutation,
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
  TelemetryBucket,
  TelemetryDelivery,
  TelemetryEventItem,
  TelemetryEventPage,
  TelemetryModelUsage,
  TelemetryOverview,
  TelemetryProjectSummary,
  TelemetrySummary,
  TelemetryToolUsage,
} from './team-skill-types.ts'

export type ApiError =
  | { readonly kind: 'not-ready'; readonly missing: readonly string[] }
  | { readonly kind: 'unauthorized'; readonly code: string; readonly message: string }
  | { readonly kind: 'forbidden'; readonly code: string; readonly message: string }
  | { readonly kind: 'revision-conflict'; readonly code: 'REVISION_CONFLICT' | 'MEMORY_REVISION_CONFLICT'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly code: 'NETWORK_ERROR' | 'UPSTREAM_UNAVAILABLE'; readonly message: string }
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
      return !Array.isArray(result.value)
        ? { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的 Skill 列表' } }
        : { ok: true, value: result.value as readonly TeamSkill[] }
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
      if (!isRecord(result.value) || !Array.isArray(payload.items))
        return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的目录用户列表' } }
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
    return this.request<unknown>('/admin/team-skill-audit-logs').then(result => {
      if (!result.ok) return result
      return Array.isArray(result.value) && result.value.every(isAuditLogEntry)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回包含操作者姓名的有效 Skill 审计列表' } }
    })
  }
  /** Read role-authorized telemetry aggregation for the requested window. */
  getTelemetryOverview(
    query: { readonly from: string; readonly to: string; readonly organizationId?: string; readonly projectId?: string },
  ): Promise<ApiResult<TelemetryOverview>> {
    const search = new URLSearchParams({ from: query.from, to: query.to })
    if (query.organizationId !== undefined) search.set('organization_id', query.organizationId)
    if (query.projectId !== undefined) search.set('project_id', query.projectId)
    return this.request(`/admin/telemetry/overview?${search.toString()}`).then(result => {
      if (!result.ok) return result
      return isTelemetryOverview(result.value)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的可观测总览' } }
    })
  }
  /** Read one authorized project's telemetry summary for the requested window. */
  getProjectTelemetrySummary(
    projectId: string,
    query: { readonly from: string; readonly to: string },
  ): Promise<ApiResult<TelemetryProjectSummary>> {
    const search = new URLSearchParams({ from: query.from, to: query.to })
    return this.request(`/admin/projects/${encodeURIComponent(projectId)}/telemetry/summary?${search.toString()}`).then(result => {
      if (!result.ok) return result
      return isTelemetryProjectSummary(result.value)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的项目可观测摘要' } }
    })
  }
  /** Read one page of an authorized project's structured telemetry events. */
  listProjectTelemetryEvents(
    projectId: string,
    query: {
      readonly from: string
      readonly to: string
      readonly kind?: string
      readonly outcome?: string
      readonly cursor?: string
      readonly limit?: number
    },
  ): Promise<ApiResult<TelemetryEventPage>> {
    const search = new URLSearchParams({ from: query.from, to: query.to })
    if (query.kind !== undefined) search.set('kind', query.kind)
    if (query.outcome !== undefined) search.set('outcome', query.outcome)
    if (query.cursor !== undefined) search.set('cursor', query.cursor)
    if (query.limit !== undefined) search.set('limit', String(query.limit))
    return this.request(`/admin/projects/${encodeURIComponent(projectId)}/telemetry/events?${search.toString()}`).then(result => {
      if (!result.ok) return result
      return isTelemetryEventPage(result.value)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的事件诊断页' } }
    })
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
    return this.listEnvelope<unknown>(`/admin/authorization-audits${search.size === 0 ? '' : `?${search.toString()}`}`).then(result => {
      if (!result.ok) return result
      return result.value.every(isAuthorizationAudit)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回包含操作者姓名的有效授权审计列表' } }
    })
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
  /** Read one knowledge base; the response is validated field-by-field so a
   * malformed body can never reach the page state as a partial object. */
  getKnowledgeBase(knowledgeBaseId: string): Promise<ApiResult<AdminKnowledgeBase>> {
    return this.request(`/admin/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`).then(result => {
      if (!result.ok) return result
      return isKnownKnowledgeBase(result.value)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service' as const, code: 'INVALID_RESPONSE', message: '服务端未返回有效的知识库详情' } }
    })
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
      const mutation = parseMemoryMutation(result.value)
      return mutation === undefined || mutation.memory === undefined
        ? { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回更新后的记忆' } }
        : { ok: true, value: mutation.memory }
    })
  }
  /** Delete one memory and return the asynchronous cleanup result. */
  deleteMemoryRecord(memoryId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminMemoryMutation>> {
    return this.memoryRequest<unknown>(
      '/project-memory/delete',
      { memory_id: memoryId, expected_revision: revision },
      { 'If-Match': String(revision), 'Idempotency-Key': idempotencyKey },
    ).then(result => (result.ok ? parseMemoryMutationResult(result.value) : result))
  }
  /** Read one project's memory policy. */
  getMemoryPolicy(projectId: string): Promise<ApiResult<AdminMemoryPolicy>> {
    return this.memoryRequest<unknown>('/project-memory/policy/get', { scope_type: 'project', scope_id: projectId }).then(result =>
      result.ok ? parseMemoryPolicyResult(result.value) : result,
    )
  }
  /** Update one project's memory policy. */
  updateMemoryPolicy(
    projectId: string,
    patch: { readonly top_k?: number; readonly relevance_threshold?: number; readonly token_budget?: number },
    revision: number,
    idempotencyKey: string,
  ): Promise<ApiResult<AdminMemoryPolicy>> {
    return this.memoryRequest<unknown>(
      '/project-memory/policy/update',
      { scope_type: 'project', scope_id: projectId, patch, expected_revision: revision },
      { 'If-Match': String(revision), 'Idempotency-Key': idempotencyKey },
    ).then(result => (result.ok ? parseMemoryPolicyResult(result.value) : result))
  }
  /** Read project-memory jobs. */
  listMemoryJobs(projectId?: string): Promise<ApiResult<AdminMemoryJobList>> {
    return this.memoryRequest<unknown>('/project-memory/jobs/list', projectId === undefined ? {} : { project_id: projectId }).then(result => {
      if (!result.ok) return result
      return isMemoryJobList(result.value)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆任务列表' } }
    })
  }
  /** Read project-memory governance audit records. */
  listMemoryAudit(projectId?: string): Promise<ApiResult<AdminMemoryAuditList>> {
    return this.memoryRequest<unknown>('/project-memory/audit/list', projectId === undefined ? {} : { project_id: projectId }).then(result => {
      if (!result.ok) return result
      return isMemoryAuditList(result.value)
        ? { ok: true, value: result.value }
        : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆审计列表' } }
    })
  }
  /** Retry one failed project-memory job. */
  retryMemoryJob(jobId: string, revision: number, idempotencyKey: string): Promise<ApiResult<AdminMemoryJob>> {
    return this.memoryRequest<unknown>(
      '/project-memory/jobs/retry',
      { job_id: jobId, expected_revision: revision },
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(revision) },
    ).then(result => (result.ok ? parseMemoryJobResult(result.value) : result))
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
    return this.request<unknown>(path).then(result => {
      if (!result.ok) return result
      if (!isRecord(result.value) || !Array.isArray(result.value.items))
        return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的列表' } }
      return { ok: true, value: result.value.items as readonly T[] }
    })
  }

  private memoryRequest<T>(path: string, body: unknown, headers: HeadersInit = {}): Promise<ApiResult<T>> {
    const baseUrl = this.baseUrl?.replace(/\/v1\/?$/u, '/v3')
    const requestPath = baseUrl === this.baseUrl && this.baseUrl?.startsWith('/api/team-skill') === true ? `/v3${path}` : path
    return this.requestAt<T>(baseUrl, requestPath, { method: 'POST', headers, body: JSON.stringify(body) })
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
      if (response.ok) {
        // 204 无内容：合法的无body成功。
        if (response.status === 204) return { ok: true, value: undefined as T }
        const envelope = successEnvelope(payload)
        if (envelope === undefined)
          return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端响应不是有效的统一 envelope' } }
        // 2xx 只代表传输成功：业务成败由 envelope.code === 0 判定，非零业务码
        // 进入失败分类并保留 request_id，防止上游业务失败被误判为成功。
        if (envelope.code !== 0 && envelope.code !== '0') {
          const code = String(envelope.code)
          const message = envelope.message
          if (response.status === 401 || code === 'UNAUTHORIZED' || code === 'AUTH_REQUIRED' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_REVOKED')
            return { ok: false, error: { kind: 'unauthorized', code, message } }
          if (response.status === 403 || code === 'FORBIDDEN' || code === 'PROJECT_ACCESS_DENIED')
            return { ok: false, error: { kind: 'forbidden', code, message } }
          if (code === 'REVISION_CONFLICT' || code === 'MEMORY_REVISION_CONFLICT')
            return { ok: false, error: { kind: 'revision-conflict', code, message } }
          return { ok: false, error: { kind: 'service', code, message } }
        }
        if (envelope.data === undefined || envelope.data === null)
          return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '成功响应缺少 data 字段' } }
        return { ok: true, value: envelope.data as T }
      }
      const envelope = successEnvelope(payload)
      if (envelope === undefined || envelope.data !== null)
        return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端错误响应不是有效的统一 envelope' } }
      const code = String(envelope.code)
      const message = envelope.message
      if (response.status === 401 || code === 'UNAUTHORIZED' || code === 'AUTH_REQUIRED' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_REVOKED')
        return { ok: false, error: { kind: 'unauthorized', code, message } }
      if (response.status === 403 || code === 'FORBIDDEN' || code === 'PROJECT_ACCESS_DENIED')
        return { ok: false, error: { kind: 'forbidden', code, message } }
      if (code === 'REVISION_CONFLICT' || code === 'MEMORY_REVISION_CONFLICT')
        return { ok: false, error: { kind: 'revision-conflict', code, message } }
      return { ok: false, error: { kind: 'service', code, message } }
    } catch (error) {
      return {
        ok: false,
        error: { kind: 'unavailable', code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : '无法连接 Skill 服务' },
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

function isAuditLogEntry(value: unknown): value is AuditLogEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.occurredAt === 'string' &&
    typeof value.actor_name === 'string' &&
    value.actor_name.trim().length > 0 &&
    typeof value.action === 'string' &&
    typeof value.skillName === 'string' &&
    typeof value.version === 'string' &&
    (value.scope === undefined || value.scope === 'project' || value.scope === 'global') &&
    (value.result === 'succeeded' || value.result === 'failed' || value.result === 'cancelled') &&
    typeof value.requestId === 'string'
  )
}

function isAuthorizationAudit(value: unknown): value is AuthorizationAudit {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.occurred_at === 'string' &&
    typeof value.actor_user_id === 'string' &&
    typeof value.actor_name === 'string' &&
    value.actor_name.trim().length > 0 &&
    (value.organization_id === undefined || typeof value.organization_id === 'string') &&
    (value.target_user_id === undefined || typeof value.target_user_id === 'string') &&
    (value.project_id === undefined || typeof value.project_id === 'string') &&
    typeof value.action === 'string' &&
    (value.result === 'succeeded' || value.result === 'failed') &&
    (value.error_code === undefined || typeof value.error_code === 'string') &&
    typeof value.request_id === 'string'
  )
}

function successEnvelope(value: unknown): { readonly code: number | string; readonly message: string; readonly request_id: string; readonly data: unknown } | undefined {
  if (!isRecord(value) || !Object.hasOwn(value, 'data')) return undefined
  if ((typeof value.code !== 'number' && typeof value.code !== 'string') || typeof value.message !== 'string' || typeof value.request_id !== 'string')
    return undefined
  return value as { readonly code: number | string; readonly message: string; readonly request_id: string; readonly data: unknown }
}
function isMemoryRecord(value: unknown): value is AdminMemoryRecord {
  return (
    isRecord(value) &&
    typeof value.memory_id === 'string' &&
    typeof value.team_id === 'string' &&
    typeof value.project_id === 'string' &&
    typeof value.content === 'string' &&
    value.layer === 'L1' &&
    typeof value.captured_by_user_id === 'string' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.revision === 'number' &&
    (value.status === 'ACTIVE' || value.status === 'DELETED') &&
    typeof value.importance === 'number' &&
    typeof value.recall_count === 'number' &&
    (value.last_recalled_at === null || typeof value.last_recalled_at === 'string') &&
    value.source_kind === 'agent_turn'
  )
}
function isMemoryList(value: unknown): value is AdminMemoryList {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isMemoryRecord) &&
    (value.next_cursor === null || typeof value.next_cursor === 'string') &&
    typeof value.total_estimate === 'number' &&
    Number.isFinite(value.total_estimate)
  )
}

function isMemoryJob(value: unknown): value is AdminMemoryJob {
  return (
    isRecord(value) &&
    typeof value.job_id === 'string' &&
    typeof value.event_id === 'string' &&
    (value.kind === 'CAPTURE' ||
      value.kind === 'INDEX_REFRESH' ||
      value.kind === 'DELETE_CLEANUP' ||
      value.kind === 'PROJECT_PROVISION' ||
      value.kind === 'POLICY_UPDATE' ||
      value.kind === 'PROJECT_PURGE') &&
    typeof value.team_id === 'string' &&
    typeof value.project_id === 'string' &&
    typeof value.requested_by_user_id === 'string' &&
    (value.status === 'PENDING' || value.status === 'SUCCEEDED' || value.status === 'FAILED') &&
    typeof value.retryable === 'boolean' &&
    typeof value.retry_count === 'number' &&
    typeof value.created_at === 'string' &&
    (value.finished_at === null || typeof value.finished_at === 'string') &&
    (value.error_code === null || typeof value.error_code === 'string') &&
    typeof value.revision === 'number'
  )
}

function isMemoryAudit(value: unknown): value is AdminMemoryAudit {
  return (
    isRecord(value) &&
    typeof value.audit_id === 'string' &&
    typeof value.operation === 'string' &&
    typeof value.operated_by_user_id === 'string' &&
    (value.role === 'admin' || value.role === 'manager' || value.role === 'member' || value.role === 'system') &&
    (value.memory_id === null || typeof value.memory_id === 'string') &&
    typeof value.project_id === 'string' &&
    typeof value.result === 'string' &&
    typeof value.event_id === 'string'
  )
}

function isMemoryJobList(value: unknown): value is AdminMemoryJobList {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isMemoryJob) && (value.next_cursor === null || typeof value.next_cursor === 'string')
}

function isMemoryAuditList(value: unknown): value is AdminMemoryAuditList {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isMemoryAudit) && (value.next_cursor === null || typeof value.next_cursor === 'string')
}

function parseMemoryMutation(value: unknown): AdminMemoryMutation | undefined {
  if (!isRecord(value)) return undefined
  const memory = value.memory === undefined ? undefined : isMemoryRecord(value.memory) ? value.memory : undefined
  if (value.memory !== undefined && memory === undefined) return undefined
  if (typeof value.event_id !== 'string' || typeof value.job_id !== 'string') return undefined
  if (value.status !== 'PENDING' && value.status !== 'INDEX_PENDING') return undefined
  if (value.accepted_count !== undefined && typeof value.accepted_count !== 'number') return undefined
  if (value.cleanup_status !== undefined && value.cleanup_status !== 'PENDING' && value.cleanup_status !== 'FAILED') return undefined
  return {
    ...(memory === undefined ? {} : { memory }),
    event_id: value.event_id,
    job_id: value.job_id,
    status: value.status,
    ...(value.accepted_count === undefined ? {} : { accepted_count: value.accepted_count }),
    ...(value.cleanup_status === undefined ? {} : { cleanup_status: value.cleanup_status }),
  }
}

function parseMemoryMutationResult(value: unknown): ApiResult<AdminMemoryMutation> {
  const mutation = parseMemoryMutation(value)
  return mutation === undefined
    ? { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆操作结果' } }
    : { ok: true, value: mutation }
}

function parseMemoryPolicyResult(value: unknown): ApiResult<AdminMemoryPolicy> {
  if (
    isRecord(value) &&
    value.scope_type === 'project' &&
    typeof value.scope_id === 'string' &&
    typeof value.revision === 'number' &&
    isRecord(value.values) &&
    typeof value.values.top_k === 'number' &&
    typeof value.values.relevance_threshold === 'number' &&
    typeof value.values.token_budget === 'number' &&
    (value.inherited_from === 'organization' || value.inherited_from === 'project')
  )
    return { ok: true, value: value as unknown as AdminMemoryPolicy }
  return { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆策略' } }
}

function parseMemoryJobResult(value: unknown): ApiResult<AdminMemoryJob> {
  return isMemoryJob(value)
    ? { ok: true, value }
    : { ok: false, error: { kind: 'service', code: 'INVALID_RESPONSE', message: '服务端未返回有效的记忆任务' } }
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

const TELEMETRY_KINDS: readonly string[] = [
  'session.started', 'session.finished', 'turn.started', 'turn.finished', 'step.started', 'step.finished',
  'llm.request', 'llm.response', 'tool.call', 'tool.result', 'approval.requested', 'approval.resolved',
  'compaction.completed', 'agent.error', 'delivery.gap',
]

const TELEMETRY_OUTCOMES: readonly string[] = ['success', 'error', 'interrupted', 'cancelled', 'blocked', 'max_tokens']

const TELEMETRY_GAP_REASONS: readonly string[] = ['overflow', 'expired', 'rejected', 'manual_clear', 'authorization_revoked']

const TELEMETRY_DECISIONS: readonly string[] = ['allowed_once', 'rejected', 'cancelled', 'unavailable']

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value >= 0
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || isCount(value)
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

/** Field-by-field guard so a malformed knowledge-base detail can never reach page state. */
function isKnownKnowledgeBase(value: unknown): value is AdminKnowledgeBase {
  if (!isRecord(value)) return false
  const types = ['document', 'faq', 'wiki']
  const states = ['active', 'unavailable', 'deleting']
  return (
    typeof value.knowledge_base_id === 'string' &&
    typeof value.organization_id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.type === 'string' &&
    types.includes(value.type) &&
    typeof value.state === 'string' &&
    states.includes(value.state) &&
    typeof value.searchable === 'boolean' &&
    typeof value.updated_at === 'string' &&
    isCount(value.revision) &&
    (value.document_count === undefined || isCount(value.document_count))
  )
}

function isTelemetryDelivery(value: unknown): value is TelemetryDelivery {
  return (
    isRecord(value) &&
    isCount(value.accepted) &&
    isCount(value.duplicate) &&
    isCount(value.retryable) &&
    isCount(value.rejected) &&
    isCount(value.queued) &&
    isCount(value.gaps)
  )
}

function isTelemetrySummary(value: unknown): value is TelemetrySummary {
  if (!isRecord(value)) return false
  if (!isTelemetryDelivery(value.delivery)) return false
  const sessions = value.sessions
  const turns = value.turns
  const steps = value.steps
  const llm = value.llm
  const tools = value.tools
  const approvals = value.approvals
  if (!isRecord(sessions)) return false
  if (![sessions.total, sessions.completed, sessions.errors, sessions.interrupted, sessions.cancelled].every(isCount)) return false
  if (!isRecord(turns)) return false
  if (![turns.total, turns.completed, turns.errors, turns.blocked, turns.max_tokens, turns.interrupted, turns.cancelled].every(isCount)) return false
  if (!isNullableCount(turns.p50_duration_ms) || !isNullableCount(turns.p95_duration_ms)) return false
  if (!isRecord(steps)) return false
  if (![steps.started, steps.finished].every(isCount)) return false
  if (!isNullableCount(steps.p50_duration_ms) || !isNullableCount(steps.p95_duration_ms)) return false
  if (!isRecord(llm)) return false
  if (
    ![llm.requests, llm.retries, llm.input_tokens, llm.output_tokens, llm.token_sample_size, llm.input_token_samples, llm.output_token_samples, llm.total_token_samples].every(
      isCount,
    )
  ) {
    return false
  }
  if (!isNullableCount(llm.total_tokens)) return false
  if (!isRecord(tools)) return false
  if (![tools.calls, tools.errors].every(isCount)) return false
  if (!isNullableCount(tools.p50_duration_ms) || !isNullableCount(tools.p95_duration_ms)) return false
  if (!isRecord(approvals)) return false
  if (![approvals.requested, approvals.allowed_once, approvals.rejected, approvals.cancelled, approvals.unavailable].every(isCount)) return false
  if (!isCount(value.compactions)) return false
  return isTelemetryDelivery(value.delivery)
}

function isTelemetryBucket(value: unknown): value is TelemetryBucket {
  return isRecord(value) && typeof value.bucket_start === 'string' && isTelemetrySummary(value)
}

function isTelemetryModelUsage(value: unknown): value is TelemetryModelUsage {
  return (
    isRecord(value) &&
    typeof value.provider === 'string' &&
    typeof value.model === 'string' &&
    isCount(value.requests) &&
    isCount(value.input_tokens) &&
    isCount(value.output_tokens) &&
    isNullableCount(value.total_tokens) &&
    isCount(value.input_token_samples) &&
    isCount(value.output_token_samples) &&
    isCount(value.total_token_samples)
  )
}

function isTelemetryToolUsage(value: unknown): value is TelemetryToolUsage {
  return (
    isRecord(value) &&
    typeof value.tool_name === 'string' &&
    isCount(value.calls) &&
    isCount(value.errors) &&
    isNullableCount(value.p50_duration_ms) &&
    isNullableCount(value.p95_duration_ms)
  )
}

function isTelemetryProjectSummary(value: unknown): value is TelemetryProjectSummary {
  return (
    isRecord(value) &&
    typeof value.project_id === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.has_data === 'boolean' &&
    isTelemetrySummary(value.summary) &&
    Array.isArray(value.models) &&
    value.models.every(isTelemetryModelUsage) &&
    Array.isArray(value.tools) &&
    value.tools.every(isTelemetryToolUsage) &&
    isTelemetryDelivery(value.delivery) &&
    isCount(value.retention_days)
  )
}

function isTelemetryEventItem(value: unknown): value is TelemetryEventItem {
  if (!isRecord(value)) return false
  for (const field of ['event_id', 'installation_id', 'project_id', 'kind', 'occurred_at', 'received_at', 'source_type'] as const) {
    if (typeof value[field] !== 'string') return false
  }
  if (!TELEMETRY_KINDS.includes(value.kind as string)) return false
  if (!isStringOrNull(value.session_id)) return false
  if (!isNullableCount(value.source_seq) || !isNullableCount(value.turn) || !isNullableCount(value.step)) return false
  if (!isNullableCount(value.duration_ms)) return false
  if (!isStringOrNull(value.outcome) || (typeof value.outcome === 'string' && !TELEMETRY_OUTCOMES.includes(value.outcome))) return false
  for (const field of ['provider', 'model', 'tool_category', 'compaction_id'] as const) {
    if (!isStringOrNull(value[field])) return false
  }
  for (const field of ['tool_name', 'call_id', 'approval_id'] as const) {
    if (!isStringOrNull(value[field])) return false
  }
  if (value.retryable !== null && typeof value.retryable !== 'boolean') return false
  if (!isNullableCount(value.retry_count)) return false
  if (value.token_usage !== null && value.token_usage !== undefined) {
    const usage = value.token_usage
    if (!isRecord(usage)) return false
    if (!isNullableCount(usage.input_tokens) || !isNullableCount(usage.output_tokens) || !isNullableCount(usage.total_tokens)) return false
  }
  if (value.error !== null && value.error !== undefined) {
    const detail = value.error
    if (!isRecord(detail) || typeof detail.name !== 'string' || !isStringOrNull(detail.code) || !isStringOrNull(detail.summary)) return false
  }
  if (value.approval !== null && value.approval !== undefined) {
    const detail = value.approval
    if (!isRecord(detail)) return false
    if (detail.decision !== null && detail.decision !== undefined && !TELEMETRY_DECISIONS.includes(detail.decision as string)) return false
  }
  if (value.compaction !== null && value.compaction !== undefined) {
    const detail = value.compaction
    if (!isRecord(detail) || !isStringOrNull(detail.kind)) return false
  }
  if (value.gap !== null && value.gap !== undefined) {
    const detail = value.gap
    if (!isRecord(detail)) return false
    if (typeof detail.reason !== 'string' || !TELEMETRY_GAP_REASONS.includes(detail.reason)) return false
    if (!isCount(detail.count)) return false
    if (!isStringOrNull(detail.first_event_id) || !isStringOrNull(detail.last_event_id)) return false
  }
  return true
}

function isTelemetryOverview(value: unknown): value is TelemetryOverview {
  return (
    isRecord(value) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.has_data === 'boolean' &&
    isTelemetrySummary(value.summary) &&
    Array.isArray(value.buckets) &&
    value.buckets.every(isTelemetryBucket) &&
    isCount(value.retention_days)
  )
}

function isTelemetryEventPage(value: unknown): value is TelemetryEventPage {
  return (
    isRecord(value) &&
    typeof value.project_id === 'string' &&
    Array.isArray(value.items) &&
    value.items.every(isTelemetryEventItem) &&
    (value.next_cursor === null || typeof value.next_cursor === 'string') &&
    typeof value.has_more === 'boolean' &&
    isCount(value.retention_days)
  )
}
