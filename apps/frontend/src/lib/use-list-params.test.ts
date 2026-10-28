import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListParams } from './use-list-params';

describe('useListParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on page 1', () => {
    const { result } = renderHook(() => useListParams('ALL'));
    expect(result.current.page).toBe(1);
  });

  it('resets to page 1 when the debounced search changes', () => {
    const { result } = renderHook(() => useListParams('ALL'));

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);

    act(() => {
      result.current.setSearch('maths');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.q).toBe('maths');
    expect(result.current.page).toBe(1);
  });

  it('resets to page 1 when the filter changes', () => {
    const { result } = renderHook(() => useListParams<'ALL' | 'ACTIVE'>('ALL'));

    act(() => {
      result.current.setPage(2);
    });
    act(() => {
      result.current.setFilter('ACTIVE');
    });

    expect(result.current.page).toBe(1);
  });

  it('keeps the page when nothing changes', () => {
    const { result } = renderHook(() => useListParams('ALL'));

    act(() => {
      result.current.setPage(2);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.page).toBe(2);
  });
});
