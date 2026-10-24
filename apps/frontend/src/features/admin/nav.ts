import {
  BookOpen,
  ClipboardList,
  CreditCard,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lock,
  School,
  User,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/lib/paths';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to?: string;
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  { id: 'main', items: [{ label: 'Dashboard', icon: LayoutGrid, to: PATHS.admin.dashboard }] },
  {
    id: 'people',
    label: 'People',
    items: [
      { label: 'Schools', icon: School, to: PATHS.admin.schools },
      { label: 'Teachers', icon: GraduationCap, to: PATHS.admin.teachers },
      { label: 'Students', icon: User },
      { label: 'Credential Resets', icon: Lock },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { label: 'Courses & Lessons', icon: BookOpen },
      { label: 'Curriculum Access', icon: KeyRound },
      { label: 'Assignments', icon: ClipboardList },
    ],
  },
  { id: 'billing', label: 'Billing', items: [{ label: 'Subscriptions', icon: CreditCard }] },
];
