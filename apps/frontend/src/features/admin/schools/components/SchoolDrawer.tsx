import { Drawer } from '@/components/ui/drawer';
import type { School } from '../api/api';
import { SchoolForm } from './SchoolForm';

interface SchoolDrawerProps {
  school?: School;
  onClose: () => void;
}

export function SchoolDrawer({ school, onClose }: SchoolDrawerProps) {
  return (
    <Drawer title={school ? 'Edit school' : 'Add school'} onClose={onClose}>
      <SchoolForm school={school} onDone={onClose} />
    </Drawer>
  );
}
