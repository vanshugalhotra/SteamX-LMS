const COURSE_ACCENTS = [
  'bg-brand-coral text-brand-navy',
  'bg-brand-teal text-brand-navy',
  'bg-brand-sun text-brand-navy',
  'bg-brand-tertiary text-brand-navy',
] as const;

export function getCourseAccent(courseId: string) {
  const hash = courseId.charCodeAt(courseId.length - 1);
  return COURSE_ACCENTS[hash % COURSE_ACCENTS.length];
}
