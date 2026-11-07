import { useEffect } from 'react';
import { Bold, Heading2, Italic, List, type LucideIcon } from 'lucide-react';
import type { Editor, JSONContent } from '@tiptap/react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const TOOLS: {
  label: string;
  icon: LucideIcon;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}[] = [
  {
    label: 'Bold',
    icon: Bold,
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    icon: Italic,
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Heading 2',
    icon: Heading2,
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Bullet list',
    icon: List,
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
];

export function RichTextEditor({
  value,
  onChange,
  editable,
}: {
  value: JSONContent;
  onChange: (doc: JSONContent) => void;
  editable: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable,
    editorProps: { attributes: { 'aria-label': 'Lesson text' } },
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON());
    },
  });

  useEffect(() => {
    editor.setEditable(editable, false);
  }, [editor, editable]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => TOOLS.map((tool) => tool.isActive(e)),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-brand-line bg-white">
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap gap-1 border-b border-brand-line bg-brand-side/50 p-2"
      >
        {TOOLS.map(({ label, icon: Icon, run }, i) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-pressed={active[i]}
            disabled={!editable}
            className="grid size-8 place-items-center rounded-lg text-brand-navy outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-pressed:bg-white aria-pressed:shadow-sm"
            onClick={() => {
              run(editor);
            }}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="min-h-32 px-4 py-4 text-sm leading-6 [&_.ProseMirror]:min-h-24 [&_.ProseMirror]:outline-none [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}
