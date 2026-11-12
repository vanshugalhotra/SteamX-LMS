import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormRenderer, type FieldConfig } from '@/components/form/FormRenderer';
import { Button } from '@/components/ui/button';

// Mirrors the backend title limit (AssetDto: max 200).
const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200, 'Use at most 200 characters'),
});
type Values = z.infer<typeof schema>;

const FIELDS: FieldConfig<Values>[] = [{ name: 'title', label: 'Asset title', required: true }];

interface RenameAssetFormProps {
  initialTitle: string;
  pending: boolean;
  /** Resolves to an error message, or null when saved. */
  onSubmit: (title: string) => Promise<string | null>;
  onCancel: () => void;
}

export function RenameAssetForm({
  initialTitle,
  pending,
  onSubmit,
  onCancel,
}: RenameAssetFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: initialTitle } });

  useEffect(() => {
    setFocus('title');
  }, [setFocus]);

  const submit = handleSubmit(async ({ title }) => {
    if (title === initialTitle) {
      onCancel();
      return;
    }
    const message = await onSubmit(title);
    if (message) setError('title', { message });
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void submit(e);
      }}
    >
      <FormRenderer
        fields={FIELDS}
        register={register}
        control={control}
        errors={errors}
        disabled={pending}
      />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save title'}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
