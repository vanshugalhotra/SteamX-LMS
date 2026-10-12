export function RootFallback() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-ring" />
    </div>
  );
}

export function RootError() {
  return <div className="p-6">Something went wrong. Please refresh the page.</div>;
}