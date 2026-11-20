import { useEffect, useRef, useState } from 'react'
import { displayToISO, isoToDisplay } from '../lib/constants'
import Icon from './Icon'

/** Turn whatever was typed/pasted into the dd/mm/yy mask. Also accepts a pasted dd/mm/yyyy. */
function mask(raw) {
  let s = (raw || '').trim()
  const long = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s)
  if (long) s = long[1].padStart(2, '0') + long[2].padStart(2, '0') + long[3].slice(2)
  const d = s.replace(/\D/g, '').slice(0, 6)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * Date field that is typed as dd/mm/yy.
 *   value    - ISO string (yyyy-mm-dd) or ''
 *   onChange - called with an ISO string, or '' while the text is incomplete/invalid
 * Slashes are inserted as you type; the calendar button opens a date picker as a shortcut.
 */
export default function DateInput({ value, onChange, id, placeholder = 'dd/mm/yy', required, disabled }) {
  const [text, setText] = useState(isoToDisplay(value))
  const [touched, setTouched] = useState(false)
  const pickerRef = useRef(null)

  // Follow outside changes to `value` (e.g. a record finished loading) without
  // clobbering half-typed text.
  useEffect(() => {
    if (displayToISO(text) !== (value || null)) setText(isoToDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(e) {
    const masked = mask(e.target.value)
    setText(masked)
    onChange(displayToISO(masked) || '')
  }

  function handlePicker(e) {
    const iso = e.target.value
    setText(isoToDisplay(iso))
    onChange(iso || '')
  }

  function openPicker() {
    const el = pickerRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.focus()
  }

  const invalid = text !== '' && !displayToISO(text) && (touched || text.length === 8)

  return (
    <div className={'date-input' + (invalid ? ' invalid' : '')}>
      <input
        type="text"
        id={id}
        value={text}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        required={required}
        disabled={disabled}
      />
      <button type="button" className="date-input-btn" onClick={openPicker} tabIndex={-1} disabled={disabled} title="Pick from calendar">
        <Icon name="calendar" size={16} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-input-native"
        value={value || ''}
        onChange={handlePicker}
        tabIndex={-1}
        aria-hidden="true"
      />
      {invalid && <div className="field-error">Use the format dd/mm/yy, e.g. 05/11/26.</div>}
    </div>
  )
}
