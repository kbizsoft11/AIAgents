const allowedTags = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U', 'UL'])

export function sanitizeRichText(value: string): string {
  const documentNode = new DOMParser().parseFromString(value, 'text/html')

  const cleanNode = (node: Node): void => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement
        if (!allowedTags.has(element.tagName)) {
          element.replaceWith(...Array.from(element.childNodes))
          return
        }

        if (element.tagName === 'FONT' && element.hasAttribute('color')) {
          const color = element.getAttribute('color') || ''
          element.removeAttribute('color')
          element.setAttribute('style', `color: ${color}`)
          element.replaceWith(...Array.from(element.childNodes).map(child => {
            const span = documentNode.createElement('span')
            span.setAttribute('style', `color: ${color}`)
            span.appendChild(child)
            return span
          }))
          return
        }

        Array.from(element.attributes).forEach(attribute => {
          const keepHref = element.tagName === 'A' && attribute.name === 'href' && /^(https?:|mailto:)/i.test(attribute.value)
          const keepStyle = attribute.name === 'style' && /^((text-align|color)\s*:\s*[-#(),.%\w\s]+;?\s*)+$/i.test(attribute.value)
          const keepSnippet = element.tagName === 'SPAN' && attribute.name === 'data-snippet-trigger' && /^[\-@][^<>"']+$/.test(attribute.value)
          const keepSnippetEditing = element.tagName === 'SPAN' && attribute.name === 'contenteditable' && attribute.value === 'false' && element.hasAttribute('data-snippet-trigger')
          const keepField = element.tagName === 'SPAN' && attribute.name === 'data-field-label' && /^[^<>"']+$/.test(attribute.value)
          const keepFieldDefault = element.tagName === 'SPAN' && attribute.name === 'data-field-default' && /^[^<>"']*$/.test(attribute.value)
          const keepFieldEditing = element.tagName === 'SPAN' && attribute.name === 'contenteditable' && attribute.value === 'false' && element.hasAttribute('data-field-label')
          const keepFieldType = element.tagName === 'SPAN' && attribute.name === 'data-field-type' && /^(paragraph|dropdown|radio)$/.test(attribute.value) && element.hasAttribute('data-field-label')
          const keepFieldOptions = element.tagName === 'SPAN' && attribute.name === 'data-field-options' && element.hasAttribute('data-field-label')
          if (!keepHref && !keepStyle && !keepSnippet && !keepSnippetEditing && !keepField && !keepFieldDefault && !keepFieldEditing && !keepFieldType && !keepFieldOptions) element.removeAttribute(attribute.name)
        })
      }
      cleanNode(child)
    })
  }

  cleanNode(documentNode.body)
  return documentNode.body.innerHTML.trim()
}

export function richTextToPlainText(value: string): string {
  const documentNode = new DOMParser().parseFromString(value, 'text/html')
  return (documentNode.body.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
}

export function hasRichText(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}