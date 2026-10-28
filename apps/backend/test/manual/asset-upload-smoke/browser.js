const form = document.querySelector('#settings');
const results = document.querySelector('#results');
const cleanup = document.querySelector('#cleanup');
const previews = document.querySelector('#previews');
const SMOKE_PREFIX = '__assets-smoke__';
const createdAssets = [];
const createdCurriculum = { courseId: null, moduleId: null, lessonId: null };
let backend;
let cleanupFinished = false;

function report(name, passed, detail) {
  const item = document.createElement('li');
  item.className = passed ? 'pass' : 'fail';
  item.textContent = `${passed ? 'PASS' : 'FAIL'} — ${name}: ${detail}`;
  results.append(item);
}

function updateCleanupCommands() {
  cleanup.textContent = createdAssets.length
    ? createdAssets
        .map(({ objectKey }) => `aws s3 rm "s3://<bucket>/${objectKey}" --profile steamx-backend`)
        .join('\n')
    : 'No assets created yet.';
}

async function updateCleanupCommandsFromState() {
  const state = await getSmokeState();
  createdAssets.splice(
    0,
    createdAssets.length,
    ...state.assets.flatMap((asset) =>
      asset.objectKeys.map((objectKey) => ({ assetId: asset.id, objectKey })),
    ),
  );
  updateCleanupCommands();
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  if (response.status === 204) return {};
  const body = await response.json();
  expect(body && typeof body === 'object', 'Backend returned an invalid JSON response.');
  return body;
}

async function apiRequest(baseUrl, path, options = {}) {
  const response = await fetch('/api-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Smoke-Token': window.assetSmokeToken,
    },
    body: JSON.stringify({
      method: options.method || 'GET',
      path,
      ...(options.body ? { body: JSON.parse(options.body) } : {}),
    }),
  });
  const body = await readJson(response);
  return { response, body };
}

async function localRequest(path, { method = 'POST', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'X-Smoke-Token': window.assetSmokeToken,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await readJson(response) };
}

async function getSmokeState() {
  const { response, body } = await localRequest('/state', { method: 'GET' });
  expect(response.status === 200, 'Could not read the smoke state.');
  return body;
}

async function createUpload(baseUrl, type, mimeType, file, title) {
  const { response, body } = await apiRequest(baseUrl, '/api/v1/assets', {
    method: 'POST',
    body: JSON.stringify({
      type,
      title: `${SMOKE_PREFIX} ${title}`,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    }),
  });
  expect(response.status === 201, `Asset creation returned HTTP ${response.status}.`);
  expect(body.asset?.id && body.file?.id && body.upload?.url, 'Creation response is incomplete.');
  expect(body.file.status === 'UPLOADING', 'New file did not start in UPLOADING.');
  await updateCleanupCommandsFromState();
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

async function inspectReplacement(assetId, oldFileId, newFileId) {
  const response = await fetch('/inspect-replacement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Smoke-Token': window.assetSmokeToken,
    },
    body: JSON.stringify({ assetId, oldFileId, newFileId }),
  });
  const body = await readJson(response);
  expect(
    response.status === 200,
    body.error || `Database inspection returned HTTP ${response.status}.`,
  );
  return body;
}

async function replaceUpload(baseUrl, assetId, file) {
  const { response, body } = await apiRequest(baseUrl, `/api/v1/assets/${assetId}/files`, {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      mimeType: 'image/png',
      sizeBytes: file.size,
    }),
  });
  expect(response.status === 201, `Replacement creation returned HTTP ${response.status}.`);
  expect(body.asset?.id === assetId, 'Replacement changed the asset ID.');
  expect(body.file?.id && body.upload?.url, 'Replacement response is incomplete.');
  expect(body.file.status === 'UPLOADING', 'Replacement did not start in UPLOADING.');
  await updateCleanupCommandsFromState();
  return { fileId: body.file.id, upload: body.upload };
}

function assertNoSensitiveProperties(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveProperties);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    expect(
      !/(url|storagekey|playbackkey|uploadid|processingjobid|passwordhash)/i.test(key),
      `Response contains a forbidden property name: ${key}.`,
    );
    assertNoSensitiveProperties(nested);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

function richText(text) {
  return {
    format: 'tiptap',
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  };
}

function createPdfFile() {
  const bytes = '%PDF-1.4\n% assets smoke PDF\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n';
  return new File([bytes], `${SMOKE_PREFIX}sample.pdf`, { type: 'application/pdf' });
}

async function createCourseModuleLesson() {
  const course = await apiRequest(backend, '/api/v1/courses', {
    method: 'POST',
    body: JSON.stringify({ title: `${SMOKE_PREFIX} course` }),
  });
  expect(
    course.response.status === 201,
    `Course creation returned HTTP ${course.response.status}.`,
  );
  createdCurriculum.courseId = course.body.id;
  const module = await apiRequest(backend, `/api/v1/courses/${course.body.id}/modules`, {
    method: 'POST',
    body: JSON.stringify({ title: `${SMOKE_PREFIX} module` }),
  });
  expect(
    module.response.status === 201,
    `Module creation returned HTTP ${module.response.status}.`,
  );
  createdCurriculum.moduleId = module.body.id;
  const lesson = await apiRequest(backend, `/api/v1/modules/${module.body.id}/lessons`, {
    method: 'POST',
    body: JSON.stringify({ title: `${SMOKE_PREFIX} lesson` }),
  });
  expect(
    lesson.response.status === 201,
    `Lesson creation returned HTTP ${lesson.response.status}.`,
  );
  createdCurriculum.lessonId = lesson.body.id;
}

async function accessUrl(assetId) {
  const { response, body } = await apiRequest(backend, `/api/v1/assets/${assetId}/access`);
  expect(
    response.status === 200 && typeof body.url === 'string',
    'Asset access URL was not returned.',
  );
  return body.url;
}

function waitForMediaEvent(element, eventName, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${eventName} timed out.`)), timeoutMs);
    element.addEventListener(
      eventName,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    element.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('Media could not be loaded from S3.'));
      },
      { once: true },
    );
  });
}

async function renderContentAssets(assets) {
  previews.replaceChildren();
  const imageUrl = await accessUrl(assets.imageId);
  const image = document.createElement('img');
  image.alt = 'Lesson content image';
  const imageLoaded = waitForMediaEvent(image, 'load');
  image.src = imageUrl;
  previews.append(image);
  await imageLoaded;

  const videoUrl = await accessUrl(assets.videoId);
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  const videoMetadata = waitForMediaEvent(video, 'loadedmetadata');
  video.src = videoUrl;
  previews.append(video);
  await videoMetadata;
  expect(Number.isFinite(video.duration) && video.duration > 0, 'Video duration is unavailable.');
  const seeked = waitForMediaEvent(video, 'seeked');
  video.currentTime = Math.min(0.5, video.duration / 2);
  await seeked;

  const pdfUrl = await accessUrl(assets.pdfId);
  const pdfRange = await fetch(pdfUrl, { headers: { Range: 'bytes=0-63' } });
  expect(pdfRange.status === 206, `PDF Range request returned HTTP ${pdfRange.status}.`);
}

async function runLessonContentFlow(png, pngFile, mp4, pdf) {
  await createCourseModuleLesson();
  report('Curriculum setup', true, 'created a course, module, and lesson through the API.');

  const blocks = [
    { id: crypto.randomUUID(), type: 'RICH_TEXT', content: richText('Lesson introduction') },
    {
      id: crypto.randomUUID(),
      type: 'ACCORDION',
      content: { title: 'More information', body: richText('Accordion body') },
    },
    {
      id: crypto.randomUUID(),
      type: 'IMAGE',
      assetId: png.assetId,
      content: { alt: 'Smoke test image', caption: 'Image from S3' },
    },
    {
      id: crypto.randomUUID(),
      type: 'PDF',
      assetId: pdf.assetId,
      content: { caption: 'Smoke test PDF' },
    },
    {
      id: crypto.randomUUID(),
      type: 'VIDEO',
      assetId: mp4.assetId,
      content: { caption: 'Smoke test video' },
    },
    {
      id: crypto.randomUUID(),
      type: 'TWO_COLUMN',
      content: {},
      columns: [
        {
          id: crypto.randomUUID(),
          type: 'IMAGE',
          assetId: png.assetId,
          content: { alt: 'Image in first column' },
        },
        {
          id: crypto.randomUUID(),
          type: 'RICH_TEXT',
          content: richText('Text in second column'),
        },
      ],
    },
  ];
  const saved = await saveLessonContent(blocks, 0);
  expect(
    saved.response.status === 200 && saved.body.version === 1,
    'Content save did not return version 1.',
  );
  assertNoSensitiveProperties(saved.body);
  expect(!JSON.stringify(saved.body).includes('http'), 'Content save response contains a URL.');

  const initialRead = await apiRequest(
    backend,
    `/api/v1/lessons/${createdCurriculum.lessonId}/content`,
  );
  expect(initialRead.response.status === 200, 'Could not read the saved lesson content.');
  assertNoSensitiveProperties(initialRead.body);
  expect(
    stableJson(initialRead.body.blocks) === stableJson(blocks),
    'GET returned a different block tree.',
  );
  const assetIds = [png.assetId, pdf.assetId, mp4.assetId].sort((a, b) => a.localeCompare(b));
  expect(
    JSON.stringify(Object.keys(initialRead.body.assets).sort((a, b) => a.localeCompare(b))) ===
      JSON.stringify(assetIds),
    'Content read did not return exactly one summary per referenced asset.',
  );
  expect(
    Object.values(initialRead.body.assets).every((asset) => asset.file?.status === 'READY'),
    'At least one referenced asset is not READY.',
  );
  report(
    'Save/read lesson content',
    true,
    'version 1; six blocks; three unique READY asset summaries; no URL or storage-key fields.',
  );

  const roundTrip = await saveLessonContent(initialRead.body.blocks, initialRead.body.version);
  assertNoSensitiveProperties(roundTrip.body);
  expect(
    roundTrip.response.status === 200 && roundTrip.body.version === initialRead.body.version,
    'GET/PUT round trip changed the lesson content version.',
  );
  report('Lesson content round trip', true, 'saving the returned tree was a no-op.');

  const changedTree = structuredClone(initialRead.body.blocks);
  changedTree[0].content.doc.content[0].content[0].text = 'stale update';
  const stale = await saveLessonContent(changedTree, 0);
  assertNoSensitiveProperties(stale.body);
  expect(
    stale.response.status === 409 &&
      stale.body.code === 'VERSION_CONFLICT' &&
      stale.body.details?.currentVersion === initialRead.body.version,
    'Stale content save did not return VERSION_CONFLICT with the current version.',
  );
  const afterStale = await apiRequest(
    backend,
    `/api/v1/lessons/${createdCurriculum.lessonId}/content`,
  );
  assertNoSensitiveProperties(afterStale.body);
  expect(
    stableJson(afterStale.body.blocks) === stableJson(initialRead.body.blocks),
    'Stale content save changed the saved tree.',
  );
  report(
    'Stale content version',
    true,
    'received 409 VERSION_CONFLICT and the saved tree stayed unchanged.',
  );

  await renderContentAssets({ imageId: png.assetId, videoId: mp4.assetId, pdfId: pdf.assetId });
  report(
    'S3 assets in lesson content',
    true,
    'image rendered, video metadata loaded and seeked, PDF Range returned 206.',
  );

  const replacement = await replaceUpload(backend, png.assetId, pngFile);
  await uploadToStorage(replacement.upload, pngFile, 'image/png');
  const replacementComplete = await complete(backend, png.assetId, replacement.fileId);
  expect(
    replacementComplete.response.status === 200 && replacementComplete.body.status === 'READY',
    'In-use image replacement did not complete as READY.',
  );
  const afterReplacement = await apiRequest(
    backend,
    `/api/v1/lessons/${createdCurriculum.lessonId}/content`,
  );
  assertNoSensitiveProperties(afterReplacement.body);
  const replacementDetail = await apiRequest(backend, `/api/v1/assets/${png.assetId}`);
  expect(
    stableJson(afterReplacement.body.blocks) === stableJson(initialRead.body.blocks) &&
      afterReplacement.body.assets[png.assetId]?.file?.originalFilename === pngFile.name &&
      replacementDetail.body.file?.id === replacement.fileId,
    'Replacing the in-use image changed content blocks or did not update its file summary.',
  );
  report(
    'Replace image used in lesson',
    true,
    'block tree stayed the same; the content summary reflects the new file and asset GET confirms its ID.',
  );

  const inUseDelete = await deleteAsset(png.assetId);
  expect(
    inUseDelete.response.status === 409 && inUseDelete.body.code === 'RESOURCE_IN_USE',
    'Deleting an asset still referenced by lesson content did not return 409 RESOURCE_IN_USE.',
  );
  const withoutImage = afterReplacement.body.blocks
    .filter((block) => block.type !== 'IMAGE')
    .map((block) =>
      block.type === 'TWO_COLUMN' ? { ...block, columns: [null, block.columns[1]] } : block,
    );
  const unlinked = await saveLessonContent(withoutImage, afterReplacement.body.version);
  assertNoSensitiveProperties(unlinked.body);
  expect(unlinked.response.status === 200, 'Could not save lesson content without its image.');
  const deletedImage = await deleteAsset(png.assetId);
  expect(deletedImage.response.status === 204, 'Image asset could not be deleted after unlinking.');
  report(
    'Delete asset in use',
    true,
    'in-use deletion returned 409; after removing references deletion returned 204.',
  );
}

async function saveLessonContent(blocks, expectedVersion, lessonId = createdCurriculum.lessonId) {
  return apiRequest(backend, `/api/v1/lessons/${lessonId}/content`, {
    method: 'PUT',
    body: JSON.stringify({ blocks, expectedVersion }),
  });
}

async function deleteAsset(assetId) {
  return apiRequest(backend, `/api/v1/assets/${assetId}`, { method: 'DELETE' });
}

async function cleanupRun() {
  const state = await getSmokeState();
  if (state.activeLessonIds?.length) {
    const lessonId = state.activeLessonIds[state.activeLessonIds.length - 1];
    const { response: readResponse, body: content } = await apiRequest(
      backend,
      `/api/v1/lessons/${lessonId}/content`,
    );
    expect(readResponse.status === 200, 'Could not read lesson content before cleanup.');
    const cleared = await saveLessonContent([], content.version, lessonId);
    expect(cleared.response.status === 200, 'Could not clear lesson content during cleanup.');
    const deleted = await apiRequest(backend, `/api/v1/lessons/${lessonId}`, {
      method: 'DELETE',
    });
    expect(deleted.response.status === 204, 'Could not delete the smoke lesson.');
  }
  const afterLesson = await getSmokeState();
  for (const moduleId of [...(afterLesson.activeModuleIds || [])].reverse()) {
    const deleted = await apiRequest(backend, `/api/v1/modules/${moduleId}`, { method: 'DELETE' });
    expect(deleted.response.status === 204, 'Could not delete the smoke module.');
  }
  const afterModule = await getSmokeState();
  for (const courseId of [...(afterModule.activeCourseIds || [])].reverse()) {
    const deleted = await apiRequest(backend, `/api/v1/courses/${courseId}`, { method: 'DELETE' });
    expect(deleted.response.status === 204, 'Could not delete the smoke course.');
  }
  const afterCourse = await getSmokeState();
  for (const assetId of [...(afterCourse.activeAssetIds || [])].reverse()) {
    const deleted = await deleteAsset(assetId);
    expect(deleted.response.status === 204, `Could not delete asset ${assetId}.`);
  }
  const cleanupResult = await localRequest('/cleanup-objects');
  expect(
    cleanupResult.response.status === 200,
    cleanupResult.body.error || `S3 cleanup returned HTTP ${cleanupResult.response.status}.`,
  );
  cleanupFinished = true;
  report(
    'Cleanup',
    true,
    `${cleanupResult.body.assetCount} assets, ${cleanupResult.body.lessonCount} lessons, ${cleanupResult.body.moduleCount} modules, ${cleanupResult.body.courseCount} courses, ${cleanupResult.body.objectCount} S3 objects removed.`,
  );
  previews.replaceChildren();
  await updateCleanupCommandsFromState();
}

async function expectAccessContent(baseUrl, assetId, expectedFile) {
  const { response, body } = await apiRequest(baseUrl, `/api/v1/assets/${assetId}/access`);
  expect(response.status === 200 && body.url, 'Asset access did not return a signed URL.');
  expect(
    response.headers.get('cache-control') === 'no-store',
    'Asset access response did not set Cache-Control: no-store.',
  );
  const fileResponse = await fetch(body.url);
  expect(fileResponse.ok, `Signed file request returned HTTP ${fileResponse.status}.`);
  const actual = new Uint8Array(await fileResponse.arrayBuffer());
  const expected = new Uint8Array(await expectedFile.arrayBuffer());
  expect(
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index]),
    'Signed URL did not return the expected file contents.',
  );
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  results.replaceChildren();
  createdAssets.length = 0;
  createdCurriculum.courseId = null;
  createdCurriculum.moduleId = null;
  createdCurriculum.lessonId = null;
  cleanupFinished = false;
  previews.replaceChildren();
  updateCleanupCommands();

  const baseUrl = document.querySelector('#backend-url').value.trim().replace(/\/+$/, '');
  const steamxId = document.querySelector('#steamx-id').value.trim();
  const passwordInput = document.querySelector('#password');
  const password = passwordInput.value;
  const pngFile = document.querySelector('#png-file').files[0];
  const replacementPngFile = document.querySelector('#replacement-png-file').files[0];
  const mp4File = document.querySelector('#mp4-file').files[0];
  const runButton = document.querySelector('#run');
  const cleanupButton = document.querySelector('#cleanup-run');
  runButton.disabled = true;
  cleanupButton.disabled = true;

  try {
    expect(pngFile && replacementPngFile && mp4File, 'Select both PNGs and an MP4 file.');
    expect(
      window.location.protocol === 'http:' || window.location.protocol === 'https:',
      'Unsupported page protocol.',
    );
    backend = new URL(baseUrl);
    expect(
      ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname) &&
        ['http:', 'https:'].includes(backend.protocol),
      'Backend URL must point to localhost or a loopback IP address.',
    );
    const begin = await localRequest('/begin');
    expect(
      begin.response.status === 200,
      begin.body.error || `Could not start smoke run (HTTP ${begin.response.status}).`,
    );
    const configured = await localRequest('/configure-backend', {
      body: { backendUrl: backend.toString() },
    });
    expect(configured.response.status === 200, 'Could not configure the local smoke proxy.');

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
      'session cookie stays in the local proxy and is not displayed or stored by this page.',
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

    const replacement = await replaceUpload(backend, png.assetId, replacementPngFile);
    const whileUploading = await apiRequest(backend, `/api/v1/assets/${png.assetId}`);
    expect(
      whileUploading.response.status === 200 &&
        whileUploading.body.file?.id === png.fileId &&
        whileUploading.body.file?.status === 'READY',
      'The previous READY PNG stopped serving during replacement upload.',
    );
    await expectAccessContent(backend, png.assetId, pngFile);
    await uploadToStorage(replacement.upload, replacementPngFile, 'image/png');
    const replacementComplete = await complete(backend, png.assetId, replacement.fileId);
    expect(
      replacementComplete.response.status === 200 && replacementComplete.body.status === 'READY',
      'PNG replacement did not complete as READY.',
    );
    const replacementDetail = await apiRequest(backend, `/api/v1/assets/${png.assetId}`);
    expect(
      replacementDetail.response.status === 200 &&
        replacementDetail.body.file?.id === replacement.fileId &&
        replacementDetail.body.file?.status === 'READY',
      'GET asset did not return the replacement READY file.',
    );
    const replacementState = await inspectReplacement(png.assetId, png.fileId, replacement.fileId);
    expect(
      replacementState.newStatus === 'READY' &&
        replacementState.oldFileRemoved &&
        replacementState.oldPrefixQueued &&
        replacementState.oldPrefixIsPrefix,
      'Database did not show the old row removed and its prefix queued.',
    );
    await expectAccessContent(backend, png.assetId, replacementPngFile);
    report(
      'PNG replacement',
      true,
      'old READY file served until completion; replacement is now READY and the old prefix is queued.',
    );

    const invalidBytes = new Blob(['This is not a PNG file.'], { type: 'image/png' });
    const invalidFile = new File([invalidBytes], 'not-a-png.png', { type: 'image/png' });
    const failedReplacement = await replaceUpload(backend, png.assetId, invalidFile);
    await uploadToStorage(failedReplacement.upload, invalidFile, 'image/png');
    const failedComplete = await complete(backend, png.assetId, failedReplacement.fileId);
    expect(
      failedComplete.response.status === 200 &&
        failedComplete.body.status === 'FAILED' &&
        failedComplete.body.lastError === 'CONTENT_NOT_RECOGNIZED',
      'Invalid replacement signature did not fail with CONTENT_NOT_RECOGNIZED.',
    );
    const stillCurrent = await apiRequest(backend, `/api/v1/assets/${png.assetId}`);
    expect(
      stillCurrent.response.status === 200 &&
        stillCurrent.body.file?.id === replacement.fileId &&
        stillCurrent.body.file?.status === 'READY',
      'A failed replacement displaced the current READY file.',
    );
    await expectAccessContent(backend, png.assetId, replacementPngFile);
    const failedState = await inspectReplacement(
      png.assetId,
      replacement.fileId,
      failedReplacement.fileId,
    );
    expect(
      failedState.newStatus === 'FAILED' &&
        failedState.oldFileStillExists &&
        !failedState.oldPrefixQueued,
      'Failed replacement removed or queued the current READY file.',
    );
    report(
      'Failed replacement',
      true,
      'invalid signature became FAILED; previous READY file remains current and unqueued.',
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

    const pdfFile = createPdfFile();
    const pdf = await createUpload(
      backend,
      'PDF',
      'application/pdf',
      pdfFile,
      'Asset upload smoke PDF',
    );
    await uploadToStorage(pdf.upload, pdfFile, 'application/pdf');
    const pdfComplete = await complete(backend, pdf.assetId, pdf.fileId);
    expect(
      pdfComplete.response.status === 200 && pdfComplete.body.status === 'READY',
      'PDF did not complete as READY.',
    );
    report('PDF upload and completion', true, 'direct S3 upload completed to READY.');

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
    await runLessonContentFlow(png, pngFile, mp4, pdf);
    await cleanupRun();
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
    if (!cleanupFinished && backend) {
      try {
        await cleanupRun();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cleanup failed.';
        report('Cleanup', false, message);
      }
    }
    runButton.disabled = false;
    cleanupButton.disabled = false;
  }
});

document.querySelector('#cleanup-run').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    expect(backend, 'Run the smoke test once before cleanup.');
    await cleanupRun();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed.';
    report('Cleanup', false, message);
  } finally {
    button.disabled = false;
  }
});
