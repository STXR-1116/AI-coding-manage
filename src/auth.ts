import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { refreshServiceSession } from './auth-session.ts'

type AccountRole = 'admin' | 'manager' | 'member'

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
    role: AccountRole
    mustChangePassword: boolean
  }

  interface User {
    role: AccountRole
    mustChangePassword: boolean
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    role?: AccountRole
    mustChangePassword?: boolean
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
  }
}

export const serviceBaseUrl = (): string | undefined => {
  const value = process.env.TEAM_SKILL_SERVICE_URL?.trim()
  if (value === undefined || value.length === 0) return undefined
  return value.replace(/\/$/u, '')
}

export const authSecret = process.env.AUTH_SECRET?.trim() || 'local-team-skill-admin-auth-secret'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [Credentials({
    name: '账号密码',
    credentials: {
      username: { label: '用户名', type: 'text' },
      password: { label: '密码', type: 'password' },
    },
    async authorize(credentials) {
      const baseUrl = serviceBaseUrl()
      const username = typeof credentials?.username === 'string' ? credentials.username.trim() : ''
      const password = typeof credentials?.password === 'string' ? credentials.password : ''
      if (baseUrl === undefined || username.length === 0 || password.length === 0) return null
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) return null
      const value: unknown = await response.json()
      if (!isRecord(value) || !isRecord(value.user)) return null
      const user = value.user
      const role = isRecord(user) && isRole(user.global_role) ? user.global_role : undefined
      const accessToken = typeof value.access_token === 'string' ? value.access_token : undefined
      const refreshToken = typeof value.refresh_token === 'string' ? value.refresh_token : undefined
      const expiresIn = typeof value.expires_in === 'number' ? value.expires_in : undefined
      if (accessToken === undefined || refreshToken === undefined || expiresIn === undefined || role === undefined) return null
      return {
        id: stringValue(user.user_id),
        name: stringValue(user.display_name),
        email: stringValue(user.email),
        role,
        mustChangePassword: user.must_change_password === true,
        accessToken,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
      }
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user !== undefined) {
        const value = user as AuthUser
        token.userId = value.id
        token.name = value.name
        token.email = value.email
        token.role = value.role
        token.mustChangePassword = value.mustChangePassword
        token.accessToken = value.accessToken
        token.refreshToken = value.refreshToken
        token.expiresAt = value.expiresAt
        return token
      }
      if (typeof token.expiresAt === 'number' && token.expiresAt > Date.now() + 30_000) return token
      if (typeof token.refreshToken !== 'string') return token
      const baseUrl = serviceBaseUrl()
      if (baseUrl === undefined) return token
      const refreshed = await refreshServiceSession(baseUrl, token.refreshToken)
      if (refreshed === undefined) return {}
      return { ...token, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt, mustChangePassword: refreshed.mustChangePassword, role: refreshed.role }
    },
    async session({ session, token }) {
      if (session.user !== undefined) {
        session.user.id = typeof token.userId === 'string' ? token.userId : token.sub ?? ''
        session.user.name = typeof token.name === 'string' ? token.name : null
        if (typeof token.email === 'string') session.user.email = token.email
      }
      session.role = isRole(token.role) ? token.role : 'member'
      session.mustChangePassword = token.mustChangePassword === true
      return session
    },
  },
})

export interface AdminSession {
  user: { id: string; name: string | null; email: string | null }
  role: AccountRole
  mustChangePassword: boolean
}

interface AuthUser { readonly id: string; readonly name: string; readonly email: string; readonly role: AccountRole; readonly mustChangePassword: boolean; readonly accessToken: string; readonly refreshToken: string; readonly expiresAt: number }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : '' }
function isRole(value: unknown): value is AccountRole { return value === 'admin' || value === 'manager' || value === 'member' }
