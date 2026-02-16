import type { Func } from './func.interface';

export interface FunctionDefinition extends Func {
  category: 'math' | 'string' | 'date';
  description: string;
  signature: string;
  sqlName?: string;
}
