import { Check } from 'lucide-react';
import type { AssetUploadPhase, AssetUploadRetryStep } from '../hooks/use-asset-upload';

const UPLOAD_STEPS = [
  { title: 'Choose file', description: 'JPG, PNG, WebP, PDF or MP4' },
  { title: 'Uploading', description: 'Sending your file directly to storage' },
  { title: 'Processing', description: 'Checking and preparing it' },
  { title: 'Ready', description: 'Available in the asset library' },
];

function getActiveStep(phase: AssetUploadPhase, retryStep: AssetUploadRetryStep): number {
  if (phase === 'uploading') return 1;
  if (phase === 'completing') return 2;
  if (phase === 'ready') return 3;
  if (phase === 'failed') return retryStep === 'complete' ? 2 : 1;
  return 0;
}

export function UploadStepper({
  phase,
  progress,
  fileName,
  retryStep,
}: {
  phase: AssetUploadPhase;
  progress: number;
  fileName: string | null;
  retryStep: AssetUploadRetryStep;
}) {
  const activeStep = getActiveStep(phase, retryStep);

  return (
    <section
      className="relative min-h-96 self-stretch overflow-hidden rounded-3xl bg-teal-500 p-6 text-gray-900"
      aria-labelledby="upload-progress-title"
    >
      <span
        aria-hidden="true"
        className="absolute -bottom-10 -right-8 size-36 rounded-full bg-coral-500"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-2 right-20 size-20 rounded-full bg-yellow-500"
      />
      <h2 id="upload-progress-title" className="relative text-sm font-semibold">
        From upload to ready
      </h2>
      <ol className="relative mt-5 space-y-5 pb-20">
        {UPLOAD_STEPS.map((step, index) => {
          const complete = phase === 'ready' || index < activeStep;
          const current = index === activeStep && phase !== 'ready';
          const failed = phase === 'failed' && current;
          return (
            <li
              key={step.title}
              aria-current={current ? 'step' : undefined}
              className="flex items-start gap-3"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  failed
                    ? 'bg-magenta-800 text-white'
                    : complete
                      ? 'bg-gray-900 text-white'
                      : current
                        ? 'bg-coral-500 text-white'
                        : 'bg-white text-gray-900'
                }`}
              >
                {complete ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : failed ? (
                  '!'
                ) : (
                  index + 1
                )}
              </span>
              <span className="pt-0.5">
                <span className="block text-[13px] font-semibold">
                  {failed ? `${step.title} failed` : step.title}
                </span>
                <span className="block text-[11px]">
                  {index === 0 && fileName ? fileName : step.description}
                  {index === 1 && phase === 'uploading' ? ` · ${String(progress)}%` : ''}
                  {index === 2 && phase === 'completing' ? ' · Verifying upload' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
