import { useEffect, useState } from 'react'
import { Shortcut, ShortcutInput } from '../types/shortcut'
import RichTextEditor from './RichTextEditor'
import { richTextToPlainText } from '../utils/richText'

interface ShortcutFormProps {
  onSubmit: (data: ShortcutInput) => void
  onCancel?: () => void
  initialData?: ShortcutInput
  isEditing?: boolean
  availableShortcuts?: Shortcut[]
  currentShortcutId?: string | null
}

const emptyForm: ShortcutInput = { name: '', label: '', content: '' }
const shortcutDisplayName = (shortcut: Shortcut) => shortcut.label.trim() || shortcut.name
const dateFormatGroups = [
  { label: 'Date', formats: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD-MM-YYYY', 'MM.DD.YYYY', 'MMM D, YYYY', 'D MMM YYYY', 'dddd, MMMM D, YYYY'] },
  { label: 'Time', formats: ['HH:mm', 'HH:mm:ss', 'hh:mm a', 'hh:mm:ss a'] },
  { label: 'Date and time', formats: ['YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm', 'MMM D, YYYY hh:mm a', 'dddd, MMMM D, YYYY at hh:mm a'] },
]

function formatDatePreview(format: string): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const hour12 = now.getHours() % 12 || 12
  const values: Record<string, string> = { YYYY: String(now.getFullYear()), MMMM: months[now.getMonth()], MMM: months[now.getMonth()].slice(0, 3), MM: pad(now.getMonth() + 1), DD: pad(now.getDate()), D: String(now.getDate()), dddd: weekdays[now.getDay()], HH: pad(now.getHours()), hh: pad(hour12), mm: pad(now.getMinutes()), ss: pad(now.getSeconds()), a: now.getHours() >= 12 ? 'pm' : 'am' }
  return format.replace(/YYYY|MMMM|MMM|MM|DD|dddd|D|HH|hh|mm|ss|a/g, token => values[token])
}

export default function ShortcutForm({ onSubmit, onCancel, initialData, isEditing = false, availableShortcuts = [], currentShortcutId }: ShortcutFormProps) {
  const [formData, setFormData] = useState<ShortcutInput>(initialData || emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [insertRequest, setInsertRequest] = useState<{ token: string; id: number }>()
  const [insertHtmlRequest, setInsertHtmlRequest] = useState<{ html: string; id: number }>()
  const [showDateFormats, setShowDateFormats] = useState(false)
  const [selectedDateFormat, setSelectedDateFormat] = useState(dateFormatGroups[0].formats[0])
  const [showFormatOptions, setShowFormatOptions] = useState(false)
  const [showFormula, setShowFormula] = useState(false)
  const [formula, setFormula] = useState('')
  const [formulaError, setFormulaError] = useState('')
  const [showIfElse, setShowIfElse] = useState(false)
  const [condition, setCondition] = useState('')
  const [ifYes, setIfYes] = useState('')
  const [ifNo, setIfNo] = useState('')
  const [conditionError, setConditionError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importSearch, setImportSearch] = useState('')
  const [showTextField, setShowTextField] = useState(false)
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldDefault, setFieldDefault] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [showParagraphField, setShowParagraphField] = useState(false)
  const [showDropdownField, setShowDropdownField] = useState(false)
  const [dropdownName, setDropdownName] = useState('')
  const [dropdownOptions, setDropdownOptions] = useState('')
  const [dropdownError, setDropdownError] = useState('')
  const [showRadioField, setShowRadioField] = useState(false)
  const [radioName, setRadioName] = useState('')
  const [radioOptions, setRadioOptions] = useState('')
  const [radioError, setRadioError] = useState('')

  useEffect(() => {
    setFormData(initialData || emptyForm)
    setErrors({})
  }, [initialData])

  const handleChange = (field: keyof ShortcutInput, value: string) => {
    setFormData(previous => ({ ...previous, [field]: value }))
    if (errors[field]) setErrors(previous => ({ ...previous, [field]: '' }))
  }

  const insertToken = (token: string) => {
    setInsertRequest({ token, id: Date.now() })
    setShowDateFormats(false)
  }

  const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const importSnippet = (shortcut: Shortcut) => {
    setInsertHtmlRequest({ html: `<span class="dynamic-snippet" contenteditable="false" data-snippet-trigger="${escapeAttribute(shortcut.name)}">${escapeAttribute(shortcutDisplayName(shortcut))}</span>&nbsp;`, id: Date.now() })
    setShowImport(false)
    setImportSearch('')
  }

  const importableShortcuts = availableShortcuts.filter(shortcut => shortcut.id !== currentShortcutId && (!importSearch.trim() || `${shortcut.name} ${shortcut.label} ${richTextToPlainText(shortcut.content)}`.toLowerCase().includes(importSearch.toLowerCase())))

  const insertTextField = () => {
    const label = fieldLabel.trim()
    if (!label) {
      setFieldError('Enter a field label.')
      return
    }
    setInsertHtmlRequest({ html: `<span class="dynamic-field" contenteditable="false" data-field-label="${escapeAttribute(label)}" data-field-default="${escapeAttribute(fieldDefault)}">${escapeAttribute(label)}</span>&nbsp;`, id: Date.now() })
    setFieldLabel('')
    setFieldDefault('')
    setFieldError('')
    setShowTextField(false)
  }

  const insertParagraphField = () => {
    const label = fieldLabel.trim()
    if (!label) {
      setFieldError('Enter a field label.')
      return
    }
    setInsertHtmlRequest({ html: `<span class="dynamic-field" contenteditable="false" data-field-type="paragraph" data-field-label="${escapeAttribute(label)}" data-field-default="${escapeAttribute(fieldDefault)}">${escapeAttribute(label)}</span>&nbsp;`, id: Date.now() })
    setFieldLabel('')
    setFieldDefault('')
    setFieldError('')
    setShowParagraphField(false)
  }

  const insertDropdownField = () => {
    const options = dropdownOptions.split(/\r?\n/).map(option => option.trim()).filter(Boolean)
    if (!dropdownName.trim()) {
      setDropdownError('Enter a field name.')
      return
    }
    if (!options.length) {
      setDropdownError('Add at least one option.')
      return
    }
    const optionsValue = encodeURIComponent(JSON.stringify(options))
    setInsertHtmlRequest({ html: `<span class="dynamic-field" contenteditable="false" data-field-type="dropdown" data-field-label="${escapeAttribute(dropdownName.trim())}" data-field-options="${optionsValue}">${escapeAttribute(dropdownName.trim())}</span>&nbsp;`, id: Date.now() })
    setDropdownName('')
    setDropdownOptions('')
    setDropdownError('')
    setShowDropdownField(false)
  }

  const insertRadioField = () => {
    const options = radioOptions.split(/\r?\n/).map(option => option.trim()).filter(Boolean)
    if (!radioName.trim()) {
      setRadioError('Enter a field name.')
      return
    }
    if (!options.length) {
      setRadioError('Add at least one option.')
      return
    }
    const optionsValue = encodeURIComponent(JSON.stringify(options))
    setInsertHtmlRequest({ html: `<span class="dynamic-field" contenteditable="false" data-field-type="radio" data-field-label="${escapeAttribute(radioName.trim())}" data-field-options="${optionsValue}">${escapeAttribute(radioName.trim())}</span>&nbsp;`, id: Date.now() })
    setRadioName('')
    setRadioOptions('')
    setRadioError('')
    setShowRadioField(false)
  }

  const insertDateTime = () => insertToken(`{{datetime:${selectedDateFormat}}}`)

  const evaluateFormula = (value: string): number | null => {
    const expression = value.trim()
    if (!expression || !/^[0-9+*/().\s-]+$/.test(expression)) return null
    try {
      const result = Function(`"use strict"; return (${expression})`)()
      return typeof result === 'number' && Number.isFinite(result) ? result : null
    } catch {
      return null
    }
  }

  const insertFormula = () => {
    const result = evaluateFormula(formula)
    if (result === null) {
      setFormulaError('Enter a valid numeric expression, such as 7 * 8.')
      return
    }
    insertToken(`{{formula:${formula.trim()}}}`)
    setFormula('')
    setFormulaError('')
    setShowFormula(false)
  }

  const evaluateCondition = (value: string): boolean | null => {
    const expression = value.trim()
    if (!expression || !/^[0-9+*/().\s<>=!-]+$/.test(expression) || !/(<=|>=|==|!=|<|>)/.test(expression) || /(^|[^=!<>])=([^=]|$)/.test(expression)) return null
    try {
      const result = Function(`"use strict"; return (${expression})`)()
      return typeof result === 'boolean' ? result : null
    } catch {
      return null
    }
  }

  const insertIfElse = () => {
    if (evaluateCondition(condition) === null) {
      setConditionError('Enter a valid numeric condition, such as 100 > 5.')
      return
    }
    if (!ifYes.trim()) {
      setConditionError('Enter the text to use when the condition is true.')
      return
    }
    const encoded = [condition.trim(), ifYes, ifNo].map(encodeURIComponent).join('|')
    insertToken(`{{ifelse:${encoded}}}`)
    setCondition('')
    setIfYes('')
    setIfNo('')
    setConditionError('')
    setShowIfElse(false)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const trigger = formData.name.trim()
    if (!trigger) nextErrors.name = 'Shortcut trigger is required'
    // Triggers are intentionally unrestricted so users can choose their own convention.
    // if (!formData.label.trim()) nextErrors.label = 'Label is required'
    if (!richTextToPlainText(formData.content)) nextErrors.content = 'Content is required'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit({ ...formData, name: trigger })
  }

  return (
    <form className="shortcut-form" onSubmit={handleSubmit}>
      <div className="editor-topline">
        <button type="button" className="back-button" onClick={onCancel}>← Back</button>
        <div className="editor-actions">
          <button type="button" className="button button-light" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button button-primary">{isEditing ? 'Save' : 'Create shortcut'}</button>
        </div>
      </div>
      <div className="form-fields">
        <div className="shortcut-info" role="note"><strong>Shortcut tips</strong><span>Start shortcuts with special characters like <code>-</code>, <code>@</code>, or <code>/</code> to avoid conflicts with normal text.</span></div>
        <label>
          <span>Label <em>(optional)</em></span>
          <input value={formData.label} onChange={event => handleChange('label', event.target.value)} placeholder="e.g. Thank you message" />
          {errors.label && <small className="field-error">{errors.label}</small>}
        </label>
        <label>
          <span>Shortcut <em>(typed to insert)</em></span>
          <input className="trigger-input" value={formData.name} onChange={event => handleChange('name', event.target.value)} placeholder="-ty" />
          {errors.name && <small className="field-error">{errors.name}</small>}
        </label>
        <label className="content-field">
          <span>Expansion text</span>
          <RichTextEditor value={formData.content} onChange={value => handleChange('content', value)} insertRequest={insertRequest} insertHtmlRequest={insertHtmlRequest} placeholder="Text that will be inserted when the shortcut is typed..." />
          {errors.content && <small className="field-error">{errors.content}</small>}
        </label>
      </div>
      <aside className="dynamic-tools" aria-label="Dynamic shortcut fields">
        <h2>Dynamic values</h2>
        <p>Insert values that are filled in when the shortcut is used.</p>
        <button type="button" className="dynamic-tool" onClick={() => insertToken('{{clipboard}}')}>
          <span className="dynamic-tool-icon">▣</span><span><strong>Clipboard</strong><small>Insert your latest copied text</small></span>
        </button>
        <div className="dynamic-date-wrap">
          <button type="button" className="dynamic-tool" onClick={() => setShowDateFormats(previous => !previous)} aria-expanded={showDateFormats}>
            <span className="dynamic-tool-icon">◷</span><span><strong>Date / time</strong><small>Insert the current date or time</small></span>
          </button>
        </div>
        <button type="button" className="dynamic-tool" onClick={() => setShowTextField(true)}>
          <span className="dynamic-tool-icon">T</span><span><strong>Text field</strong><small>Ask for a value when used</small></span>
        </button>
        <button type="button" className="dynamic-tool" onClick={() => setShowParagraphField(true)}>
          <span className="dynamic-tool-icon">P</span><span><strong>Paragraph field</strong><small>Ask for multiline text</small></span>
        </button>
        <button type="button" className="dynamic-tool" onClick={() => setShowDropdownField(true)}>
          <span className="dynamic-tool-icon">▾</span><span><strong>Dropdown</strong><small>Choose from a list of values</small></span>
        </button>
        <button type="button" className="dynamic-tool" onClick={() => setShowRadioField(true)}>
          <span className="dynamic-tool-icon">◉</span><span><strong>Radio</strong><small>Choose one option</small></span>
        </button>
        <button type="button" className="dynamic-tool" onClick={() => setShowFormula(true)}>
          <span className="dynamic-tool-icon">Σ</span><span><strong>Formula</strong><small>Calculate a numeric expression</small></span>
        </button>
        <button type="button" className="dynamic-tool" onClick={() => setShowIfElse(true)}>
          <span className="dynamic-tool-icon">⇄</span><span><strong>If / Else condition</strong><small>Choose text from a condition</small></span>
        </button>
        <button type="button" className="dynamic-tool" onClick={() => setShowImport(true)}>
          <span className="dynamic-tool-icon">↗</span><span><strong>Import snippet</strong><small>Reuse another shortcut</small></span>
        </button>
      </aside>
      {showDateFormats && <div className="date-dialog-backdrop" onMouseDown={() => setShowDateFormats(false)}>
        <section className="date-dialog" role="dialog" aria-modal="true" aria-labelledby="date-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="date-dialog-title">Insert date or time</h2><p>Choose the format to insert into your shortcut.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowDateFormats(false)} aria-label="Close">×</button></div>
          <div className="date-select-label">Format
            <div className="format-picker">
              <button type="button" className="format-picker-trigger" onClick={() => setShowFormatOptions(previous => !previous)} aria-expanded={showFormatOptions}>{selectedDateFormat}<span>⌄</span></button>
              {showFormatOptions && <div className="format-picker-options">{dateFormatGroups.map(group => <div key={group.label}><strong>{group.label}</strong>{group.formats.map(format => <button type="button" className={format === selectedDateFormat ? 'format-option-selected' : ''} key={format} onClick={() => { setSelectedDateFormat(format); setShowFormatOptions(false) }}>{format}</button>)}</div>)}</div>}
            </div>
          </div>
          <div className="date-preview"><small>Preview</small><strong>{formatDatePreview(selectedDateFormat)}</strong></div>
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowDateFormats(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertDateTime}>Insert field</button></div>
        </section>
      </div>}
      {showFormula && <div className="date-dialog-backdrop" onMouseDown={() => setShowFormula(false)}>
        <section className="date-dialog formula-dialog" role="dialog" aria-modal="true" aria-labelledby="formula-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="formula-dialog-title">Insert formula</h2><p>Use numbers and basic arithmetic operators only.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowFormula(false)} aria-label="Close">×</button></div>
          <label className="date-select-label">Formula<input className="formula-input" autoFocus value={formula} onChange={event => { setFormula(event.target.value); setFormulaError('') }} onKeyDown={event => { if (event.key === 'Enter') insertFormula() }} placeholder="e.g. 7 * 8" /></label>
          {formulaError && <p className="formula-error" role="alert">{formulaError}</p>}
          <div className="formula-preview"><small>Preview</small><strong>{evaluateFormula(formula) ?? 'Enter a formula'}</strong></div>
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowFormula(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertFormula}>Insert</button></div>
        </section>
      </div>}
      {showIfElse && <div className="date-dialog-backdrop" onMouseDown={() => setShowIfElse(false)}>
        <section className="date-dialog ifelse-dialog" role="dialog" aria-modal="true" aria-labelledby="ifelse-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="ifelse-dialog-title">Insert dynamic if/else</h2><p>Compare numeric expressions and choose the matching text.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowIfElse(false)} aria-label="Close">×</button></div>
          <label className="date-select-label">Condition<input className="formula-input" autoFocus value={condition} onChange={event => { setCondition(event.target.value); setConditionError('') }} placeholder="e.g. 100 > 5" /></label>
          <label className="date-select-label ifelse-text-label">If yes<textarea className="ifelse-textarea" value={ifYes} onChange={event => { setIfYes(event.target.value); setConditionError('') }} placeholder="Text inserted when the condition is true" /></label>
          <label className="date-select-label ifelse-text-label">If no <em>(optional)</em><textarea className="ifelse-textarea" value={ifNo} onChange={event => { setIfNo(event.target.value); setConditionError('') }} placeholder="Text inserted when the condition is false" /></label>
          {conditionError && <p className="formula-error" role="alert">{conditionError}</p>}
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowIfElse(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertIfElse}>Insert</button></div>
        </section>
      </div>}
      {showImport && <div className="date-dialog-backdrop" onMouseDown={() => setShowImport(false)}>
        <section className="date-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="import-dialog-title">Import snippet</h2><p>Select an existing shortcut to insert its content here.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowImport(false)} aria-label="Close">×</button></div>
          <input className="import-search" autoFocus value={importSearch} onChange={event => setImportSearch(event.target.value)} placeholder="Search snippets..." />
          <div className="import-list">{importableShortcuts.map(shortcut => <button type="button" className="import-item" key={shortcut.id} onClick={() => importSnippet(shortcut)}><code>{shortcut.name}</code><span><strong>{shortcutDisplayName(shortcut)}</strong><small>{richTextToPlainText(shortcut.content)}</small></span></button>)}{!importableShortcuts.length && <p className="import-empty">No snippets found.</p>}</div>
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowImport(false)}>Cancel</button></div>
        </section>
      </div>}
      {showTextField && <div className="date-dialog-backdrop" onMouseDown={() => setShowTextField(false)}>
        <section className="date-dialog text-field-dialog" role="dialog" aria-modal="true" aria-labelledby="text-field-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="text-field-dialog-title">Insert text field</h2><p>Add a value that can be filled when the shortcut is used.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowTextField(false)} aria-label="Close">×</button></div>
          <label className="date-select-label">Name <em>(optional)</em><input className="formula-input" autoFocus value={fieldLabel} onChange={event => { setFieldLabel(event.target.value); setFieldError('') }} placeholder="e.g. Customer name" /></label>
          <label className="date-select-label ifelse-text-label">Default value <em>(optional)</em><input className="formula-input" value={fieldDefault} onChange={event => setFieldDefault(event.target.value)} placeholder="e.g. John" /></label>
          {fieldError && <p className="formula-error" role="alert">{fieldError}</p>}
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowTextField(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertTextField}>Insert field</button></div>
        </section>
      </div>}
      {showParagraphField && <div className="date-dialog-backdrop" onMouseDown={() => setShowParagraphField(false)}>
        <section className="date-dialog text-field-dialog" role="dialog" aria-modal="true" aria-labelledby="paragraph-field-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="paragraph-field-dialog-title">Insert paragraph field</h2><p>Add a multiline value that can be filled when the shortcut is used.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowParagraphField(false)} aria-label="Close">×</button></div>
          <label className="date-select-label">Name <em>(optional)</em><input className="formula-input" autoFocus value={fieldLabel} onChange={event => { setFieldLabel(event.target.value); setFieldError('') }} placeholder="e.g. Description" /></label>
          <label className="date-select-label ifelse-text-label">Default value <em>(optional)</em><textarea className="ifelse-textarea" value={fieldDefault} onChange={event => setFieldDefault(event.target.value)} placeholder="e.g. Add more details..." /></label>
          {fieldError && <p className="formula-error" role="alert">{fieldError}</p>}
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowParagraphField(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertParagraphField}>Insert field</button></div>
        </section>
      </div>}
      {showDropdownField && <div className="date-dialog-backdrop" onMouseDown={() => setShowDropdownField(false)}>
        <section className="date-dialog text-field-dialog" role="dialog" aria-modal="true" aria-labelledby="dropdown-field-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="dropdown-field-dialog-title">Insert dropdown</h2><p>Add a selectable value to your shortcut.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowDropdownField(false)} aria-label="Close">×</button></div>
          <label className="date-select-label">Name <em>(optional)</em><input className="formula-input" autoFocus value={dropdownName} onChange={event => { setDropdownName(event.target.value); setDropdownError('') }} placeholder="e.g. Department" /></label>
          <label className="date-select-label ifelse-text-label">Options <em>(one per line)</em><textarea className="ifelse-textarea" value={dropdownOptions} onChange={event => { setDropdownOptions(event.target.value); setDropdownError('') }} placeholder={'Sales\nMarketing\nSupport'} /></label>
          {dropdownError && <p className="formula-error" role="alert">{dropdownError}</p>}
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowDropdownField(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertDropdownField}>Insert dropdown</button></div>
        </section>
      </div>}
      {showRadioField && <div className="date-dialog-backdrop" onMouseDown={() => setShowRadioField(false)}>
        <section className="date-dialog text-field-dialog" role="dialog" aria-modal="true" aria-labelledby="radio-field-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="date-dialog-header"><div><h2 id="radio-field-dialog-title">Insert radio button</h2><p>Add one selectable value to your shortcut.</p></div><button type="button" className="date-dialog-close" onClick={() => setShowRadioField(false)} aria-label="Close">×</button></div>
          <label className="date-select-label">Name <em>(optional)</em><input className="formula-input" autoFocus value={radioName} onChange={event => { setRadioName(event.target.value); setRadioError('') }} placeholder="e.g. Priority" /></label>
          <label className="date-select-label ifelse-text-label">Options <em>(one per line)</em><textarea className="ifelse-textarea" value={radioOptions} onChange={event => { setRadioOptions(event.target.value); setRadioError('') }} placeholder={'High\nMedium\nLow'} /></label>
          {radioError && <p className="formula-error" role="alert">{radioError}</p>}
          <div className="date-dialog-actions"><button type="button" className="button button-light" onClick={() => setShowRadioField(false)}>Cancel</button><button type="button" className="button button-primary" onClick={insertRadioField}>Insert radio</button></div>
        </section>
      </div>}
    </form>
  )
}
