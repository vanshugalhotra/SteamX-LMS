import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const DEFAULT_PORT = 5174;
const MAX_PORT = 65535;

function getPort(args: string[]): number {
  const portIndex = args.indexOf('--port');
  if (portIndex < 0) return DEFAULT_PORT;

  const port = Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error('--port must be an integer between 1 and 65535');
  }
  return port;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: pnpm asset:access:smoke [--port <allowed-free-port>]\n');
    return;
  }

  const port = getPort(process.argv.slice(2));
  const indexHtml = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const browserJs = await readFile(new URL('./browser.js', import.meta.url));

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', `http://localhost:${port}`).pathname;
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }

    if (path === '/') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(indexHtml);
      return;
    }

    if (path === '/browser.js') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/javascript; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(browserJs);
      return;
    }

    response.writeHead(404).end();
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    process.stderr.write(`Could not start asset access smoke page: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Asset access smoke page: http://localhost:${port}\n`);
    process.stdout.write('Keep this terminal running; stop it with Ctrl+C when finished.\n');
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`Asset access smoke could not start: ${message}\n`);
  process.exitCode = 1;
});
