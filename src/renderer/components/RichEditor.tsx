// WYSIWYG markdown editor for ExtrAct's content + sub-fields. Wraps
// @mdxeditor/editor with a markdown-native pipeline (no JSON round-trip).
//
// Stays uncontrolled internally: the editor takes the initial value and
// emits changes through `onChange`. External value changes flow in via a
// `key` prop applied at the call site (ArticleForm is keyed on the
// article's modifiedAt so transcribe / re-extract / save force a remount).
import { forwardRef, useImperativeHandle, useRef } from 'react'
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  diffSourcePlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { ImageIcon } from 'lucide-react'

export interface RichEditorHandle {
  insertMarkdown: (md: string) => void
  // Prepend at the very top of the document. Falls back to `insertMarkdown`
  // if there's no current value (cursor is then placed wherever MDXEditor
  // defaults). Used by the image-capture flow because the user came from a
  // modal so the editor has no cursor position to insert at.
  prependMarkdown: (md: string) => void
}

interface RichEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  // Optional handler for the toolbar's image button. When set, the default
  // `<InsertImage />` (file picker + URL) is replaced by a custom button
  // that just calls the handler — used by ArticleForm to open the PDF
  // capture modal instead.
  onImageClick?: () => void
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor({ value, onChange, className, onImageClick }, ref) {
    const editorRef = useRef<MDXEditorMethods>(null)
    useImperativeHandle(ref, () => ({
      insertMarkdown: (md: string) => editorRef.current?.insertMarkdown(md),
      prependMarkdown: (md: string) => {
        const current = editorRef.current?.getMarkdown() ?? ''
        editorRef.current?.setMarkdown(md + current)
      },
    }))

    return (
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={onChange}
        contentEditableClassName="prose max-w-none min-h-[120px] focus:outline-none"
        className={className}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
          markdownShortcutPlugin(),
          // diffSourcePlugin enables the rich-text ↔ markdown source toggle.
          // Lets the user fix things the WYSIWYG can't edit (e.g. list
          // markers when the AI numbers a list wrong) by hopping to raw
          // markdown briefly. `viewMode: 'rich-text'` keeps the default UX.
          diffSourcePlugin({ viewMode: 'rich-text' }),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                {/* `options` restreint le toggle aux listes bullet/numbered;
                    on retire la checklist (case à cocher) qui n'a pas de
                    sens dans nos transcriptions. */}
                <ListsToggle options={['bullet', 'number']} />
                {onImageClick ? (
                  <button
                    type="button"
                    title="Capturer une image depuis le PDF"
                    onClick={onImageClick}
                    className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <InsertImage />
                )}
                <InsertTable />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    )
  }
)
