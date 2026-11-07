import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ChainedCommands, Editor } from '@tiptap/react';

export interface ToolbarItem {
  label: string;
  group: string;
  icon: LucideIcon;
  /** Arguments for editor.isActive(); leave out for actions without an on/off state. */
  active?: [name: string, attrs?: Record<string, unknown>];
  /** The item is unavailable when this returns false (undo/redo). */
  can?: (editor: Editor) => boolean;
  /** 'link' opens the link form instead of running a command. */
  run: 'link' | ((chain: ChainedCommands) => ChainedCommands);
}

const tool = (
  group: string,
  label: string,
  icon: LucideIcon,
  run: ToolbarItem['run'],
  extra: Partial<ToolbarItem> = {},
): ToolbarItem => ({ group, label, icon, run, ...extra });

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  tool('history', 'Undo', Undo2, (c) => c.undo(), { can: (e) => e.can().undo() }),
  tool('history', 'Redo', Redo2, (c) => c.redo(), { can: (e) => e.can().redo() }),
  tool('blocks', 'Paragraph', Pilcrow, (c) => c.setParagraph(), { active: ['paragraph'] }),
  tool('blocks', 'Heading 1', Heading1, (c) => c.toggleHeading({ level: 1 }), {
    active: ['heading', { level: 1 }],
  }),
  tool('blocks', 'Heading 2', Heading2, (c) => c.toggleHeading({ level: 2 }), {
    active: ['heading', { level: 2 }],
  }),
  tool('blocks', 'Heading 3', Heading3, (c) => c.toggleHeading({ level: 3 }), {
    active: ['heading', { level: 3 }],
  }),
  tool('marks', 'Bold', Bold, (c) => c.toggleBold(), { active: ['bold'] }),
  tool('marks', 'Italic', Italic, (c) => c.toggleItalic(), { active: ['italic'] }),
  tool('marks', 'Underline', Underline, (c) => c.toggleUnderline(), { active: ['underline'] }),
  tool('marks', 'Strikethrough', Strikethrough, (c) => c.toggleStrike(), { active: ['strike'] }),
  tool('marks', 'Inline code', Code, (c) => c.toggleCode(), { active: ['code'] }),
  tool('marks', 'Link', Link2, 'link', { active: ['link'] }),
  tool('lists', 'Bullet list', List, (c) => c.toggleBulletList(), { active: ['bulletList'] }),
  tool('lists', 'Numbered list', ListOrdered, (c) => c.toggleOrderedList(), {
    active: ['orderedList'],
  }),
  tool('lists', 'Blockquote', Quote, (c) => c.toggleBlockquote(), { active: ['blockquote'] }),
  tool('lists', 'Code block', SquareCode, (c) => c.toggleCodeBlock(), { active: ['codeBlock'] }),
];
