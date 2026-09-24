'use client'

import { ErrorState } from '@/components/shared/data-state'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-state"><ErrorState title="We couldn’t load the workspace" description="Please try again. If the problem continues, contact your workspace administrator." action={<button className="primary-button" onClick={reset}>Try again</button>} /></main>
}
