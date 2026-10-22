const fileInput = document.querySelector('#file');
const typeInput = document.querySelector('#type');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const preview = document.querySelector('#preview');

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]?.type) typeInput.value = fileInput.files[0].type;
});

function addResult(name, passed, status, code, details) {
  const row = document.createElement('tr');
  row.className = passed ? 'pass' : 'fail';
  for (const value of [name, passed ? 'PASS' : 'FAIL', status, code, details]) {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.append(cell);
  }
  results.append(row);
}

async function responseErrorCode(response) {
  if (response.ok) return '-';
  const text = await response.text();
  return text.match(/<Code>([^<]+)<\/Code>/i)?.[1] || 'unknown';
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(body.message || body.errorCode || 'request failed'), {
      status: response.status,
      code: body.errorCode || 'unknown',
    });
  }
  return body;
}

async function cleanup() {
  return (await requestJson('/cleanup', { method: 'POST' })).deleted;
}

async function presign(size, type) {
  const query = new URLSearchParams({ size: String(size), type });
  return requestJson(`/presign?${query}`);
}

async function putFile(signed, body, contentType) {
  const headers = { ...signed.headers };
  if (contentType !== undefined) headers['Content-Type'] = contentType;
  const response = await fetch(signed.url, { method: 'PUT', headers, body });
  return { status: response.status, code: await responseErrorCode(response) };
}

function recordFailure(name, error) {
  addResult(
    name,
    false,
    error.status || 'no response',
    error.code || 'network/CORS',
    error.message,
  );
}

document.querySelector('#run').addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert('Choose a local file first.');
    return;
  }

  const type = typeInput.value.trim() || file.type || 'application/octet-stream';
  results.replaceChildren();
  preview.hidden = true;
  summary.textContent = 'signed content-length enforced from browser: no';
  let lengthEnforced = false;

  try {
    const signed = await presign(file.size, type);
    const upload = await putFile(signed, file, type);
    addResult(
      'a. Correct upload',
      upload.status === 200,
      upload.status,
      upload.code,
      'Expected HTTP 200',
    );
  } catch (error) {
    recordFailure('a. Correct upload', error);
  }

  try {
    const verified = await requestJson('/verify', { method: 'POST' });
    const metadataMatches =
      verified.head?.sizeBytes === file.size && verified.head.contentType === type;
    addResult(
      'b. Verify metadata and first bytes',
      Boolean(metadataMatches),
      200,
      '-',
      `size=${verified.head?.sizeBytes ?? 'missing'}, type=${verified.head?.contentType ?? 'missing'}, first 16 bytes=${verified.firstBytesHex ?? ''}`,
    );
  } catch (error) {
    recordFailure('b. Verify metadata and first bytes', error);
  }

  try {
    await cleanup();
    const signed = await presign(file.size, type);
    const result = await putFile(signed, new Blob([file, new Uint8Array([0])], { type }), type);
    lengthEnforced = result.status === 403 && result.code === 'SignatureDoesNotMatch';
    addResult(
      'c. Wrong size',
      lengthEnforced,
      result.status,
      result.code,
      'Expected HTTP 403 SignatureDoesNotMatch',
    );
  } catch (error) {
    recordFailure('c. Wrong size', error);
  }

  try {
    await cleanup();
    const signed = await presign(file.size, 'image/png');
    const result = await putFile(signed, file, 'text/plain');
    addResult(
      'd. Wrong Content-Type',
      result.status === 403 && result.code === 'SignatureDoesNotMatch',
      result.status,
      result.code,
      'Expected HTTP 403 SignatureDoesNotMatch',
    );
  } catch (error) {
    recordFailure('d. Wrong Content-Type', error);
  }
  summary.textContent = `signed content-length enforced from browser: ${lengthEnforced ? 'yes' : 'no'}`;

  try {
    await cleanup();
    const signed = await presign(file.size, type);
    const upload = await putFile(signed, file, type);
    if (upload.status !== 200) {
      throw Object.assign(new Error('Could not re-upload file for download checks'), upload);
    }

    const download = await requestJson('/download-url');
    const response = await fetch(download.url, { cache: 'no-store' });
    const downloadCode = await responseErrorCode(response.clone());
    const disposition = response.headers.get('Content-Disposition') || '';
    const dispositionValid = /^inline; filename="[^"\r\n]*"; filename\*=UTF-8''[^;\r\n]+$/.test(
      disposition,
    );
    const blob = await response.blob();
    const range = await fetch(download.url, {
      cache: 'no-store',
      headers: { Range: 'bytes=0-99' },
    });
    const rangeCode = await responseErrorCode(range.clone());
    const rangeBytes = await range.arrayBuffer();
    const passed =
      response.status === 200 &&
      dispositionValid &&
      range.status === 206 &&
      rangeBytes.byteLength === 100;
    addResult(
      'e. Download, disposition, and 100-byte range',
      passed,
      `${response.status} / range ${range.status}`,
      downloadCode !== '-' ? downloadCode : rangeCode,
      `Content-Disposition=${disposition || 'not exposed'}, range bytes=${rangeBytes.byteLength}, full size=${blob.size}`,
    );
    preview.src = download.url;
    preview.hidden = false;
  } catch (error) {
    recordFailure('e. Download, disposition, and 100-byte range', error);
  }

  try {
    const plain = await requestJson('/download-url');
    const response = await fetch(plain.plainUrl, { cache: 'no-store' });
    const code = await responseErrorCode(response);
    addResult(
      'f. Unsigned object GET',
      response.status === 403,
      response.status,
      code,
      'Expected HTTP 403',
    );
  } catch (error) {
    recordFailure('f. Unsigned object GET', error);
  }
});

document.querySelector('#cleanup').addEventListener('click', async () => {
  try {
    addResult('Cleanup button', true, 200, '-', `Deleted ${await cleanup()} object(s)`);
  } catch (error) {
    recordFailure('Cleanup button', error);
  }
});
