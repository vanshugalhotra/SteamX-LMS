import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pool } from 'pg';

const DEFAULT_PORT = 5173;
const MAX_PORT = 65535;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const smokeToken = randomBytes(32).toString('hex');

function getPort(args: string[]): number {
  const portIndex = args.indexOf('--port');
  if (portIndex < 0) return DEFAULT_PORT;

  const port = Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error('--port must be an integer between 1 and 65535');
  }
  return port;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2048) throw new Error('Request body exceeds 2 KB.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: pnpm asset:smoke [--port <allowed-free-port>]\n');
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is missing; the smoke page needs it to verify the video playback key.',
    );
  }

  const port = getPort(process.argv.slice(2));
  const indexHtml = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const browserJs = await readFile(new URL('./browser.js', import.meta.url));
  const database = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await database.query('SELECT 1');

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(indexHtml.replace('__SMOKE_TOKEN__', smokeToken));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/browser.js') {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(browserJs);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/inspect-video') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        const body: unknown = await readRequestJson(request);
        if (
          typeof body !== 'object' ||
          body === null ||
          !('assetId' in body) ||
          !('fileId' in body) ||
          typeof body.assetId !== 'string' ||
          typeof body.fileId !== 'string' ||
          !UUID_PATTERN.test(body.assetId) ||
          !UUID_PATTERN.test(body.fileId)
        ) {
          sendJson(response, 400, { error: 'Invalid asset or file ID' });
          return;
        }

        const result = await database.query<{ status: string; playback_matches_storage: boolean }>(
          `SELECT status::text, playback_key = storage_key AS playback_matches_storage
           FROM asset_files
           WHERE asset_id = $1::uuid AND id = $2::uuid`,
          [body.assetId, body.fileId],
        );
        const row = result.rows[0];
        if (result.rowCount !== 1 || !row) {
          sendJson(response, 404, { error: 'Asset file not found in configured database' });
          return;
        }
        sendJson(response, 200, {
          status: row.status,
          playbackMatchesStorage: row.playback_matches_storage,
        });
        return;
      }
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      process.stderr.write(
        `Asset smoke local request failed: ${error instanceof Error ? error.name : 'UnknownError'}\n`,
      );
      sendJson(response, 500, { error: 'Local database inspection failed.' });
    }
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    process.stderr.write(`Could not start asset smoke page: ${error.message}\n`);
    process.exitCode = 1;
    void database.end();
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Asset upload smoke page: http://localhost:${port}\n`);
    process.stdout.write('Keep this terminal running; stop it with Ctrl+C when finished.\n');
  });
  const close = () => {
    server.close();
    void database.end();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`Asset upload smoke could not start: ${message}\n`);
  process.exitCode = 1;
});
