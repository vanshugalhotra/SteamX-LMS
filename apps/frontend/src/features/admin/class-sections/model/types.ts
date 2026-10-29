export interface ClassSection {
  id: string;
  schoolId: string;
  className: string;
  sectionName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClassSectionPayload {
  schoolId: string;
  className: string;
  sectionName?: string;
}

export interface UpdateClassSectionPayload {
  className?: string;
  sectionName?: string;
}

export const classSectionLabel = (c: Pick<ClassSection, 'className' | 'sectionName'>) =>
  `${c.className} - ${c.sectionName}`;
