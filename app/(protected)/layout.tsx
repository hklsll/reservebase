import { requireMembership } from '@/lib/auth/require-membership'

export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireMembership()
  return children
}
