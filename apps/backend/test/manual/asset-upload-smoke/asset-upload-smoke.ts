import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

const DEFAULT_PORT = 5173;
const MAX_PORT = 65535;
const MAX_PROXY_BODY_BYTES = 1_100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const smokeToken = randomBytes(32).toString('hex');
const stateFile = new URL('./.smoke-state.json', import.meta.url);

type SmokeAsset = { id: string; fileIds: string[]; objectKeys: string[] };
type SmokeState = {
  assets: SmokeAsset[];
  courses: string[];
  modules: string[];
  lessons: string[];
  cleanupComplete: boolean;
};

const emptyState = (): SmokeState => ({
  assets: [],
  courses: [],
  modules: [],
  lessons: [],
  cleanupComplete: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && UUID_PATTERN.test(item))
  );
}

function isSmokeAsset(value: unknown): value is SmokeAsset {
  if (!isRecord(value)) return false;
  const assetId = value.id;
  const fileIds = value.fileIds;
  const objectKeys = value.objectKeys;
  if (
    typeof assetId !== 'string' ||
    !UUID_PATTERN.test(assetId) ||
    !isUuidArray(fileIds) ||
    !Array.isArray(objectKeys)
  ) {
    return false;
  }
  return objectKeys.every((key: unknown) => {
    if (typeof key !== 'string') return false;
    const match = key.match(/^assets\/([^/]+)\/([^/]+)\/original$/);
    if (!match || typeof match[2] !== 'string') return false;
    return (
      match[1] === assetId.toLowerCase() &&
      UUID_PATTERN.test(match[2]) &&
      fileIds.includes(match[2].toLowerCase())
    );
  });
}

function isLoopbackBackend(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isMissingS3Object(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
}

function createS3Client(): S3Client {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION is required to verify S3 cleanup.');
  return new S3Client({ region });
}

async function loadState(): Promise<SmokeState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(stateFile, 'utf8'));
    if (!isRecord(parsed)) throw new Error('The saved smoke state has an invalid shape.');
    const assets = Array.isArray(parsed.assets) ? parsed.assets.filter(isSmokeAsset) : [];
    if (
      !Array.isArray(parsed.assets) ||
      assets.length !== parsed.assets.length ||
      !isUuidArray(parsed.courses) ||
      !isUuidArray(parsed.modules) ||
      !isUuidArray(parsed.lessons) ||
      typeof parsed.cleanupComplete !== 'boolean'
    ) {
      throw new Error('The saved smoke state has an invalid shape.');
    }
    return {
      assets: assets.map((asset) => ({
        id: asset.id.toLowerCase(),
        fileIds: asset.fileIds.map((id) => id.toLowerCase()),
        objectKeys: [...asset.objectKeys],
      })),
      courses: parsed.courses.map((id) => id.toLowerCase()),
      modules: parsed.modules.map((id) => id.toLowerCase()),
      lessons: parsed.lessons.map((id) => id.toLowerCase()),
      cleanupComplete: parsed.cleanupComplete,
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return emptyState();
    throw error;
  }
}

async function saveState(state: SmokeState): Promise<void> {
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function verifyCleanup(state: SmokeState, database: Pool, s3: S3Client): Promise<void> {
  if (!state.cleanupComplete) {
    throw new Error(
      'The last smoke run is not marked cleaned up; use the page Cleanup button first.',
    );
  }
  const results = await database.query<{
    assets_exist: boolean;
    courses_exist: boolean;
    modules_exist: boolean;
    lessons_exist: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM assets WHERE id = ANY($1::uuid[])) AS assets_exist,
       EXISTS (SELECT 1 FROM courses WHERE id = ANY($2::uuid[])) AS courses_exist,
       EXISTS (SELECT 1 FROM modules WHERE id = ANY($3::uuid[])) AS modules_exist,
       EXISTS (SELECT 1 FROM lessons WHERE id = ANY($4::uuid[])) AS lessons_exist`,
    [state.assets.map(({ id }) => id), state.courses, state.modules, state.lessons],
  );
  const row = results.rows[0];
  if (!row || row.assets_exist || row.courses_exist || row.modules_exist || row.lessons_exist) {
    throw new Error('Database rows from the last smoke run still exist.');
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required to verify S3 cleanup.');
  for (const asset of state.assets) {
    for (const key of asset.objectKeys) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        if (isMissingS3Object(error)) continue;
        throw error;
      }
      throw new Error('An S3 object from the last smoke run still exists.');
    }
  }
  process.stdout.write(
    `Cleanup verified: ${state.assets.length} assets, ${state.lessons.length} lessons, ${state.modules.length} modules, ${state.courses.length} courses, ${state.assets.reduce((count, asset) => count + asset.objectKeys.length, 0)} S3 objects.\n`,
  );
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new Error('Request body exceeds the allowed size.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function writeAssetObjectKey(
  state: SmokeState,
  database: Pool,
  assetId: string,
  fileId: string,
): Promise<void> {
  const expectedKey = `assets/${assetId}/${fileId}/original`;
  const asset = state.assets.find(({ id }) => id === assetId);
  if (!asset) throw new Error('The created asset was not tracked.');
  if (!asset.fileIds.includes(fileId)) asset.fileIds.push(fileId);
  if (!asset.objectKeys.includes(expectedKey)) asset.objectKeys.push(expectedKey);
  await saveState(state);
  const result = await database.query<{ storage_key: string }>(
    'SELECT storage_key FROM asset_files WHERE asset_id = $1::uuid AND id = $2::uuid',
    [assetId, fileId],
  );
  const key = result.rows[0]?.storage_key;
  if (key !== expectedKey) {
    throw new Error('The created asset file has no matching S3 object key in the database.');
  }
}

function hasTrackedId(ids: Set<string>, id: string): boolean {
  return UUID_PATTERN.test(id) && ids.has(id.toLowerCase());
}

function hasTrackedAssetFile(state: SmokeState, assetId: string, fileId: string): boolean {
  const asset = state.assets.find(({ id }) => id === assetId.toLowerCase());
  return asset?.fileIds.includes(fileId.toLowerCase()) ?? false;
}

function isAllowedApiRequest(
  method: string,
  path: string,
  body: unknown,
  state: SmokeState,
  active: { assets: Set<string>; courses: Set<string>; modules: Set<string>; lessons: Set<string> },
): boolean {
  if (method === 'POST' && path === '/api/v1/auth/login') return true;

  if (method === 'POST' && path === '/api/v1/assets') {
    return (
      isRecord(body) && typeof body.title === 'string' && body.title.startsWith('__assets-smoke__')
    );
  }
  let match = path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)$/i);
  if (match && hasTrackedId(active.assets, match[1]!)) {
    return ['GET', 'DELETE'].includes(method);
  }
  match = path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/access$/i);
  if (match && hasTrackedId(active.assets, match[1]!)) return method === 'GET';
  match = path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/files$/i);
  if (match && hasTrackedId(active.assets, match[1]!)) return method === 'POST';
  match = path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/files\/([0-9a-f-]+)$/i);
  if (
    match &&
    hasTrackedId(active.assets, match[1]!) &&
    hasTrackedAssetFile(state, match[1]!, match[2]!)
  ) {
    return method === 'GET';
  }
  match = path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/files\/([0-9a-f-]+)\/complete$/i);
  if (
    match &&
    hasTrackedId(active.assets, match[1]!) &&
    hasTrackedAssetFile(state, match[1]!, match[2]!)
  ) {
    return method === 'POST';
  }

  if (method === 'POST' && path === '/api/v1/courses') {
    return (
      isRecord(body) && typeof body.title === 'string' && body.title.startsWith('__assets-smoke__')
    );
  }
  match = path.match(/^\/api\/v1\/courses\/([0-9a-f-]+)$/i);
  if (match && hasTrackedId(active.courses, match[1]!)) {
    return ['GET', 'PATCH', 'DELETE'].includes(method);
  }
  match = path.match(/^\/api\/v1\/courses\/([0-9a-f-]+)\/modules$/i);
  if (match && hasTrackedId(active.courses, match[1]!)) {
    return (
      method === 'POST' &&
      isRecord(body) &&
      typeof body.title === 'string' &&
      body.title.startsWith('__assets-smoke__')
    );
  }
  match = path.match(/^\/api\/v1\/modules\/([0-9a-f-]+)$/i);
  if (match && hasTrackedId(active.modules, match[1]!)) {
    return ['GET', 'PATCH', 'DELETE'].includes(method);
  }
  match = path.match(/^\/api\/v1\/modules\/([0-9a-f-]+)\/lessons$/i);
  if (match && hasTrackedId(active.modules, match[1]!)) {
    return (
      method === 'POST' &&
      isRecord(body) &&
      typeof body.title === 'string' &&
      body.title.startsWith('__assets-smoke__')
    );
  }
  match = path.match(/^\/api\/v1\/lessons\/([0-9a-f-]+)(\/content)?$/i);
  if (match && hasTrackedId(active.lessons, match[1]!)) {
    if (match[2] === '/content') return method === 'GET' || method === 'PUT';
    return ['GET', 'PATCH', 'DELETE'].includes(method);
  }
  return false;
}

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
  return readJsonBody(request, 2048);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    process.stdout.write(
      'Usage: pnpm assets:smoke [--port <allowed-free-port>] [--verify-cleanup]\n',
    );
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is missing; the smoke page needs it to verify the video playback key.',
    );
  }

  const port = getPort(process.argv.slice(2));
  const database = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await database.query('SELECT 1');
  if (process.argv.includes('--verify-cleanup')) {
    const s3 = createS3Client();
    try {
      await verifyCleanup(await loadState(), database, s3);
    } finally {
      s3.destroy();
      await database.end();
    }
    return;
  }

  const indexHtml = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const browserJs = await readFile(new URL('./browser.js', import.meta.url));
  const state = await loadState();
  const active = {
    assets: new Set<string>(),
    courses: new Set<string>(),
    modules: new Set<string>(),
    lessons: new Set<string>(),
  };
  let backendUrl: URL | undefined;
  let apiCookie = '';

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
      if (request.method === 'POST' && url.pathname === '/begin') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        const hasPriorResources =
          state.assets.length + state.courses.length + state.modules.length + state.lessons.length >
          0;
        if (hasPriorResources && !state.cleanupComplete) {
          sendJson(response, 409, {
            error: 'The previous smoke run is not cleaned up; use --verify-cleanup after cleanup.',
          });
          return;
        }
        Object.assign(state, emptyState());
        active.assets.clear();
        active.courses.clear();
        active.modules.clear();
        active.lessons.clear();
        backendUrl = undefined;
        apiCookie = '';
        await saveState(state);
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/configure-backend') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        const body: unknown = await readRequestJson(request);
        if (!isRecord(body) || !isLoopbackBackend(body.backendUrl)) {
          sendJson(response, 400, { error: 'Backend URL must use localhost or a loopback IP.' });
          return;
        }
        backendUrl = new URL(body.backendUrl);
        apiCookie = '';
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/state') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        sendJson(response, 200, {
          ...state,
          activeAssetIds: [...active.assets],
          activeCourseIds: [...active.courses],
          activeModuleIds: [...active.modules],
          activeLessonIds: [...active.lessons],
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api-proxy') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        const body: unknown = await readJsonBody(request, MAX_PROXY_BODY_BYTES);
        if (
          !isRecord(body) ||
          typeof body.method !== 'string' ||
          typeof body.path !== 'string' ||
          !/^(GET|POST|PUT|PATCH|DELETE)$/.test(body.method) ||
          !/^\/api\/v1\/[a-z0-9/:_-]+$/i.test(body.path) ||
          !backendUrl ||
          !isAllowedApiRequest(body.method, body.path, body.body, state, active)
        ) {
          sendJson(response, 403, { error: 'Request is not allowed by the smoke proxy.' });
          return;
        }
        const headers = new Headers({ Accept: 'application/json' });
        const origin = request.headers.origin;
        if (typeof origin === 'string') headers.set('Origin', origin);
        if (apiCookie) headers.set('Cookie', apiCookie);
        let requestBody: string | undefined;
        if (body.body !== undefined) {
          headers.set('Content-Type', 'application/json');
          requestBody = JSON.stringify(body.body);
        }
        const upstream = await fetch(new URL(body.path, backendUrl), {
          method: body.method,
          headers,
          ...(requestBody ? { body: requestBody } : {}),
          redirect: 'manual',
        });
        const setCookies = upstream.headers.getSetCookie();
        if (setCookies.length > 0) {
          apiCookie = setCookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
        }
        const responseText = await upstream.text();
        let responseBody: unknown;
        if (responseText) {
          try {
            responseBody = JSON.parse(responseText) as unknown;
          } catch {
            responseBody = undefined;
          }
        }
        const idMatch = body.path.match(/^\/api\/v1\/(courses|modules|lessons)\/?$/);
        if (
          body.method === 'POST' &&
          upstream.status >= 200 &&
          upstream.status < 300 &&
          isRecord(responseBody) &&
          typeof responseBody.id === 'string' &&
          UUID_PATTERN.test(responseBody.id)
        ) {
          const id = responseBody.id.toLowerCase();
          if (idMatch?.[1] === 'courses') {
            state.courses.push(id);
            active.courses.add(id);
          } else if (body.path.includes('/modules') && body.path.startsWith('/api/v1/courses/')) {
            state.modules.push(id);
            active.modules.add(id);
          } else if (body.path.includes('/lessons') && body.path.startsWith('/api/v1/modules/')) {
            state.lessons.push(id);
            active.lessons.add(id);
          }
          await saveState(state);
        }
        if (
          body.method === 'POST' &&
          upstream.status === 201 &&
          body.path === '/api/v1/assets' &&
          isRecord(responseBody) &&
          isRecord(responseBody.asset) &&
          typeof responseBody.asset.id === 'string' &&
          UUID_PATTERN.test(responseBody.asset.id) &&
          isRecord(responseBody.file) &&
          typeof responseBody.file.id === 'string' &&
          UUID_PATTERN.test(responseBody.file.id)
        ) {
          const assetId = responseBody.asset.id.toLowerCase();
          const fileId = responseBody.file.id.toLowerCase();
          state.assets.push({
            id: assetId,
            fileIds: [fileId],
            objectKeys: [`assets/${assetId}/${fileId}/original`],
          });
          active.assets.add(assetId);
          await saveState(state);
          await writeAssetObjectKey(state, database, assetId, fileId);
        }
        const newFileMatch = body.path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)\/files$/i);
        if (
          body.method === 'POST' &&
          upstream.status === 201 &&
          newFileMatch &&
          isRecord(responseBody) &&
          isRecord(responseBody.file) &&
          typeof responseBody.file.id === 'string' &&
          UUID_PATTERN.test(responseBody.file.id)
        ) {
          await writeAssetObjectKey(
            state,
            database,
            newFileMatch[1]!.toLowerCase(),
            responseBody.file.id.toLowerCase(),
          );
        }
        const deletedAssetMatch = body.path.match(/^\/api\/v1\/assets\/([0-9a-f-]+)$/i);
        const deletedCourseMatch = body.path.match(/^\/api\/v1\/courses\/([0-9a-f-]+)$/i);
        const deletedModuleMatch = body.path.match(/^\/api\/v1\/modules\/([0-9a-f-]+)$/i);
        const deletedLessonMatch = body.path.match(/^\/api\/v1\/lessons\/([0-9a-f-]+)$/i);
        if (upstream.status === 204 && body.method === 'DELETE') {
          if (deletedAssetMatch) active.assets.delete(deletedAssetMatch[1]!.toLowerCase());
          if (deletedCourseMatch) active.courses.delete(deletedCourseMatch[1]!.toLowerCase());
          if (deletedModuleMatch) active.modules.delete(deletedModuleMatch[1]!.toLowerCase());
          if (deletedLessonMatch) active.lessons.delete(deletedLessonMatch[1]!.toLowerCase());
        }
        response.writeHead(upstream.status, {
          'Cache-Control': 'no-store',
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        });
        response.end(responseText);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/cleanup-objects') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        if (
          active.assets.size + active.courses.size + active.modules.size + active.lessons.size >
          0
        ) {
          sendJson(response, 409, { error: 'API-created resources must be deleted first.' });
          return;
        }
        const bucket = process.env.S3_BUCKET;
        if (!bucket) throw new Error('S3_BUCKET is required to clean up smoke objects.');
        const existence = await database.query<{ has_resources: boolean }>(
          `SELECT
             EXISTS (SELECT 1 FROM assets WHERE id = ANY($1::uuid[]))
             OR EXISTS (SELECT 1 FROM courses WHERE id = ANY($2::uuid[]))
             OR EXISTS (SELECT 1 FROM modules WHERE id = ANY($3::uuid[]))
             OR EXISTS (SELECT 1 FROM lessons WHERE id = ANY($4::uuid[])) AS has_resources`,
          [state.assets.map(({ id }) => id), state.courses, state.modules, state.lessons],
        );
        if (existence.rows[0]?.has_resources) {
          sendJson(response, 409, { error: 'Database rows from the smoke run still exist.' });
          return;
        }
        const s3 = createS3Client();
        let deletedObjectCount = 0;
        try {
          for (const asset of state.assets) {
            for (const key of asset.objectKeys) {
              await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
              deletedObjectCount++;
            }
          }
          for (const asset of state.assets) {
            for (const key of asset.objectKeys) {
              try {
                await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
              } catch (error) {
                if (isMissingS3Object(error)) continue;
                throw error;
              }
              throw new Error('An S3 object remained after cleanup.');
            }
          }
        } finally {
          s3.destroy();
        }
        state.cleanupComplete = true;
        await saveState(state);
        sendJson(response, 200, {
          assetCount: state.assets.length,
          lessonCount: state.lessons.length,
          moduleCount: state.modules.length,
          courseCount: state.courses.length,
          objectCount: deletedObjectCount,
        });
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
      if (request.method === 'POST' && url.pathname === '/inspect-replacement') {
        if (request.headers['x-smoke-token'] !== smokeToken) {
          sendJson(response, 403, { error: 'Forbidden' });
          return;
        }
        const body: unknown = await readRequestJson(request);
        if (
          typeof body !== 'object' ||
          body === null ||
          !('assetId' in body) ||
          !('oldFileId' in body) ||
          !('newFileId' in body) ||
          typeof body.assetId !== 'string' ||
          typeof body.oldFileId !== 'string' ||
          typeof body.newFileId !== 'string' ||
          !UUID_PATTERN.test(body.assetId) ||
          !UUID_PATTERN.test(body.oldFileId) ||
          !UUID_PATTERN.test(body.newFileId)
        ) {
          sendJson(response, 400, { error: 'Invalid asset or file ID' });
          return;
        }

        const result = await database.query<{
          new_status: string | null;
          old_file_exists: boolean;
          old_prefix_queued: boolean;
          old_prefix_is_prefix: boolean;
        }>(
          `SELECT new_file.status::text AS new_status,
                  old_file.id IS NOT NULL AS old_file_exists,
                  cleanup.id IS NOT NULL AS old_prefix_queued,
                  COALESCE(cleanup.is_prefix, false) AS old_prefix_is_prefix
           FROM (SELECT 1) AS anchor
           LEFT JOIN asset_files AS new_file
             ON new_file.asset_id = $1::uuid AND new_file.id = $3::uuid
           LEFT JOIN asset_files AS old_file
             ON old_file.asset_id = $1::uuid AND old_file.id = $2::uuid
           LEFT JOIN storage_cleanup_queue AS cleanup
             ON cleanup.object_key = 'assets/' || $1::text || '/' || $2::text || '/'
           WHERE EXISTS (SELECT 1 FROM assets WHERE id = $1::uuid)`,
          [body.assetId, body.oldFileId, body.newFileId],
        );
        const row = result.rows[0];
        if (!row) {
          sendJson(response, 404, { error: 'Asset not found in configured database' });
          return;
        }
        sendJson(response, 200, {
          newStatus: row.new_status,
          oldFileExists: row.old_file_exists,
          oldFileRemoved: !row.old_file_exists,
          oldPrefixQueued: row.old_prefix_queued,
          oldPrefixIsPrefix: row.old_prefix_is_prefix,
          oldFileStillExists: row.old_file_exists,
        });
        return;
      }
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      process.stderr.write(
        `Asset smoke local request failed: ${error instanceof Error ? error.name : 'UnknownError'}\n`,
      );
      sendJson(response, 500, { error: 'Smoke proxy or local inspection failed.' });
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
