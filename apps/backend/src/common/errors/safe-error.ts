/** Strips signed URLs from error messages to prevent them from reaching logs. */
export function safeError(error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : String(error);
  return { name, message: message.replace(/https?:\/\/\S+/gi, '[redacted URL]') };
}
