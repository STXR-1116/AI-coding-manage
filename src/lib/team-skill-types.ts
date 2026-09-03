export type SkillStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'withdrawn'

export interface TeamSkill {
  readonly skillId: string
  readonly displayName: string
  readonly summary: string
  readonly runtimeName: string
  readonly category: string
  readonly tags: readonly string[]
  readonly currentVersion?: string
  /** Most recent version, including an approved draft awaiting publication. */
  readonly latestVersion?: string
  /** Revision of the latest version, used with `If-Match` for governance writes. */
  readonly latestVersionRevision?: number
  /** Published versions available as rollback targets. */
  readonly publishedVersions?: readonly string[]
  readonly status: SkillStatus
  readonly visibility: 'organization' | 'group' | 'people'
  readonly groupId?: string
  readonly peopleIds?: readonly string[]
  readonly revision: number
  readonly authorName?: string
  readonly publishedAt?: string
}

export interface DirectoryUser {
  readonly userId: string
  readonly displayName: string
  readonly email: string
  readonly groups: readonly string[]
}

export interface SkillVersion {
  readonly skillId: string
  readonly version: string
  readonly status: SkillStatus
  readonly releaseNotes: string
  readonly artifactSha256?: string
  readonly artifactSizeBytes?: number
  readonly dependencies: readonly string[]
  readonly permissions: readonly string[]
  readonly validation: readonly { readonly name: string; readonly status: 'passed' | 'failed'; readonly detail?: string }[]
  readonly revision: number
  readonly publishedAt?: string
  readonly withdrawnReason?: string
}

export interface AuditLogEntry {
  readonly id: string
  readonly occurredAt: string
  readonly actorName: string
  readonly action: string
  readonly skillName: string
  readonly version: string
  readonly scope?: 'project' | 'global'
  readonly result: 'succeeded' | 'failed' | 'cancelled'
  readonly requestId: string
}

export interface ReviewItem {
  readonly skill: TeamSkill
  readonly version: SkillVersion
  readonly reviewChecks: readonly { readonly id: string; readonly label: string; readonly decision?: 'pass' | 'fail' | 'na' }[]
}

export type AccountRole = 'admin' | 'manager' | 'member'
export type AccountStatus = 'active' | 'suspended'

export interface AdminOrganization {
  readonly organization_id: string
  readonly name: string
  readonly status: 'active' | 'archived'
  readonly revision: number
}

export interface AdminUser {
  readonly user_id: string
  readonly username: string
  readonly email: string
  readonly display_name: string
  readonly status: AccountStatus
  readonly global_role: AccountRole
  readonly must_change_password: boolean
  readonly revision: number
  readonly memberships?: readonly {
    readonly organization_id: string
    readonly organization_name: string
    readonly status: AccountStatus
    readonly revision: number
  }[]
}

export interface AdminProject {
  readonly project_id: string
  readonly organization_id: string
  readonly organization_name?: string
  readonly name: string
  readonly description?: string
  readonly status: 'draft' | 'active' | 'archived'
  readonly created_by?: string
  readonly created_at?: string
  readonly updated_at?: string
  readonly member_count?: number
  readonly asset_count?: number
  readonly revision: number
}

export interface AdminProjectMember {
  readonly project_id: string
  readonly organization_id: string
  readonly user_id: string
  readonly display_name: string
  readonly status: 'active' | 'removed'
  readonly joined_at?: string
  readonly updated_at?: string
  readonly revision: number
}

export interface AdminProjectAsset {
  readonly project_id: string
  readonly asset_type: 'skill' | 'knowledge' | 'memory'
  readonly asset_id: string
  readonly name: string
  readonly relation_kind: 'reference' | 'context'
  readonly created_at?: string
  readonly updated_at?: string
  readonly revision: number
}

export interface RoleDefinition {
  readonly role: AccountRole
  readonly scope: string
  readonly description: string
}

export interface PermissionDefinition {
  readonly key: string
  readonly admin: boolean
  readonly manager: boolean | 'organization'
  readonly member: boolean
}

export interface AuthorizationAudit {
  readonly id: string
  readonly occurred_at: string
  readonly actor_user_id: string
  readonly actor_name: string
  readonly organization_id?: string
  readonly target_user_id?: string
  readonly project_id?: string
  readonly action: string
  readonly result: 'succeeded' | 'failed'
  readonly error_code?: string
  readonly request_id: string
}

export type AdminKnowledgeBaseType = 'document' | 'faq' | 'wiki'
export type AdminKnowledgeBaseState = 'active' | 'unavailable' | 'deleting'

export interface AdminKnowledgeBase {
  readonly knowledge_base_id: string
  readonly organization_id: string
  readonly name: string
  readonly description: string
  readonly type: AdminKnowledgeBaseType
  readonly state: AdminKnowledgeBaseState
  readonly searchable: boolean
  readonly updated_at: string
  readonly revision: number
  readonly document_count?: number
}

export interface AdminKnowledgeDocument {
  readonly document_id: string
  readonly title: string
  readonly source: string
  readonly status: 'pending' | 'processing' | 'completed' | 'failed'
  readonly snippet?: string
}

export interface AdminKnowledgeOperation {
  readonly operation_id: string
  readonly operation_type?: string
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  readonly document_id?: string
  readonly knowledge_base?: AdminKnowledgeBase
}

export interface AdminKnowledgeDeleteImpact {
  readonly knowledge_base_id: string
  readonly revision: number
  readonly affected_projects: readonly {
    readonly project_id: string
    readonly name: string
    readonly status: 'draft' | 'active' | 'archived'
  }[]
}

export interface AdminKnowledgeGraph {
  readonly nodes: readonly Record<string, unknown>[]
  readonly relations: readonly Record<string, unknown>[]
}

export interface AdminMemoryRecord {
  readonly memory_id: string
  readonly team_id: string
  readonly project_id: string
  readonly content: string
  readonly layer: 'L1'
  readonly captured_by_user_id: string
  readonly created_at: string
  readonly updated_at: string
  readonly revision: number
  readonly status: 'ACTIVE' | 'DELETED'
  readonly importance: number
  readonly recall_count: number
  readonly last_recalled_at: string | null
  readonly source_kind: 'agent_turn'
}

export interface AdminMemoryList {
  readonly items: readonly AdminMemoryRecord[]
  readonly next_cursor: string | null
  readonly total_estimate?: number
}

export interface AdminMemoryPolicy {
  readonly scope_type: 'project'
  readonly scope_id: string
  readonly revision: number
  readonly values: { readonly top_k: number; readonly relevance_threshold: number; readonly token_budget: number }
  readonly inherited_from: 'organization' | null
}

export interface AdminMemoryJob {
  readonly job_id: string
  readonly event_id: string
  readonly kind: 'CAPTURE' | 'INDEX_REFRESH' | 'DELETE_CLEANUP' | 'SCOPE_MOVED'
  readonly team_id: string
  readonly project_id: string
  readonly requested_by_user_id: string
  readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  readonly retryable: boolean
  readonly retry_count: number
  readonly created_at: string
  readonly finished_at: string | null
  readonly error_code: string | null
  readonly revision: number
}

export interface AdminMemoryAudit {
  readonly audit_id: string
  readonly operation: string
  readonly operated_by_user_id: string
  readonly role: AccountRole
  readonly memory_id: string | null
  readonly project_id: string
  readonly result: string
  readonly event_id: string
}
