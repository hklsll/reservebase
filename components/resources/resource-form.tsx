'use client'

import { useActionState } from 'react'
import { type ResourceFormState } from '@/app/(protected)/resources/actions'
import { resourceConditions, resourceStatuses, type Resource } from '@/types/resource'

type ResourceFormProps = { resource?: Resource; action: (state: ResourceFormState, formData: FormData) => Promise<ResourceFormState>; submitLabel: string }

function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }

export function ResourceForm({ resource, action, submitLabel }: ResourceFormProps) {
  const [state, formAction, isPending] = useActionState(action, { error: null })
  return <form className="resource-form" action={formAction}><div className="form-grid"><label>Name<input name="name" required maxLength={160} defaultValue={resource?.name} /></label><label>Category<input name="category" required maxLength={80} defaultValue={resource?.category} /></label><label>Location<input name="location" required maxLength={120} defaultValue={resource?.location} /></label><label>Asset code<input name="assetCode" maxLength={80} defaultValue={resource?.assetCode ?? ''} /></label><label>Quantity<input name="quantity" type="number" min="1" required defaultValue={resource?.quantity ?? 1} /></label><label>Available quantity<input name="availableQuantity" type="number" min="0" required defaultValue={resource?.availableQuantity ?? 1} /></label><label>Status<select name="status" defaultValue={resource?.status ?? 'available'}>{resourceStatuses.filter(status => status !== 'retired').map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label><label>Condition<select name="condition" defaultValue={resource?.condition ?? 'unknown'}>{resourceConditions.map(condition => <option key={condition} value={condition}>{label(condition)}</option>)}</select></label><label className="form-span-2">Image URL<input name="imageUrl" type="url" maxLength={2048} placeholder="https://…" defaultValue={resource?.imageUrl ?? ''} /></label><label className="form-span-2">Description<textarea name="description" maxLength={4000} rows={4} defaultValue={resource?.description ?? ''} /></label><label className="form-span-2">Internal notes<textarea name="notes" maxLength={4000} rows={4} defaultValue={resource?.notes ?? ''} /></label></div>{state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="primary-button" disabled={isPending}>{isPending ? 'Saving…' : submitLabel}</button></form>
}
