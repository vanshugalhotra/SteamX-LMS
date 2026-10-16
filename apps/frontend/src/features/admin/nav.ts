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
import { ADMIN_PATHS } from './paths';

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
  { id: 'main', items: [{ label: 'Dashboard', icon: LayoutGrid, to: ADMIN_PATHS.dashboard }] },
  {
    id: 'people',
    label: 'People',
    items: [
      { label: 'Schools', icon: School },
      { label: 'Teachers', icon: GraduationCap },
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
