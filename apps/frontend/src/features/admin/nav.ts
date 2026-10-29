import {
  BookOpen,
  ClipboardList,
  CreditCard,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lock,
  School,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/lib/paths';

export interface NavChild {
  label: string;
  to: string;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to?: string;
  children?: NavChild[];
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
      {
        label: 'Schools',
        icon: School,
        to: PATHS.admin.schools,
        children: [
          { label: 'All schools', to: PATHS.admin.schools },
          { label: 'Add school', to: PATHS.admin.schoolNew },
          { label: 'Class sections', to: PATHS.admin.classSections },
          { label: 'Add class section', to: PATHS.admin.classSectionNew },
        ],
      },
      {
        label: 'Teachers',
        icon: GraduationCap,
        to: PATHS.admin.teachers,
        children: [
          { label: 'All teachers', to: PATHS.admin.teachers },
          { label: 'Add teacher', to: PATHS.admin.teacherNew },
        ],
      },
      {
        label: 'Students',
        icon: User,
        to: PATHS.admin.students,
        children: [
          { label: 'All students', to: PATHS.admin.students },
          { label: 'Add student', to: PATHS.admin.studentNew },
        ],
      },
      { label: 'Admins', icon: ShieldCheck, to: PATHS.admin.admins },
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
