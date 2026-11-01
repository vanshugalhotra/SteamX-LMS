import {
  BookOpen,
  ClipboardList,
  CreditCard,
  FileImage,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Lock,
  Plus,
  School,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/lib/paths';

export interface NavChild {
  label: string;
  to: string;
  icon: LucideIcon;
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
          { label: 'View schools', to: PATHS.admin.schools, icon: School },
          { label: 'Add school', to: PATHS.admin.schoolNew, icon: Plus },
          { label: 'Classes', to: PATHS.admin.classSections, icon: LayoutGrid },
          { label: 'Add class', to: PATHS.admin.classSectionNew, icon: Plus },
        ],
      },
      {
        label: 'Teachers',
        icon: GraduationCap,
        to: PATHS.admin.teachers,
        children: [
          { label: 'View teachers', to: PATHS.admin.teachers, icon: GraduationCap },
          { label: 'Add teacher', to: PATHS.admin.teacherNew, icon: Plus },
        ],
      },
      {
        label: 'Students',
        icon: User,
        to: PATHS.admin.students,
        children: [
          { label: 'View students', to: PATHS.admin.students, icon: User },
          { label: 'Add student', to: PATHS.admin.studentNew, icon: Plus },
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
      { label: 'Asset Library', icon: FileImage, to: PATHS.admin.assets },
      { label: 'Curriculum Access', icon: KeyRound },
      { label: 'Assignments', icon: ClipboardList },
    ],
  },
  { id: 'billing', label: 'Billing', items: [{ label: 'Subscriptions', icon: CreditCard }] },
];
