export type ContentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export const CONTENT_STATUS_PRESENTATION = {
  DRAFT: { label: 'Draft', badgeClassName: 'bg-brand-draft text-brand-draft-ink' },
  ACTIVE: { label: 'Active', badgeClassName: 'bg-teal-100 text-brand-active-ink' },
  ARCHIVED: { label: 'Archived', badgeClassName: 'bg-brand-chip text-gray-600' },
} satisfies Record<ContentStatus, { label: string; badgeClassName: string }>;
