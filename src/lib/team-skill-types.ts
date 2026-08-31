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
