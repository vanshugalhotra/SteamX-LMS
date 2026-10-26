// The rest of the module is editor-agnostic; switching editors means adding another format here.
export const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
]);

export const INLINE_NODES = new Set(['text', 'hardBreak']);

export const ALLOWED_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);

export const TEXT_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

export const DROPPED_LINK_ATTRIBUTES = new Set(['target', 'rel', 'class']);
