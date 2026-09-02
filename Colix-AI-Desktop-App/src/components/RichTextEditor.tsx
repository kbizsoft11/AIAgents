import { useEffect, useRef, useState } from 'react'
import { hasRichText, sanitizeRichText } from '../utils/richText'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  insertRequest?: { token: string; id: number }
  insertHtmlRequest?: { html: string; id: number }
}

type Command = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight'

const commands: Command[] = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight']

export default function RichTextEditor({ value, onChange, placeholder, insertRequest, insertHtmlRequest }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<Range | null>(null)
  const [activeCommands, setActiveCommands] = useState<Set<Command>>(new Set())

  const saveSelection = () => {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return
    selectionRef.current = selection.getRangeAt(0).cloneRange()
  }

  const restoreSelection = () => {
    const selection = window.getSelection()
    if (!selection || !selectionRef.current) return
    selection.removeAllRanges()
    selection.addRange(selectionRef.current)
  }

  const updateActiveCommands = () => {
    if (!editorRef.current) return
    const selection = window.getSelection()
    if (!selection || !editorRef.current.contains(selection.anchorNode)) return
    setActiveCommands(new Set(commands.filter(command => document.queryCommandState(command))))
    saveSelection()
  }

  const handleEditorChange = () => {
    onChange(sanitizeRichText(editorRef.current?.innerHTML || ''))
    updateActiveCommands()
  }

  const removeAdjacentSnippet = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    const selection = window.getSelection()
    if (!selection || !selection.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) return

    const node = selection.anchorNode
    const offset = selection.anchorOffset
    const textNode = node?.nodeType === Node.TEXT_NODE ? node as Text : null
    const adjacentNode = textNode && ((event.key === 'Backspace' && offset === 0) || (event.key === 'Delete' && offset === textNode.data.length)) ? textNode : node
    const sibling = adjacentNode?.previousSibling || (adjacentNode?.parentNode && 'childNodes' in adjacentNode.parentNode ? adjacentNode.parentNode.childNodes[offset - 1] : null)
    const snippet = sibling instanceof HTMLElement && sibling.hasAttribute('data-snippet-trigger') ? sibling : textNode?.data.charAt(event.key === 'Backspace' ? offset - 1 : offset) === '\u00a0' && textNode.previousSibling instanceof HTMLElement ? textNode.previousSibling : null
    if (!snippet) return

    event.preventDefault()
    const nextNode = snippet.nextSibling
    snippet.remove()
    if (nextNode?.nodeType === Node.TEXT_NODE && nextNode.textContent?.startsWith('\u00a0')) nextNode.textContent = nextNode.textContent.slice(1)
    handleEditorChange()
  }

  useEffect(() => {
    if (!editorRef.current) return
    const nextHtml = hasRichText(value) ? sanitizeRichText(value) : value ? `<p>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>` : ''
    if (editorRef.current.innerHTML !== nextHtml) editorRef.current.innerHTML = nextHtml
  }, [value])

  useEffect(() => {
    if (!insertRequest || !editorRef.current) return
    restoreSelection()
    editorRef.current.focus()
    document.execCommand('insertText', false, insertRequest.token)
    handleEditorChange()
  }, [insertRequest?.id])

  useEffect(() => {
    if (!insertHtmlRequest || !editorRef.current) return
    restoreSelection()
    editorRef.current.focus()
    document.execCommand('insertHTML', false, insertHtmlRequest.html)
    handleEditorChange()
  }, [insertHtmlRequest?.id])

  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveCommands)
    return () => document.removeEventListener('selectionchange', updateActiveCommands)
  }, [])

  const runCommand = (command: Command, commandValue?: string) => {
    restoreSelection()
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    handleEditorChange()
    updateActiveCommands()
  }

  const isActive = (command: Command) => activeCommands.has(command)

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" className={isActive('bold') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('bold')} aria-label="Bold" aria-pressed={isActive('bold')} title="Bold"><strong>B</strong></button>
        <button type="button" className={isActive('italic') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('italic')} aria-label="Italic" aria-pressed={isActive('italic')} title="Italic"><em>I</em></button>
        <button type="button" className={isActive('underline') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('underline')} aria-label="Underline" aria-pressed={isActive('underline')} title="Underline"><u>U</u></button>
        <span className="toolbar-divider" />
        <button type="button" className={isActive('insertUnorderedList') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('insertUnorderedList')} aria-label="Bulleted list" aria-pressed={isActive('insertUnorderedList')} title="Bulleted list">&#8226; List</button>
        <button type="button" className={isActive('insertOrderedList') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('insertOrderedList')} aria-label="Numbered list" aria-pressed={isActive('insertOrderedList')} title="Numbered list">1. List</button>
        <span className="toolbar-divider" />
        <div className="alignment-group" role="group" aria-label="Text alignment">
          <button type="button" className={isActive('justifyLeft') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('justifyLeft')} aria-label="Align left" aria-pressed={isActive('justifyLeft')} title="Align left"><span className="align-icon align-left"><i /><i /><i /></span></button>
          <button type="button" className={isActive('justifyCenter') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('justifyCenter')} aria-label="Align center" aria-pressed={isActive('justifyCenter')} title="Align center"><span className="align-icon align-center"><i /><i /><i /></span></button>
          <button type="button" className={isActive('justifyRight') ? 'toolbar-active' : ''} onMouseDown={event => { saveSelection(); event.preventDefault() }} onClick={() => runCommand('justifyRight')} aria-label="Align right" aria-pressed={isActive('justifyRight')} title="Align right"><span className="align-icon align-right"><i /><i /><i /></span></button>
        </div>
      </div>
      <div ref={editorRef} className="rich-content" contentEditable role="textbox" aria-multiline="true" data-placeholder={placeholder} onInput={handleEditorChange} onKeyDown={removeAdjacentSnippet} onMouseUp={updateActiveCommands} onKeyUp={updateActiveCommands} onBlur={saveSelection} />
    </div>
  )
}