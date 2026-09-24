import type { ReactNode } from 'react'

type DataStateProps = { title: string; description: string; action?: ReactNode }

export function EmptyState({ title, description, action }: DataStateProps) {
  return <div className="data-state" role="status"><strong>{title}</strong><p>{description}</p>{action}</div>
}

export function LoadingState({ title = 'Loading workspace' }: { title?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><span>{title}…</span></div>
}

export function ErrorState({ title, description, action }: DataStateProps) {
  return <div className="data-state error-state" role="alert"><strong>{title}</strong><p>{description}</p>{action}</div>
}
