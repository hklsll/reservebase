'use client'

import { useActionState } from 'react'
import { checkOutReservationAction, returnReservationAction, type CustodyFormState } from '@/app/(protected)/reservations/actions'
import { resourceConditions } from '@/types/resource'

const initialState: CustodyFormState = { error: null }

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function CheckOutForm({ reservationId }: { reservationId: string }) {
  const [state, action, isPending] = useActionState(checkOutReservationAction.bind(null, reservationId), initialState)
  return <form className="resource-form custody-form" action={action}><div className="form-grid"><label>Received by<input name="receivedBy" required maxLength={160} placeholder="Name of the person receiving it" /></label><label>Condition at check-out<select name="conditionOut" required defaultValue=""><option value="" disabled>Select condition</option>{resourceConditions.map(condition => <option key={condition} value={condition}>{label(condition)}</option>)}</select></label><label className="form-span-2">Check-out notes <span className="field-optional">(optional)</span><textarea name="checkoutNotes" maxLength={4000} rows={3} placeholder="Accessories, damage, or handover details." /></label></div>{state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="primary-button" disabled={isPending}>{isPending ? 'Recording…' : 'Confirm check-out'}</button></form>
}

export function ReturnForm({ reservationId }: { reservationId: string }) {
  const [state, action, isPending] = useActionState(returnReservationAction.bind(null, reservationId), initialState)
  return <form className="resource-form custody-form" action={action}><div className="form-grid"><label>Condition at return<select name="conditionIn" required defaultValue=""><option value="" disabled>Select condition</option>{resourceConditions.map(condition => <option key={condition} value={condition}>{label(condition)}</option>)}</select></label><label className="form-span-2">Return notes <span className="field-optional">(optional)</span><textarea name="returnNotes" maxLength={4000} rows={3} placeholder="Damage, missing items, or inspection notes." /></label></div>{state.error && <p className="form-error" role="alert">{state.error}</p>}<button className="primary-button" disabled={isPending}>{isPending ? 'Recording…' : 'Confirm return'}</button></form>
}
