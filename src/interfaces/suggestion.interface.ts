import type { EntityType } from '../types';

export interface Suggestion {
  type: EntityType;
  value: string;
  label: string;
  description: string;
}
