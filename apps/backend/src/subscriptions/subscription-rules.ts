export enum SubscriptionStatus {
  UPCOMING = 'UPCOMING',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
}

export type RevokeDecision =
  { action: 'DELETE' } | { action: 'END'; endDate: string } | { action: 'REJECT' };

export function deriveSubscriptionStatus(
  startDate: string,
  endDate: string,
  today: string,
): SubscriptionStatus {
  if (startDate > today) {
    return SubscriptionStatus.UPCOMING;
  }
  if (endDate < today) {
    return SubscriptionStatus.EXPIRED;
  }
  return SubscriptionStatus.ACTIVE;
}

export function decideSubscriptionRevoke(
  startDate: string,
  endDate: string,
  today: string,
): RevokeDecision {
  if (startDate >= today) {
    return { action: 'DELETE' };
  }
  if (endDate >= today) {
    return { action: 'END', endDate: addDateDays(today, -1) };
  }
  return { action: 'REJECT' };
}

export function calculateRetainedUntil(latestEndDate: string | null): string | null {
  return latestEndDate === null ? null : addDateYears(latestEndDate, 2);
}

export function addDateDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, day! + days));
  return result.toISOString().slice(0, 10);
}

function addDateYears(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const targetYear = year! + years;
  const targetDay = Math.min(day!, new Date(Date.UTC(targetYear, month!, 0)).getUTCDate());
  return `${targetYear.toString().padStart(4, '0')}-${month!.toString().padStart(2, '0')}-${targetDay.toString().padStart(2, '0')}`;
}
