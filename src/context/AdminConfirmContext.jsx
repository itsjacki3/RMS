import { createContext, useCallback, useContext, useState } from 'react'
import AdminConfirmModal from '../components/AdminConfirmModal'

const AdminConfirmContext = createContext(null)

/**
 * const { confirmAsAdmin } = useAdminConfirm()
 * const done = await confirmAsAdmin({
 *   title, message, confirmLabel, danger,
 *   run: (password) => adminDeletePayment(id, password),   // -> { ok, error?, code? }
 * })
 * `done` is true only if the password was right, the user confirmed AND run() succeeded.
 */
export function AdminConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)

  const confirmAsAdmin = useCallback(
    (options) => new Promise((resolve) => setRequest({ ...options, resolve })),
    []
  )

  const close = useCallback((result) => {
    setRequest((current) => { current?.resolve(result); return null })
  }, [])

  return (
    <AdminConfirmContext.Provider value={{ confirmAsAdmin }}>
      {children}
      {request && <AdminConfirmModal request={request} onClose={close} />}
    </AdminConfirmContext.Provider>
  )
}

export function useAdminConfirm() {
  const ctx = useContext(AdminConfirmContext)
  if (!ctx) throw new Error('useAdminConfirm must be used within an AdminConfirmProvider')
  return ctx
}
