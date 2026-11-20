import { supabase } from '../supabaseClient'

/**
 * Make sure every billable tenant has a monthly charge row for every month up
 * to the current one. Idempotent - cheap to call on every billing page load.
 */
export async function ensureCharges() {
  const { error } = await supabase.rpc('ensure_monthly_charges')
  if (error) console.error('ensure_monthly_charges failed:', error.message)
}

export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
  if (error) console.error('Could not load settings:', error.message)
  return data
}

/* ------------------------------------------------------------------
 * Admin-protected actions. These call database functions that re-check the
 * admin password themselves; direct delete/edit on these tables is blocked.
 * Each returns { ok: true } or { ok: false, error, code }.
 * ------------------------------------------------------------------ */
const ADMIN_ERRORS = {
  bad_password: 'Incorrect admin password.',
  not_found: 'That record no longer exists.',
  invalid_amount: 'The amount must be more than zero and the date must be valid.',
}

async function callAdmin(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, error: error.message }
  if (data === 'ok') return { ok: true }
  return { ok: false, code: data, error: ADMIN_ERRORS[data] || 'Something went wrong.' }
}

export const adminDeleteTenant = (id, password) =>
  callAdmin('admin_delete_tenant', { p_tenant_id: Number(id), p_password: password })

export const adminDeletePayment = (id, password) =>
  callAdmin('admin_delete_payment', { p_payment_id: Number(id), p_password: password })

export const adminUpdatePayment = (id, { amount, payment_date, method, notes }, password) =>
  callAdmin('admin_update_payment', {
    p_payment_id: Number(id),
    p_amount: Number(amount),
    p_payment_date: payment_date,
    p_method: method,
    p_notes: notes || null,
    p_password: password,
  })
