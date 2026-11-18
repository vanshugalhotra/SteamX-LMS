import { useState } from 'react';
import { SearchBox } from '@/components/list/ListToolbar';
import { useCourseSearch } from '@/features/admin/courses/queries';
import { useAnySchoolSearchWhenEnabled } from '@/features/admin/schools/queries';

export interface CourseSchoolSelection {
  type: 'course' | 'school';
  id: string;
}

export function CourseSchoolSearch({
  onSelect,
}: {
  onSelect: (selection: CourseSchoolSelection) => void;
}) {
  const [search, setSearch] = useState('');
  const enabled = Boolean(search.trim());
  const courses = useCourseSearch(search, enabled);
  const schools = useAnySchoolSearchWhenEnabled(search, enabled);
  const options = [
    ...courses.options.map((course) => ({
      ...course,
      type: 'course' as const,
      description: 'Course',
    })),
    ...schools.options.map((school) => ({
      ...school,
      type: 'school' as const,
      description: 'School',
    })),
  ];
  const isPending = courses.isPending || schools.isPending;
  const hasError = courses.isError || schools.isError;

  return (
    <div className="relative w-full max-w-sm">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search by course or school"
        label="Search by course or school"
      />
      {search.trim() && (
        <ul
          aria-label="Course and school search results"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
        >
          {isPending && <li className="px-3 py-2 text-xs text-gray-600">Searching…</li>}
          {hasError && (
            <li role="alert" className="px-3 py-2 text-xs text-danger">
              Couldn&apos;t load all search results.
            </li>
          )}
          {!isPending && !hasError && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-600">No course or school found.</li>
          )}
          {options.map((option) => (
            <li key={`${option.type}:${option.value}`}>
              <button
                type="button"
                aria-label={`${option.label} (${option.description})`}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                onClick={() => {
                  onSelect({ type: option.type, id: option.value });
                  setSearch('');
                }}
              >
                {option.label}
                <span className="ml-2 text-xs text-gray-600">{option.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
