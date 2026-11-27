import { useEffect, useState } from 'react'

/**
 * Client-side paging. Rows should already be sorted (newest first), so page 1
 * is always the latest records.
 *   const { pageRows, ...pager } = usePaged(rows, 10, filterValue)
 *   <Pagination {...pager} />
 * The optional 3rd argument sends the table back to page 1 when it changes
 * (a filter or search, for example).
 */
export function usePaged(rows, pageSize = 10, resetKey = '') {
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [resetKey])
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages)
  return {
    pageRows: rows.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pages,
    total,
    pageSize,
    onPage: setPage,
  }
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pages - 1, page + 1)
  if (from > 2) out.push('…')
  for (let i = from; i <= to; i++) out.push(i)
  if (to < pages - 1) out.push('…')
  out.push(pages)
  return out
}

export default function Pagination({ page, pages, total, pageSize, onPage }) {
  if (!total) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="pager">
      <div className="pager-info">Showing {first}–{last} of {total}</div>
      {pages > 1 && (
        <div className="pager-controls">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
          {pageList(page, pages).map((p, i) => p === '…'
            ? <span key={`gap${i}`} className="pager-gap">…</span>
            : <button key={p} type="button" className={p === page ? 'active' : ''} onClick={() => onPage(p)}>{p}</button>)}
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
        </div>
      )}
    </div>
  )
}
