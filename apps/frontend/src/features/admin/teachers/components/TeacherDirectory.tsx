import { PATHS } from '@/lib/paths';
import { UserDirectory } from '../../users/components/UserDirectory';
import { TEACHERS_PAGE_SIZE, TEACHERS_SEARCH_MAX_LENGTH } from '../config/teachers.config';

export function TeacherDirectory({ currentId }: { currentId?: string }) {
  return (
    <UserDirectory
      role="teacher"
      singular="teacher"
      plural="teachers"
      pageSize={TEACHERS_PAGE_SIZE}
      searchMaxLength={TEACHERS_SEARCH_MAX_LENGTH}
      editPath={PATHS.admin.teacherEdit}
      currentId={currentId}
    />
  );
}
