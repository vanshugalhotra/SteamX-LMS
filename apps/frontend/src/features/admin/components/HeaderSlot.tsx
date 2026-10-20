import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router';
import type { AdminOutletContext } from './AdminLayout';

/** Renders its children inside the admin header (left side). */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const { headerSlot } = useOutletContext<AdminOutletContext>();
  return headerSlot ? createPortal(children, headerSlot) : null;
}
