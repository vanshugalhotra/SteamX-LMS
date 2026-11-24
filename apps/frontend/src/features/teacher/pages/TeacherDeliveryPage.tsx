import { Link } from 'react-router';
import { TeacherPagePlaceholder } from '../components/TeacherPagePlaceholder';
import { PATHS } from '@/lib/paths';

export function TeacherDeliveryPage() {
  return (
    <section>
      <Link
        to={PATHS.teacher.deliveries}
        className="text-sm font-medium text-teal-800 underline underline-offset-4"
      >
        Back to My Deliveries
      </Link>
      <div className="mt-5">
        <TeacherPagePlaceholder
          title="Delivery details"
          description="Delivery information will appear here."
        />
      </div>
    </section>
  );
}
