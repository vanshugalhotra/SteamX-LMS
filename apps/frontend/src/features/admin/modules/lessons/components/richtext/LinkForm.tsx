import { useId, useState, type SyntheticEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeLinkUrl } from './link';

export function LinkForm({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const id = useId();
  const errorId = `${id}-error`;
  const [url, setUrl] = useState(() => {
    const href: unknown = editor.getAttributes('link').href;
    return typeof href === 'string' ? href : '';
  });
  const [error, setError] = useState('');

  const cancel = () => {
    onClose();
    editor.commands.focus();
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const href = normalizeLinkUrl(url);
    if (!href) {
      setError('Enter a valid http, https or mailto link.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  };

  return (
    <form
      className="flex flex-wrap items-start gap-2 border-b border-brand-line p-2"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancel();
      }}
    >
      <div className="min-w-60 flex-1">
        <label htmlFor={id} className="sr-only">
          Link URL
        </label>
        <Input
          id={id}
          value={url}
          placeholder="https://example.com"
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="sm">
        Apply
      </Button>
      {editor.isActive('link') && (
        <Button type="button" size="sm" variant="secondary" onClick={remove}>
          Remove link
        </Button>
      )}
      <Button type="button" size="sm" variant="secondary" onClick={cancel}>
        Cancel
      </Button>
    </form>
  );
}
