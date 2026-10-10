import landingImage from '@/assets/landingImage.webp';
import { ButtonLink } from '@/components/ui/button-link';
import { LandingDecor } from './LandingDecor';
import { LandingNavbar } from './LandingNavbar';

export function LandingPage() {
  return (
    <div className="flex min-h-svh">
      <div className="relative flex flex-1 flex-col overflow-hidden bg-coral-200 px-4 py-6 text-coral-900 sm:px-6 md:px-10">
        <LandingDecor />

        <div className="relative z-10 mx-auto flex w-full max-w-300 flex-1 flex-col">
          <LandingNavbar />

          <main className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2 md:gap-6">
            <div>
              <h1 className="text-5xl leading-[1.1] font-semibold tracking-tight md:text-7xl">
                Learn STEAM, guided by your teacher
              </h1>
              <p className="mt-4 max-w-[40ch] text-lg">
                Your classes, lessons and progress in one simple place.
              </p>
              <ButtonLink to="/login" variant="neo" size="lg" className="mt-8 rounded-full">
                Log in with SteamX ID
              </ButtonLink>
            </div>

            <img
              src={landingImage}
              width={1066}
              height={1008}
              fetchPriority="high"
              decoding="async"
              alt="A student leaping over a stack of books holding a pencil, surrounded by science, art and engineering icons"
              className="mx-auto h-auto w-full max-w-lg md:max-w-none"
            />
          </main>
        </div>
      </div>
    </div>
  );
}
