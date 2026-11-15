import type { SubscriptionStatusFilter } from '../model/types';

export const SUBSCRIPTIONS_PAGE_SIZE = 6;

export const SUBSCRIPTION_STATUS_FILTERS: { value: SubscriptionStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'EXPIRED', label: 'Expired' },
];

export const SUBSCRIPTION_COURSE_ACCENTS = [
  'bg-brand-coral text-brand-navy',
  'bg-brand-teal text-brand-navy',
  'bg-brand-sun text-brand-navy',
  'bg-[#5b4fc7] text-white',
] as const;

export function getSubscriptionCourseAccent(courseId: string) {
  const hash = courseId.charCodeAt(courseId.length - 1);
  return SUBSCRIPTION_COURSE_ACCENTS[hash % SUBSCRIPTION_COURSE_ACCENTS.length];
}
