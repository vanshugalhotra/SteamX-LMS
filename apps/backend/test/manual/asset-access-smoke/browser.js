const form = document.querySelector('#settings');
const result = document.querySelector('#result');
const preview = document.querySelector('#preview');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`Expected a JSON response; received HTTP ${response.status}.`);
  }
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
  return { response, body: await readJson(response) };
}

function showPreview(type, url) {
  preview.replaceChildren();

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open asset in a new tab';
  preview.append(link);

  if (type === 'IMAGE') {
    const image = document.createElement('img');
    image.alt = 'Asset image preview';
    image.src = url;
    image.addEventListener('error', () => {
      result.textContent =
        'Preview failed to load. Check that the S3 object still exists and the URL is valid.';
      result.className = 'fail';
    });
    preview.append(image);
  } else if (type === 'VIDEO') {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    video.addEventListener('error', () => {
      result.textContent =
        'Video failed to load. Check that the S3 object still exists and the URL is valid.';
      result.className = 'fail';
    });
    preview.append(video);
  } else if (type === 'PDF') {
    const frame = document.createElement('iframe');
    frame.title = 'PDF preview';
    frame.src = url;
    preview.append(frame);
  } else {
    throw new Error(`Unsupported asset type: ${type}.`);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const runButton = document.querySelector('#run');
  const passwordInput = document.querySelector('#password');
  const baseUrl = document.querySelector('#backend-url').value.trim().replace(/\/+$/, '');
  const steamxId = document.querySelector('#steamx-id').value.trim();
  const password = passwordInput.value;
  const assetId = document.querySelector('#asset-id').value.trim();
  runButton.disabled = true;
  result.textContent = 'Requesting access URL...';
  result.className = '';
  preview.replaceChildren();

  try {
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
    passwordInput.value = '';

    const access = await apiRequest(
      backend,
      `/api/v1/assets/${encodeURIComponent(assetId)}/access`,
    );
    expect(
      access.response.status === 200,
      `Access request returned HTTP ${access.response.status}${access.body.code ? ` (${access.body.code})` : ''}.`,
    );
    expect(
      Object.keys(access.body).sort().join(',') === 'expiresAt,mimeType,type,url',
      'Access response fields did not match the documented contract.',
    );
    expect(
      access.response.headers.get('cache-control') === 'no-store',
      'Access response did not include Cache-Control: no-store.',
    );
    expect(typeof access.body.url === 'string', 'Access response did not contain a URL.');
    expect(
      Number.isNaN(Date.parse(access.body.expiresAt)) === false,
      'Expiry is not a valid date.',
    );

    const range = await fetch(access.body.url, { headers: { Range: 'bytes=0-99' } });
    expect(
      range.status === 206,
      `S3 range request returned HTTP ${range.status}; check the object exists and the signed URL is valid.`,
    );

    const ttlSeconds = Math.round((Date.parse(access.body.expiresAt) - Date.now()) / 1_000);
    result.textContent = `PASS — ${access.body.type} (${access.body.mimeType}); range: 206; expires in about ${ttlSeconds}s; Cache-Control: no-store.`;
    result.className = 'pass';
    showPreview(access.body.type, access.body.url);
  } catch (error) {
    passwordInput.value = '';
    result.textContent = error instanceof Error ? error.message : 'Unexpected smoke-test error.';
    result.className = 'fail';
    if (result.textContent.includes('Failed to fetch')) {
      result.textContent += ` Check backend CORS_ORIGINS and S3 CORS for ${window.location.origin}.`;
    }
  } finally {
    runButton.disabled = false;
  }
});
