export function formatDate(
  date: string,
  locales?: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locales, options).format(new Date(date));
}
