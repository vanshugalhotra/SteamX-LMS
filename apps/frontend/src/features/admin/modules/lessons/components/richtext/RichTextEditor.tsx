import { useEffect } from 'react';
import type { JSONContent } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { RICH_TEXT_EXTENSIONS } from './extensions';
import { RichTextToolbar } from './RichTextToolbar';

const CONTENT_CLASS =
  'min-h-32 px-4 py-4 text-sm leading-6 [&_.ProseMirror]:min-h-24 [&_.ProseMirror]:outline-none ' +
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-brand-line [&_blockquote]:pl-4 [&_blockquote]:text-gray-600 ' +
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 ' +
  '[&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-gray-100 [&_pre]:p-3 ' +
  '[&_a]:text-primary [&_a]:underline';

/** `initialValue` is only read on mount; the editor owns the document afterwards. */
export function RichTextEditor({
  initialValue,
  onChange,
  editable,
  label = 'Lesson text',
}: {
  initialValue: JSONContent;
  onChange: (doc: JSONContent) => void;
  editable: boolean;
  label?: string;
}) {
  const editor = useEditor({
    extensions: RICH_TEXT_EXTENSIONS,
    content: initialValue,
    editable,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON());
    },
  });

  useEffect(() => {
    editor.setEditable(editable, false);
  }, [editor, editable]);

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white">
      <RichTextToolbar editor={editor} disabled={!editable} />
      <EditorContent editor={editor} className={CONTENT_CLASS} />
    </div>
  );
}
