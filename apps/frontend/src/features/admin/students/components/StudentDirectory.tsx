import { PATHS } from '@/lib/paths';
import { UserDirectory } from '../../users/components/UserDirectory';
import { STUDENTS_PAGE_SIZE, STUDENTS_SEARCH_MAX_LENGTH } from '../config/students.config';

export function StudentDirectory({ currentId }: { currentId?: string }) {
  return (
    <UserDirectory
      role="student"
      singular="student"
      plural="students"
      pageSize={STUDENTS_PAGE_SIZE}
      searchMaxLength={STUDENTS_SEARCH_MAX_LENGTH}
      editPath={PATHS.admin.studentEdit}
      currentId={currentId}
    />
  );
}
