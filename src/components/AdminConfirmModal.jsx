import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Icon from './Icon'

/**
 * Two steps: (1) type the admin password, (2) confirm the action.
 * The password is checked on the server at step 1 (for quick feedback) and again,
 * by the database itself, when the action runs - so this pop-up can't be skipped.
 */
export default function AdminConfirmModal({ request, onClose }) {
  const { title, message, confirmLabel = 'Yes, continue', danger = false, run } = request
  const [step, setStep] = useState('password')   // 'password' | 'confirm'
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (step === 'password') inputRef.current?.focus() }, [step])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function checkPassword(e) {
    e.preventDefault()
    if (!password) { setError('Enter the admin password.'); return }
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('is_admin_password', { p_password: password })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    if (!data) { setError('Incorrect admin password.'); setPassword(''); return }
    setStep('confirm')
  }

  async function confirm() {
    setBusy(true); setError('')
    const result = await run(password)
    setBusy(false)
    if (result.ok) { onClose(true); return }
    setError(result.error || 'Something went wrong.')
    if (result.code === 'bad_password') { setPassword(''); setStep('password') }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(false) }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className={'modal-icon' + (danger ? ' danger' : '')}><Icon name={step === 'password' ? 'lock' : 'alert'} size={20} /></span>
          <div>
            <h3>{title}</h3>
            <div className="modal-step">Step {step === 'password' ? '1' : '2'} of 2 &middot; {step === 'password' ? 'Admin password' : 'Confirm'}</div>
          </div>
        </div>

        {step === 'password' ? (
          <form onSubmit={checkPassword} noValidate>
            <p className="modal-text">This action is protected. Enter the admin password to continue.</p>
            <div className="field">
              <label htmlFor="admin-pw">Admin password</label>
              <input id="admin-pw" ref={inputRef} type="password" value={password} autoComplete="off"
                     onChange={(e) => { setPassword(e.target.value); setError('') }} placeholder="••••••••" />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => onClose(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            </div>
          </form>
        ) : (
          <div>
            <p className="modal-text">{message}</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => onClose(false)} disabled={busy}>Cancel</button>
              <button type="button" className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={confirm} disabled={busy}>
                {busy ? 'Working…' : confirmLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
