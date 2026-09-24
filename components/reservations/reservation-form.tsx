'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { checkReservationAvailabilityAction, createReservationAction, type AvailabilityState, type ReservationFormState } from '@/app/(protected)/reservations/actions'

type ReservableResource = { id: string; name: string; category: string; location: string; availableQuantity: number }

const initialAvailabilityState: AvailabilityState = { error: null, availableQuantity: null }
const initialReservationState: ReservationFormState = { error: null }

function toIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function ReservationForm({ resources }: { resources: ReservableResource[] }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [resourceId, setResourceId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [purpose, setPurpose] = useState('')
  const [availability, availabilityAction, isChecking] = useActionState(checkReservationAvailabilityAction, initialAvailabilityState)
  const [submission, submitAction, isSubmitting] = useActionState(createReservationAction, initialReservationState)
  const selectedResource = useMemo(() => resources.find(resource => resource.id === resourceId), [resourceId, resources])
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (availability.availableQuantity !== null && !availability.error) setStep(2)
  }, [availability])

  return <form className="reservation-form" action={submitAction}>
    <ol className="reservation-steps" aria-label="Reservation progress"><li className={step === 1 ? 'current' : 'complete'}><span>1</span>Details</li><li className={step === 2 ? 'current' : ''}><span>2</span>Review</li><li><span>3</span>Confirmed</li></ol>
    <input type="hidden" name="startsAt" value={toIso(startsAt)} readOnly />
    <input type="hidden" name="endsAt" value={toIso(endsAt)} readOnly />
    {step === 1 ? <div className="form-grid"><label className="form-span-2">Resource<select name="resourceId" required value={resourceId} onChange={event => setResourceId(event.target.value)}><option value="">Choose a resource</option>{resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name} · {resource.location} ({resource.availableQuantity} available)</option>)}</select></label><label>Start date and time<input required type="datetime-local" min={`${today}T00:00`} value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label><label>End date and time<input required type="datetime-local" min={startsAt || `${today}T00:00`} value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label><label>Quantity<input name="quantity" required type="number" min="1" max={selectedResource?.availableQuantity ?? 1} value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label>Purpose<input name="purpose" required maxLength={500} value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="What will this be used for?" /></label><label className="form-span-2">Notes <span className="field-optional">(optional)</span><textarea name="notes" maxLength={4000} rows={4} placeholder="Add pickup, setup, or other details." /></label></div> : <section className="reservation-review"><h2>Review your reservation</h2><dl><div><dt>Resource</dt><dd>{selectedResource?.name}</dd></div><div><dt>When</dt><dd>{startsAt.replace('T', ' ')} – {endsAt.replace('T', ' ')}</dd></div><div><dt>Quantity</dt><dd>{quantity}</dd></div><div><dt>Purpose</dt><dd>{purpose}</dd></div><div><dt>Availability</dt><dd>{availability.availableQuantity} unit{availability.availableQuantity === 1 ? '' : 's'} available for this time</dd></div></dl><p className="detail-muted">Submitting creates a pending reservation. Availability is checked again when it is saved.</p></section>}
    {(availability.error || submission.error) && <p className="form-error" role="alert">{availability.error ?? submission.error}</p>}
    <div className="reservation-form-actions">{step === 2 && <button className="outline-button" type="button" onClick={() => setStep(1)}>Back</button>}{step === 1 ? <button className="primary-button" formAction={availabilityAction} disabled={isChecking || resources.length === 0}>{isChecking ? 'Checking…' : 'Check availability'}</button> : <button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Submitting…' : 'Submit reservation'}</button>}</div>
  </form>
}
