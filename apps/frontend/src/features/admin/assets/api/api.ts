import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { ASSET_ENDPOINTS } from './endpoints';
import type {
  Asset,
  AssetAccess,
  AssetDetail,
  AssetFile,
  AssetListParams,
  AssetStatus,
  AssetUploadRequest,
  CreateAssetPayload,
  RequestAssetFileUploadPayload,
  UpdateAssetPayload,
} from '../model/types';

export function buildAssetListSearchParams(params: AssetListParams) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.type) search.set('type', params.type);
  if (params.status) search.set('status', params.status);
  if (params.fileStatus) search.set('fileStatus', params.fileStatus);
  if (params.search) search.set('search', params.search);
  return search;
}

/** GET /assets */
export function fetchAssets(params: AssetListParams) {
  const search = buildAssetListSearchParams(params);
  return apiFetch<Paginated<Asset>>(`${ASSET_ENDPOINTS.list}?${search.toString()}`);
}

/** GET /assets/:id */
export function fetchAsset(id: string) {
  return apiFetch<AssetDetail>(ASSET_ENDPOINTS.byId(id));
}

/** GET /assets/:id/access */
export function fetchAssetAccess(id: string) {
  return apiFetch<AssetAccess>(ASSET_ENDPOINTS.access(id));
}

/** POST /assets */
export function createAsset(payload: CreateAssetPayload) {
  return apiFetch<AssetUploadRequest>(ASSET_ENDPOINTS.list, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /assets/:id */
export function updateAsset(id: string, payload: UpdateAssetPayload) {
  return apiFetch<Asset>(ASSET_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /assets/:id/status */
export function updateAssetStatus(id: string, status: AssetStatus) {
  return apiFetch<Asset>(ASSET_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** DELETE /assets/:id */
export function deleteAsset(id: string) {
  return apiFetch<null>(ASSET_ENDPOINTS.byId(id), { method: 'DELETE' });
}

/** POST /assets/:id/files */
export function requestAssetFileUpload(id: string, payload: RequestAssetFileUploadPayload) {
  return apiFetch<AssetUploadRequest>(ASSET_ENDPOINTS.files(id), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** GET /assets/:id/files/:fileId */
export function fetchAssetFile(id: string, fileId: string) {
  return apiFetch<AssetFile>(ASSET_ENDPOINTS.file(id, fileId));
}

/** POST /assets/:id/files/:fileId/complete */
export function completeAssetFileUpload(id: string, fileId: string) {
  return apiFetch<AssetFile>(ASSET_ENDPOINTS.complete(id, fileId), { method: 'POST' });
}
