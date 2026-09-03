import { randomUUID } from 'node:crypto'

export type AccountRole = 'admin' | 'manager' | 'member'

export interface RefreshedAccountSession {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly mustChangePassword: boolean
  readonly role: AccountRole
}

/** Refresh an account session without accepting incomplete or stale token data. */
export async function refreshServiceSession(
  baseUrl: string,
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<RefreshedAccountSession | undefined> {
  let response: Response
  try {
    response = await fetcher(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    return undefined
  }
  if (!response.ok) return undefined
  let value: unknown
  try {
    value = await response.json()
  } catch {
    return undefined
  }
  if (!isRecord(value)) return undefined
  const accessToken = typeof value.access_token === 'string' && value.access_token.length > 0 ? value.access_token : undefined
  const nextRefreshToken = typeof value.refresh_token === 'string' && value.refresh_token.length > 0 ? value.refresh_token : undefined
  const expiresIn =
    typeof value.expires_in === 'number' && Number.isFinite(value.expires_in) && value.expires_in > 0 ? value.expires_in : undefined
  const mustChangePassword = typeof value.must_change_password === 'boolean' ? value.must_change_password : undefined
  const user = isRecord(value.user) ? value.user : undefined
  const role = user === undefined || !isRole(user.global_role) ? undefined : user.global_role
  if (
    accessToken === undefined ||
    nextRefreshToken === undefined ||
    expiresIn === undefined ||
    mustChangePassword === undefined ||
    role === undefined
  )
    return undefined
  return { accessToken, refreshToken: nextRefreshToken, expiresAt: Date.now() + expiresIn * 1000, mustChangePassword, role }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isRole(value: unknown): value is AccountRole {
  return value === 'admin' || value === 'manager' || value === 'member'
}
