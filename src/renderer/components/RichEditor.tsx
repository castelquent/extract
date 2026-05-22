// WYSIWYG markdown editor for ExtrAct's content + sub-fields. Wraps
// @mdxeditor/editor with a markdown-native pipeline (no JSON round-trip).
//
// Stays uncontrolled internally: the editor takes the initial value and
// emits changes through `onChange`. External value changes flow in via a
// `key` prop applied at the call site (ArticleForm is keyed on the
// article's modifiedAt so transcribe / re-extract / save force a remount).
import {
  MDXEditor,
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
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'

interface RichEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function RichEditor({ value, onChange, className }: RichEditorProps) {
  return (
    <MDXEditor
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
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <BoldItalicUnderlineToggles />
              <BlockTypeSelect />
              <ListsToggle />
              <CreateLink />
              <InsertImage />
              <InsertTable />
              <InsertThematicBreak />
            </>
          ),
        }),
      ]}
    />
  )
}
