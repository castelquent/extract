// WYSIWYG markdown editor for ExtrAct's content + sub-fields. Wraps Crepe
// (the official Milkdown UX layer: slash commands, block handles, toolbar)
// and exposes a value/onChange API.
//
// Stays uncontrolled internally: the editor takes the initial value and
// emits changes through `onChange`. External value changes flow in via a
// `key` prop applied at the call site (ArticleForm is keyed on the
// article's modifiedAt so transcribe / re-extract / save force a remount).
import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

interface MilkdownEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function MilkdownEditor({ value, onChange, className }: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Snapshot the value at mount time; external value changes are handled by
  // remounting (key in parent) rather than reactively pushing into ProseMirror.
  const initialValueRef = useRef(value)

  useEffect(() => {
    if (!rootRef.current) return
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: initialValueRef.current,
    })
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown)
      })
    })
    crepe.create().catch((err) => {
      console.error('Crepe init failed:', err)
    })
    crepeRef.current = crepe
    return () => {
      crepe.destroy().catch(() => {
        // ignore destroy errors during unmount races
      })
      crepeRef.current = null
    }
  }, [])

  return <div ref={rootRef} className={className} style={{ width: '100%', minWidth: 0 }} />
}
