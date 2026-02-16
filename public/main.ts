import { CompoundEditor, DEFAULT_FUNCTIONS, DEMO_SCHEMA, type Suggestion } from '../src';

const schema = DEMO_SCHEMA;

const input = document.querySelector<HTMLInputElement>('#expression');
const suggestionList = document.querySelector<HTMLUListElement>('#suggestions');
const functionHint = document.querySelector<HTMLParagraphElement>('#function-hint');
const sqlResult = document.querySelector<HTMLPreElement>('#sql-result');
const generateButton = document.querySelector<HTMLButtonElement>('#generate');
const copySqlButton = document.querySelector<HTMLButtonElement>('#copy-sql');
const validationMessage = document.querySelector<HTMLParagraphElement>('#validation-message');
const schemaView = document.querySelector<HTMLPreElement>('#schema-view');
const functionsView = document.querySelector<HTMLPreElement>('#functions-view');

if (
  !input ||
  !suggestionList ||
  !functionHint ||
  !sqlResult ||
  !generateButton ||
  !copySqlButton ||
  !validationMessage ||
  !schemaView ||
  !functionsView
) {
  throw new Error('Demo UI is not ready.');
}

const editor = new CompoundEditor({
  input,
  schema,
  functions: DEFAULT_FUNCTIONS,
});

schemaView.textContent = JSON.stringify(schema, null, 2);
functionsView.textContent = JSON.stringify(
  DEFAULT_FUNCTIONS.map((func) => ({
    name: func.name,
    signature: func.signature,
    category: func.category,
    arguments: func.arguments,
  })),
  null,
  2
);

let currentSuggestions: Suggestion[] = [];
let selectedSuggestionIndex = -1;

const getValidationError = (value: string): string | null => {
  if (value.includes('@')) {
    return 'Символ @ зарезервований і не може використовуватись у виразі.';
  }

  let balance = 0;
  for (const char of value) {
    if (char === '(') {
      balance += 1;
    }
    if (char === ')') {
      balance -= 1;
    }
    if (balance < 0) {
      return 'Некоректні дужки у виразі.';
    }
  }

  if (balance !== 0) {
    return 'Некоректні дужки у виразі.';
  }

  const functionTokens = value.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  const knownFunctionNames = new Set(DEFAULT_FUNCTIONS.map((func) => func.name.toLowerCase()));
  for (const token of functionTokens) {
    const functionName = token.slice(1).toLowerCase();
    if (!knownFunctionNames.has(functionName)) {
      return `Невідома функція: ${token}`;
    }
  }

  return null;
};

const hideSuggestions = (): void => {
  suggestionList.innerHTML = '';
  suggestionList.classList.remove('visible');
  selectedSuggestionIndex = -1;
};

const applySelectedSuggestion = (index: number): void => {
  const selected = currentSuggestions[index];
  if (!selected) {
    return;
  }

  editor.applySuggestion(selected);
  renderResult();
  renderSuggestions();
};

const renderFunctionHint = (): void => {
  const hint = editor.getFunctionArgumentHintData();
  functionHint.innerHTML = '';

  if (!hint) {
    return;
  }

  const prefix = document.createElement('span');
  prefix.textContent = `$${hint.functionName}(`;
  functionHint.appendChild(prefix);

  if (!hint.arguments.length) {
    const noArgs = document.createElement('span');
    noArgs.textContent = 'без аргументів';
    noArgs.className = 'function-hint-active';
    functionHint.appendChild(noArgs);
  } else {
    hint.arguments.forEach((argument, index) => {
      if (index > 0) {
        const comma = document.createElement('span');
        comma.textContent = ', ';
        functionHint.appendChild(comma);
      }

      const part = document.createElement('span');
      part.textContent = argument;
      if (index === hint.currentArgumentIndex) {
        part.className = 'function-hint-active';
      }
      functionHint.appendChild(part);
    });
  }

  const suffix = document.createElement('span');
  suffix.textContent = ')';
  functionHint.appendChild(suffix);

  const meta = document.createElement('span');
  meta.className = 'function-hint-meta';
  meta.textContent = `  • аргумент ${Math.min(hint.currentArgumentIndex + 1, Math.max(hint.arguments.length, 1))}`;
  functionHint.appendChild(meta);
};

const renderSuggestions = (): void => {
  renderFunctionHint();
  currentSuggestions = editor.getSuggestions();

  if (!currentSuggestions.length) {
    hideSuggestions();
    return;
  }

  suggestionList.innerHTML = '';
  currentSuggestions.forEach((suggestion, index) => {
    const item = document.createElement('li');
    item.className = 'suggestion-item';
    if (index === selectedSuggestionIndex) {
      item.classList.add('active');
    }

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = suggestion.label;

    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = suggestion.description;

    item.append(title, desc);
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      applySelectedSuggestion(index);
    });

    suggestionList.appendChild(item);
  });

  suggestionList.classList.add('visible');
};

const renderResult = (): void => {
  const rawExpression = input.value.trim();
  const validationError = getValidationError(rawExpression);

  if (validationError) {
    validationMessage.textContent = validationError;
    validationMessage.classList.add('error');
  } else {
    validationMessage.textContent = rawExpression ? 'Вираз валідний.' : '';
    validationMessage.classList.remove('error');
  }

  sqlResult.textContent = editor.getResult() || '-- Порожній вираз --';
};

input.value = '#total > 100 AND $month(#created_at) = 2';
editor.handleInput(input.value);
renderResult();
renderSuggestions();

input.addEventListener('input', () => {
  selectedSuggestionIndex = -1;
  renderResult();
  renderSuggestions();
});

input.addEventListener('keydown', (event) => {
  if (!currentSuggestions.length) {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestions.length;
    renderSuggestions();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedSuggestionIndex =
      selectedSuggestionIndex <= 0 ? currentSuggestions.length - 1 : selectedSuggestionIndex - 1;
    renderSuggestions();
    return;
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    if (selectedSuggestionIndex >= 0) {
      event.preventDefault();
      applySelectedSuggestion(selectedSuggestionIndex);
    }
  }

  if (event.key === 'Escape') {
    hideSuggestions();
  }
});

generateButton.addEventListener('click', () => {
  renderResult();
});

copySqlButton.addEventListener('click', async () => {
  const sql = editor.getResult();
  if (!sql) {
    validationMessage.textContent = 'Немає SQL для копіювання.';
    validationMessage.classList.add('error');
    return;
  }

  try {
    await navigator.clipboard.writeText(sql);
    validationMessage.textContent = 'SQL скопійовано в буфер обміну.';
    validationMessage.classList.remove('error');
  } catch {
    validationMessage.textContent = 'Не вдалося скопіювати SQL.';
    validationMessage.classList.add('error');
  }
});
