import StarterKit from '@tiptap/starter-kit';

// Keep in sync with tiptap-whitelist.ts
export const RICH_TEXT_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: false,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
    },
  }),
];
