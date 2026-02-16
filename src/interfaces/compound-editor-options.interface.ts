import type { DbSchema } from './db.interface';
import type { FunctionDefinition } from './function-definition.interface';

export interface CompoundEditorOptions {
  input: HTMLInputElement;
  schema: DbSchema;
  functions?: FunctionDefinition[];
  reservedPrefixes?: string[];
}
