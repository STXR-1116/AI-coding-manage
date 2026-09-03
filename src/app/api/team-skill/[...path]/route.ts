import { getToken } from 'next-auth/jwt'
import { authSecret, serviceBaseUrl } from '../../../../auth.ts'
import type { NextRequest } from 'next/server'

type RouteContext = { readonly params: Promise<{ readonly path: readonly string[] }> }

export const runtime = 'nodejs'

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context)
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context)
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context)
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context)
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context)
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const baseUrl = serviceBaseUrl()
  if (baseUrl === undefined) return Response.json({ code: 'SERVICE_UNAVAILABLE', message: 'Skill 服务尚未配置' }, { status: 503 })
  const token = await getToken({ req: request, secret: authSecret })
  const accessToken = token !== null && typeof token.accessToken === 'string' ? token.accessToken : undefined
  if (accessToken === undefined) return Response.json({ code: 'AUTH_REQUIRED', message: '需要有效的后台 Session' }, { status: 401 })
  const { path } = await context.params
  const useV3MemoryRoute = path[0] === 'v3' && path[1] === 'project-memory'
  const upstreamBase = useV3MemoryRoute ? baseUrl.replace(/\/v1\/?$/u, '/v3') : baseUrl
  const upstreamPath = useV3MemoryRoute ? path.slice(1) : path
  const suffix = upstreamPath.map(segment => encodeURIComponent(segment)).join('/')
  const target = `${upstreamBase}/${suffix}${request.nextUrl.search}`
  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.delete('host')
  headers.set('Authorization', `Bearer ${accessToken}`)
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
  const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual', cache: 'no-store' })
  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('set-cookie')
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
}
