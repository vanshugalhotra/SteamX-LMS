const form = document.querySelector('#settings');
const results = document.querySelector('#results');
const cleanup = document.querySelector('#cleanup');
const createdAssets = [];

function report(name, passed, detail) {
  const item = document.createElement('li');
  item.className = passed ? 'pass' : 'fail';
  item.textContent = `${passed ? 'PASS' : 'FAIL'} — ${name}: ${detail}`;
  results.append(item);
}

function updateCleanupCommands() {
  cleanup.textContent = createdAssets.length
    ? createdAssets
        .map(
          ({ assetId }) =>
            `aws s3 rm "s3://<bucket>/assets/${assetId}/" --recursive --profile steamx-backend`,
        )
        .join('\n')
    : 'No assets created yet.';
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const body = await response.json();
  expect(body && typeof body === 'object', 'Backend returned an invalid JSON response.');
  return body;
}

async function apiRequest(baseUrl, path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await readJson(response);
  return { response, body };
}

async function createUpload(baseUrl, type, mimeType, file, title) {
  const { response, body } = await apiRequest(baseUrl, '/api/v1/assets', {
    method: 'POST',
    body: JSON.stringify({
      type,
      title,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    }),
  });
  expect(response.status === 201, `Asset creation returned HTTP ${response.status}.`);
  expect(body.asset?.id && body.file?.id && body.upload?.url, 'Creation response is incomplete.');
  expect(body.file.status === 'UPLOADING', 'New file did not start in UPLOADING.');
  createdAssets.push({ assetId: body.asset.id, fileId: body.file.id });
  updateCleanupCommands();
  return { assetId: body.asset.id, fileId: body.file.id, upload: body.upload };
}

async function getFile(baseUrl, assetId, fileId) {
  const { response, body } = await apiRequest(baseUrl, `/api/v1/assets/${assetId}/files/${fileId}`);
  expect(response.status === 200, `File state returned HTTP ${response.status}.`);
  return body;
}

async function complete(baseUrl, assetId, fileId) {
  return apiRequest(baseUrl, `/api/v1/assets/${assetId}/files/${fileId}/complete`, {
    method: 'POST',
  });
}

async function uploadToStorage(upload, file, contentType) {
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  expect(
    response.status >= 200 && response.status < 300,
    `S3 PUT returned HTTP ${response.status}.`,
  );
  if (contentType && upload.headers['Content-Type'] !== contentType) {
    throw new Error('Upload instruction Content-Type does not match the requested MIME type.');
  }
}

async function tryWrongSizeUpload(upload, file) {
  return fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: new Blob([file, new Uint8Array([0])], { type: 'image/png' }),
  });
}

async function inspectVideo(assetId, fileId) {
  const response = await fetch('/inspect-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Smoke-Token': window.assetSmokeToken,
    },
    body: JSON.stringify({ assetId, fileId }),
  });
  const body = await readJson(response);
  expect(
    response.status === 200,
    body.error || `Database inspection returned HTTP ${response.status}.`,
  );
  return body;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  results.replaceChildren();
  createdAssets.length = 0;
  updateCleanupCommands();

  const baseUrl = document.querySelector('#backend-url').value.trim().replace(/\/+$/, '');
  const steamxId = document.querySelector('#steamx-id').value.trim();
  const passwordInput = document.querySelector('#password');
  const password = passwordInput.value;
  const pngFile = document.querySelector('#png-file').files[0];
  const mp4File = document.querySelector('#mp4-file').files[0];
  const runButton = document.querySelector('#run');
  runButton.disabled = true;

  try {
    expect(pngFile && mp4File, 'Select both a PNG and an MP4 file.');
    expect(
      window.location.protocol === 'http:' || window.location.protocol === 'https:',
      'Unsupported page protocol.',
    );
    const backend = new URL(baseUrl);
    expect(
      ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname) &&
        ['http:', 'https:'].includes(backend.protocol),
      'Backend URL must point to localhost or a loopback IP address.',
    );

    const login = await apiRequest(backend, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ steamxId, password }),
    });
    expect(
      login.response.status === 200,
      `Login returned HTTP ${login.response.status}${login.body.code ? ` (${login.body.code})` : ''}.`,
    );
    report(
      'Admin login',
      true,
      'session cookie was set; it is not displayed or stored by this page.',
    );
    passwordInput.value = '';

    const png = await createUpload(
      backend,
      'IMAGE',
      'image/png',
      pngFile,
      'Asset upload smoke PNG',
    );
    expect(
      (await getFile(backend, png.assetId, png.fileId)).status === 'UPLOADING',
      'PNG was not UPLOADING.',
    );
    const early = await complete(backend, png.assetId, png.fileId);
    expect(
      early.response.status === 409 && early.body.code === 'UPLOAD_NOT_COMPLETE',
      `Complete before upload returned HTTP ${early.response.status} (${early.body.code || 'no error code'}).`,
    );
    expect(
      (await getFile(backend, png.assetId, png.fileId)).status === 'UPLOADING',
      'Early completion changed file status.',
    );
    report('Retry before upload', true, 'received 409 UPLOAD_NOT_COMPLETE and remained UPLOADING.');

    await uploadToStorage(png.upload, pngFile, 'image/png');
    const pngComplete = await complete(backend, png.assetId, png.fileId);
    expect(
      pngComplete.response.status === 200 && pngComplete.body.status === 'READY',
      'PNG did not complete as READY.',
    );
    const pngRepeat = await complete(backend, png.assetId, png.fileId);
    expect(
      pngRepeat.response.status === 200 && pngRepeat.body.status === 'READY',
      'Repeated completion changed PNG state.',
    );
    report(
      'PNG upload and completion',
      true,
      'direct S3 upload completed to READY; repeat completion stayed READY.',
    );

    const mp4 = await createUpload(
      backend,
      'VIDEO',
      'video/mp4',
      mp4File,
      'Asset upload smoke MP4',
    );
    await uploadToStorage(mp4.upload, mp4File, 'video/mp4');
    const mp4Complete = await complete(backend, mp4.assetId, mp4.fileId);
    expect(
      mp4Complete.response.status === 200 && mp4Complete.body.status === 'READY',
      'MP4 did not complete as READY.',
    );
    const inspected = await inspectVideo(mp4.assetId, mp4.fileId);
    expect(
      inspected.status === 'READY' && inspected.playbackMatchesStorage === true,
      'Database did not show playback_key equal to storage_key for the READY MP4.',
    );
    report(
      'MP4 upload and playback key',
      true,
      'READY; playback_key equals storage_key in the configured database.',
    );

    const wrongSize = await createUpload(
      backend,
      'IMAGE',
      'image/png',
      pngFile,
      'Asset upload smoke size mismatch',
    );
    const wrongSizeUpload = await tryWrongSizeUpload(wrongSize.upload, pngFile);
    if (wrongSizeUpload.ok) {
      const mismatchComplete = await complete(backend, wrongSize.assetId, wrongSize.fileId);
      expect(
        mismatchComplete.response.status === 200 &&
          mismatchComplete.body.status === 'FAILED' &&
          mismatchComplete.body.lastError === 'SIZE_MISMATCH',
        `Accepted wrong-size upload did not fail with SIZE_MISMATCH (HTTP ${mismatchComplete.response.status}, ${mismatchComplete.body.lastError}).`,
      );
      report(
        'Wrong-size body',
        true,
        'S3 accepted it; completion marked FAILED with SIZE_MISMATCH.',
      );
    } else {
      const earlyComplete = await complete(backend, wrongSize.assetId, wrongSize.fileId);
      expect(
        earlyComplete.response.status === 409 && earlyComplete.body.code === 'UPLOAD_NOT_COMPLETE',
        `S3 rejected the wrong-size upload, but completion returned HTTP ${earlyComplete.response.status}.`,
      );
      report(
        'Wrong-size body',
        true,
        `S3 rejected it with HTTP ${wrongSizeUpload.status}; no object was created and completion remained retryable.`,
      );
    }

    const invalidBytes = new Blob(['This is not a PNG file.'], { type: 'image/png' });
    const invalidFile = new File([invalidBytes], 'not-a-png.png', { type: 'image/png' });
    const invalid = await createUpload(
      backend,
      'IMAGE',
      'image/png',
      invalidFile,
      'Asset upload smoke invalid signature',
    );
    await uploadToStorage(invalid.upload, invalidFile, 'image/png');
    const invalidComplete = await complete(backend, invalid.assetId, invalid.fileId);
    expect(
      invalidComplete.response.status === 200 &&
        invalidComplete.body.status === 'FAILED' &&
        invalidComplete.body.lastError === 'CONTENT_NOT_RECOGNIZED',
      `Invalid signature did not fail safely: HTTP ${invalidComplete.response.status}, status ${invalidComplete.body.status}, code ${invalidComplete.body.lastError}.`,
    );
    report('Invalid signature rejection', true, 'returned FAILED with CONTENT_NOT_RECOGNIZED.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected smoke-test error.';
    report('Smoke run', false, message);
    if (message.includes('Failed to fetch')) {
      report(
        'Connection hint',
        false,
        `Check backend URL, backend CORS_ORIGINS, and S3 CORS for ${window.location.origin}.`,
      );
    }
  } finally {
    passwordInput.value = '';
    runButton.disabled = false;
  }
});
