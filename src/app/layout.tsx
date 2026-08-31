import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI 开放平台 · 团队 Skill 管理',
  description: '平台托管团队 Skill 的审核与发布管理后台',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>
}
