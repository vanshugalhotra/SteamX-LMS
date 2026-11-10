/** Pure editability rules shared by assignment writes and detail responses. */
import { AssignmentStatus } from '../../generated/prisma/client.js';

/** Returns whether content remains unlocked by publication and submissions. */
export function isAssignmentContentUnlocked(
  status: AssignmentStatus,
  hasSubmissions: boolean,
): boolean {
  return status !== AssignmentStatus.PUBLISHED && !hasSubmissions;
}

/** Applies the stricter whole-content rule used for the API contentEditable flag. */
export function isAssignmentContentEditable(
  status: AssignmentStatus,
  hasSubmissions: boolean,
  isTemplateCopy: boolean,
): boolean {
  return isAssignmentContentUnlocked(status, hasSubmissions) && !isTemplateCopy;
}
