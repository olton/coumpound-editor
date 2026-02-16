import type { DbFieldType } from '../types';

export interface DbField {
  name: string;
  type: DbFieldType;
}

export interface DbTable {
  name: string;
  fields: DbField[];
}

export interface DbSchema {
  tables: DbTable[];
}
