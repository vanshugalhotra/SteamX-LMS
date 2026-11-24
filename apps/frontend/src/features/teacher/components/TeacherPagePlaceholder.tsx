export function TeacherPagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </section>
  );
}
