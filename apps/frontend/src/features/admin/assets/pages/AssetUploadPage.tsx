import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button-link';
import { PATHS } from '@/lib/paths';
import { AssetUploadForm } from '../components/AssetUploadForm';

export function AssetUploadPage() {
  return (
    <div className="space-y-6">
      <ButtonLink to={PATHS.admin.assets} variant="secondary" size="sm">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Asset Library
      </ButtonLink>

      <div>
        <h1 className="text-2xl font-semibold">Upload asset</h1>
        <p className="mt-1 text-xs text-gray-600">
          Upload an image, PDF, or video. It will be available in the library once processing is
          complete.
        </p>
      </div>

      <AssetUploadForm />
    </div>
  );
}
