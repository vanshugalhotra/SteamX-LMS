import { useNavigate } from 'react-router';
import { PATHS } from '@/lib/paths';
import { CourseForm } from '../components/CourseForm';
import { CourseFormLayout } from '../components/CourseFormLayout';

export function CourseCreatePage() {
  const navigate = useNavigate();
  const backToList = (createdCourseId?: string) => {
    if (createdCourseId) {
      void navigate(PATHS.admin.courseEdit(createdCourseId));
      return;
    }
    void navigate(PATHS.admin.courses);
  };
  const cancel = () => {
    void navigate(PATHS.admin.courses);
  };

  return (
    <CourseFormLayout
      title="Add course"
      subtitle="Create a course, then add modules and lessons to build its curriculum."
    >
      <CourseForm onDone={backToList} onCancel={cancel} />
    </CourseFormLayout>
  );
}
