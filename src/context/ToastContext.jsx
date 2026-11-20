import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Icon from '../components/Icon'

const ToastContext = createContext(null)

/**
 * Pop-up notifications ("Tenant saved.", "Payment added…").
 *   const { notify } = useToast()
 *   notify('Tenant saved.')                 // green
 *   notify('Could not save: …', 'error')    // red, stays a little longer
 * They live above the router, so a toast set just before navigating still shows.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const notify = useCallback((message, type = 'success') => {
    const id = ++nextId.current
    setToasts((list) => [...list.slice(-3), { id, message, type }])
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            <span className="toast-icon"><Icon name={t.type === 'error' ? 'alert' : 'check'} size={16} /></span>
            <span className="toast-msg">{t.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
