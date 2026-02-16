import { DEFAULT_FUNCTIONS } from './funcs/default-functions';
import type {
  CompoundEditorOptions,
  DbSchema,
  FunctionArgumentHint,
  FunctionDefinition,
  Suggestion,
} from './interfaces';
import type { EntityType } from './types';

export class CompoundEditor {
  private readonly input: HTMLInputElement;
  private readonly schema: DbSchema;
  private readonly functions: FunctionDefinition[];
  private readonly reservedPrefixes: string[];
  private expression = '';

  public constructor(options: CompoundEditorOptions) {
    this.input = options.input;
    this.schema = options.schema;
    this.functions = options.functions ?? DEFAULT_FUNCTIONS;
    this.reservedPrefixes = options.reservedPrefixes ?? ['@'];
    this.expression = this.input.value;

    this.input.addEventListener('input', () => {
      this.handleInput(this.input.value);
    });
  }

  public handleInput(value: string): void {
    this.expression = value;
  }

  public detectEntityType(token: string): EntityType {
    if (!token) {
      return 'unknown';
    }

    const prefix = token[0];
    if (prefix === '!') {
      return 'table';
    }
    if (prefix === '#') {
      return 'field';
    }
    if (prefix === '$') {
      return 'function';
    }
    if (prefix === '@') {
      return 'reserved';
    }
    return 'unknown';
  }

  public getSuggestions(cursorPosition = this.input.selectionStart ?? this.expression.length): Suggestion[] {
    const tableFieldContext = this.extractTableFieldContext(this.expression, cursorPosition);
    if (tableFieldContext) {
      return this.getFieldSuggestions(tableFieldContext.fieldQuery, tableFieldContext.tableName);
    }

    const functionArgumentContext = this.extractFunctionCallContext(this.expression, cursorPosition);
    if (functionArgumentContext) {
      const definition = this.resolveFunctionDefinition(
        functionArgumentContext.functionName,
        functionArgumentContext.currentArgumentIndex
      );
      const expectedArgument = definition?.arguments?.[functionArgumentContext.currentArgumentIndex];
      if (expectedArgument?.startsWith('#')) {
        const token = this.extractActiveToken(this.expression, cursorPosition);
        const query = token?.startsWith('#') ? token.slice(1) : '';
        const suggestions = this.getFieldSuggestions(query);

        return suggestions.map((suggestion) => ({
          ...suggestion,
          description: `${suggestion.description} • аргумент ${functionArgumentContext.currentArgumentIndex + 1} для $${functionArgumentContext.functionName}`,
        }));
      }
    }

    const token = this.extractActiveToken(this.expression, cursorPosition);
    if (!token) {
      return [];
    }

    const type = this.detectEntityType(token);
    const query = token.slice(1).toLowerCase();

    if (type === 'table') {
      return this.schema.tables
        .filter((table) => table.name.toLowerCase().includes(query))
        .map((table) => ({
          type,
          value: `!${table.name}`,
          label: `!${table.name}`,
          description: 'Таблиця БД',
        }));
    }

    if (type === 'field') {
      return this.getFieldSuggestions(query);
    }

    if (type === 'function') {
      const suggestions = this.functions
        .filter((func) => func.name.toLowerCase().includes(query))
        .map((func) => ({
          type,
          value: `$${func.signature}`,
          label: `$${func.signature}`,
          description: `${func.category}: ${func.description}`,
        }));

      const seen = new Set<string>();
      return suggestions.filter((item) => {
        if (seen.has(item.value)) {
          return false;
        }
        seen.add(item.value);
        return true;
      });
    }

    if (type === 'reserved') {
      return this.reservedPrefixes.map((prefix) => ({
        type,
        value: `${prefix}${query}`,
        label: prefix,
        description: 'Зарезервований префікс',
      }));
    }

    return [];
  }

  public getFunctionArgumentHint(cursorPosition = this.input.selectionStart ?? this.expression.length): string | null {
    const hint = this.getFunctionArgumentHintData(cursorPosition);
    if (!hint) {
      return null;
    }

    if (!hint.arguments.length) {
      return `Підказка: $${hint.signature} • функція не приймає аргументів.`;
    }

    const expectedArgument = hint.arguments[hint.currentArgumentIndex];
    if (!expectedArgument) {
      return `Підказка: $${hint.signature} • очікувана кількість аргументів: ${hint.arguments.length}.`;
    }

    return `Підказка: $${hint.signature} • аргумент ${hint.currentArgumentIndex + 1}: ${expectedArgument}.`;
  }

  public getFunctionArgumentHintData(
    cursorPosition = this.input.selectionStart ?? this.expression.length
  ): FunctionArgumentHint | null {
    const context = this.extractFunctionCallContext(this.expression, cursorPosition);
    if (!context) {
      return null;
    }

    const definition = this.resolveFunctionDefinition(context.functionName, context.currentArgumentIndex);
    if (!definition) {
      return {
        functionName: context.functionName,
        signature: `${context.functionName}()`,
        currentArgumentIndex: context.currentArgumentIndex,
        arguments: [],
      };
    }

    return {
      functionName: definition.name,
      signature: definition.signature,
      currentArgumentIndex: context.currentArgumentIndex,
      arguments: definition.arguments ?? [],
    };
  }

  public applySuggestion(
    suggestion: Suggestion,
    cursorPosition = this.input.selectionStart ?? this.expression.length
  ): string {
    const token = this.extractActiveToken(this.expression, cursorPosition);
    if (!token) {
      return this.expression;
    }

    const tokenStart = cursorPosition - token.length;
    const before = this.expression.slice(0, tokenStart);
    const after = this.expression.slice(cursorPosition);
    const updated = `${before}${suggestion.value}${after}`;

    this.expression = updated;
    this.input.value = updated;

    const newCursorPosition = tokenStart + suggestion.value.length;
    this.input.setSelectionRange(newCursorPosition, newCursorPosition);
    return updated;
  }

  public getResult(): string {
    return this.compileToSqlWhere(this.expression);
  }

  private compileToSqlWhere(source: string): string {
    const compiled = this.parseSegment(source, 0);
    return compiled.output.trim();
  }

  private parseSegment(source: string, start: number, stopChar?: string): { output: string; nextIndex: number } {
    let index = start;
    let output = '';

    while (index < source.length) {
      const char = source[index];

      if (stopChar && char === stopChar) {
        return { output, nextIndex: index + 1 };
      }

      if (char === '#') {
        const field = this.readIdentifier(source, index + 1);
        if (!field.value) {
          output += '#';
          index += 1;
          continue;
        }

        output += this.escapeIdentifier(field.value);
        index = field.nextIndex;
        continue;
      }

      if (char === '$') {
        const funcName = this.readIdentifier(source, index + 1);
        if (!funcName.value || source[funcName.nextIndex] !== '(') {
          output += '$';
          index += 1;
          continue;
        }

        const argsSegment = this.parseSegment(source, funcName.nextIndex + 1, ')');
        output += this.compileFunction(funcName.value, argsSegment.output);
        index = argsSegment.nextIndex;
        continue;
      }

      output += char;
      index += 1;
    }

    return { output, nextIndex: index };
  }

  private compileFunction(name: string, compiledArgs: string): string {
    const normalizedName = name.toLowerCase();
    const trimmedArgs = compiledArgs.trim();

    if (normalizedName === 'now') {
      return 'CURRENT_TIMESTAMP';
    }

    if (normalizedName === 'today') {
      return 'CURRENT_DATE';
    }

    if (normalizedName === 'month') {
      if (!trimmedArgs) {
        return 'EXTRACT(MONTH FROM CURRENT_DATE)';
      }
      return `EXTRACT(MONTH FROM ${trimmedArgs})`;
    }

    if (normalizedName === 'year') {
      if (!trimmedArgs) {
        return 'EXTRACT(YEAR FROM CURRENT_DATE)';
      }
      return `EXTRACT(YEAR FROM ${trimmedArgs})`;
    }

    const definition = this.functions.find((func) => func.name.toLowerCase() === normalizedName);
    const sqlName = definition?.sqlName ?? normalizedName.toUpperCase();
    return `${sqlName}(${compiledArgs})`;
  }

  private readIdentifier(source: string, from: number): { value: string; nextIndex: number } {
    let index = from;
    let value = '';

    while (index < source.length) {
      const char = source[index];
      if (!char) {
        break;
      }
      const isIdentifierCharacter = /[a-zA-Z0-9_.]/.test(char);
      if (!isIdentifierCharacter) {
        break;
      }
      value += char;
      index += 1;
    }

    return { value, nextIndex: index };
  }

  private escapeIdentifier(identifier: string): string {
    const safeIdentifier = identifier
      .split('.')
      .map((part) => `"${part.replace(/"/g, '""')}"`)
      .join('.');

    return safeIdentifier;
  }

  private getFieldSuggestions(query: string, tableName?: string): Suggestion[] {
    const normalizedQuery = query.toLowerCase();
    const uniqueFieldNames = new Map<string, Suggestion>();
    const tables = tableName
      ? this.schema.tables.filter((table) => table.name.toLowerCase() === tableName.toLowerCase())
      : this.schema.tables;

    tables.forEach((table) => {
      table.fields.forEach((field) => {
        const fieldValue = `#${field.name}`;
        if (!tableName && fieldValue.toLowerCase().includes(`#${normalizedQuery}`)) {
          uniqueFieldNames.set(fieldValue, {
            type: 'field',
            value: fieldValue,
            label: `${fieldValue} (${field.type})`,
            description: `Поле таблиці ${table.name}`,
          });
        }

        const qualifiedField = `#${table.name}.${field.name}`;
        if (qualifiedField.toLowerCase().includes(`#${normalizedQuery}`)) {
          uniqueFieldNames.set(qualifiedField, {
            type: 'field',
            value: qualifiedField,
            label: `${qualifiedField} (${field.type})`,
            description: tableName ? `Поле таблиці ${table.name}` : 'Кваліфіковане поле',
          });
        }
      });
    });

    return [...uniqueFieldNames.values()];
  }

  private extractTableFieldContext(
    text: string,
    cursorPosition: number
  ): { tableName: string; fieldQuery: string } | null {
    const safePosition = Math.max(0, Math.min(cursorPosition, text.length));
    const leftSide = text.slice(0, safePosition);
    const match = leftSide.match(/!([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]*)$/);
    if (!match?.[1]) {
      return null;
    }

    return {
      tableName: match[1],
      fieldQuery: match[2] ?? '',
    };
  }

  private extractFunctionCallContext(
    text: string,
    cursorPosition: number
  ): { functionName: string; currentArgumentIndex: number } | null {
    const safePosition = Math.max(0, Math.min(cursorPosition, text.length));
    const leftSide = text.slice(0, safePosition);

    let depth = 0;
    for (let index = leftSide.length - 1; index >= 0; index -= 1) {
      const char = leftSide[index];
      if (char === ')') {
        depth += 1;
        continue;
      }

      if (char === '(') {
        if (depth > 0) {
          depth -= 1;
          continue;
        }

        let nameEnd = index - 1;
        while (nameEnd >= 0 && /\s/.test(leftSide[nameEnd] ?? '')) {
          nameEnd -= 1;
        }

        let nameStart = nameEnd;
        while (nameStart >= 0 && /[a-zA-Z0-9_]/.test(leftSide[nameStart] ?? '')) {
          nameStart -= 1;
        }

        if ((leftSide[nameStart] ?? '') !== '$') {
          return null;
        }

        const functionName = leftSide.slice(nameStart + 1, nameEnd + 1);
        if (!functionName) {
          return null;
        }

        const rawArguments = leftSide.slice(index + 1);
        const currentArgumentIndex = rawArguments.trim() ? rawArguments.split(',').length - 1 : 0;
        return { functionName, currentArgumentIndex };
      }
    }

    return null;
  }

  private resolveFunctionDefinition(name: string, argumentIndex: number): FunctionDefinition | undefined {
    const normalizedName = name.toLowerCase();
    const sameNameFunctions = this.functions.filter((func) => func.name.toLowerCase() === normalizedName);
    if (!sameNameFunctions.length) {
      return undefined;
    }

    const withArguments = sameNameFunctions.filter((func) => (func.arguments?.length ?? 0) > 0);
    const noArguments = sameNameFunctions.find((func) => !func.arguments || func.arguments.length === 0);

    const exact = withArguments.find((func) => argumentIndex < (func.arguments?.length ?? 0));
    if (exact) {
      return exact;
    }

    if (argumentIndex === 0 && noArguments) {
      return noArguments;
    }

    return withArguments[0] ?? sameNameFunctions[0];
  }

  private extractActiveToken(text: string, cursorPosition: number): string | null {
    if (!text) {
      return null;
    }

    const safePosition = Math.max(0, Math.min(cursorPosition, text.length));
    const leftSide = text.slice(0, safePosition);
    const match = leftSide.match(/[!#$@][a-zA-Z0-9_.]*$/);
    return match?.[0] ?? null;
  }
}
