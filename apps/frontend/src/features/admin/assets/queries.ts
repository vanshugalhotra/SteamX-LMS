import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  completeAssetFileUpload,
  createAsset,
  deleteAsset,
  fetchAsset,
  fetchAssetAccess,
  fetchAssetFile,
  fetchAssets,
  requestAssetFileUpload,
  updateAsset,
  updateAssetStatus,
} from './api/api';
import type {
  AssetListParams,
  AssetStatus,
  CreateAssetPayload,
  RequestAssetFileUploadPayload,
  UpdateAssetPayload,
} from './model/types';

export const assetKeys = {
  all: ['assets'] as const,
  list: (params: AssetListParams) => [...assetKeys.all, 'list', params] as const,
  detail: (id: string) => [...assetKeys.all, 'detail', id] as const,
  access: (id: string) => [...assetKeys.all, 'access', id] as const,
  file: (id: string, fileId: string) => [...assetKeys.all, 'file', id, fileId] as const,
};

export function assetsQueryOptions(params: AssetListParams) {
  return queryOptions({
    queryKey: assetKeys.list(params),
    queryFn: () => fetchAssets(params),
    placeholderData: keepPreviousData,
  });
}

export function useAssets(params: AssetListParams) {
  return useQuery(assetsQueryOptions(params));
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: () => fetchAsset(id),
    enabled: id !== '',
  });
}

export function useAssetAccess(id: string) {
  return useQuery({
    queryKey: assetKeys.access(id),
    queryFn: () => fetchAssetAccess(id),
    enabled: id !== '',
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useAssetFile(id: string, fileId: string) {
  return useQuery({
    queryKey: assetKeys.file(id, fileId),
    queryFn: () => fetchAssetFile(id, fileId),
    enabled: id !== '' && fileId !== '',
  });
}

function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: assetKeys.all });
}

export function useCreateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (payload: CreateAssetPayload) => createAsset(payload),
    onSuccess: invalidate,
  });
}

export function useRequestAssetFileUpload() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RequestAssetFileUploadPayload }) =>
      requestAssetFileUpload(id, body),
    onSuccess: invalidate,
  });
}

export function useCompleteAssetFileUpload() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, fileId }: { id: string; fileId: string }) =>
      completeAssetFileUpload(id, fileId),
    onSuccess: invalidate,
  });
}

export function useUpdateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAssetPayload }) => updateAsset(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAssetStatus() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AssetStatus }) =>
      updateAssetStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({ mutationFn: deleteAsset, onSuccess: invalidate });
}
