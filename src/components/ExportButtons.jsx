import { useState } from 'react'
import Icon from './Icon'
import { useToast } from '../context/ToastContext'
import { downloadPDF, printDocument } from '../lib/exporter'

/**
 * <ExportButtons getDoc={() => ({ title, sections: [...] })} filename="rent-payments" />
 * getDoc may be async. It is called only when a button is clicked, so it can fetch
 * and build the document from ALL records (not just the page on screen).
 */
export default function ExportButtons({ getDoc, filename, disabled = false }) {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)

  async function handlePrint() {
    setBusy(true)
    try { printDocument(await getDoc()) }
    catch (err) { notify('Could not open print view: ' + err.message, 'error') }
    finally { setBusy(false) }
  }

  async function handlePDF() {
    setBusy(true)
    try { await downloadPDF(await getDoc(), filename) }
    catch (err) { notify('Could not create the PDF: ' + err.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="export-btns">
      <button type="button" className="btn btn-outline btn-sm" onClick={handlePrint} disabled={disabled || busy}>
        <Icon name="print" size={15} /> Print
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={handlePDF} disabled={disabled || busy}>
        <Icon name="download" size={15} /> {busy ? 'Preparing…' : 'PDF'}
      </button>
    </div>
  )
}
