import { Fragment, useRef, useState, type KeyboardEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { LinkForm } from './LinkForm';
import { TOOLBAR_ITEMS } from './toolbar-config';

const LAST = TOOLBAR_ITEMS.length - 1;

function nextIndex(key: string, current: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return current === LAST ? 0 : current + 1;
    case 'ArrowLeft':
      return current === 0 ? LAST : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return LAST;
    default:
      return null;
  }
}

export function RichTextToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabStop, setTabStop] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      TOOLBAR_ITEMS.map((item) => ({
        active: item.active ? e.isActive(...item.active) : false,
        enabled: item.can?.(e) ?? true,
      })),
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextIndex(event.key, tabStop);
    if (next === null) return;
    event.preventDefault();
    setTabStop(next);
    buttons.current[next]?.focus();
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-1 border-b border-brand-line bg-brand-side/50 p-2"
        onKeyDown={onKeyDown}
      >
        {TOOLBAR_ITEMS.map((item, i) => {
          const unavailable = disabled || !state[i].enabled;
          return (
            <Fragment key={item.label}>
              {i > 0 && TOOLBAR_ITEMS[i - 1].group !== item.group && (
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="mx-1 h-5 w-px bg-brand-line"
                />
              )}
              <button
                ref={(node) => {
                  buttons.current[i] = node;
                }}
                type="button"
                aria-label={item.label}
                title={item.label}
                aria-pressed={item.active ? state[i].active : undefined}
                aria-disabled={unavailable}
                tabIndex={i === tabStop ? 0 : -1}
                className="grid size-8 place-items-center rounded-lg text-brand-navy outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-pressed:bg-white aria-pressed:shadow-sm"
                onFocus={() => {
                  setTabStop(i);
                }}
                onMouseDown={(event) => {
                  event.preventDefault(); // keep the editor selection
                }}
                onClick={() => {
                  if (unavailable) return;
                  if (item.run === 'link') setLinkOpen(true);
                  else item.run(editor.chain().focus()).run();
                }}
              >
                <item.icon className="size-4" aria-hidden="true" />
              </button>
            </Fragment>
          );
        })}
      </div>
      {linkOpen && (
        <LinkForm
          editor={editor}
          onClose={() => {
            setLinkOpen(false);
          }}
        />
      )}
    </>
  );
}
