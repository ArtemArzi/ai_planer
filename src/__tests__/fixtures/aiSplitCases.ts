export interface SplitTestCase {
  input: string;
  expectedItems: number;
  expectedIsMulti: boolean;
  kind: 'blankline_separate' | 'prose_blankline_single' | 'explicit_prefix_multi' | 'semicolon_list' | 'mixed_ru_en' | 'single_task';
  description: string;
}

export const CONTEXTUAL_SPLIT_CASES: SplitTestCase[] = [
  // Blank-line separated tasks (should split)
  {
    input: `купить молоко

позвонить маме`,
    expectedItems: 2,
    expectedIsMulti: true,
    kind: 'blankline_separate',
    description: 'Two short tasks separated by blank line',
  },
  {
    input: `Купить продукты

Позвонить маме

Сделать отчёт`,
    expectedItems: 3,
    expectedIsMulti: true,
    kind: 'blankline_separate',
    description: 'Three short tasks with blank lines',
  },
  // Prose with blank lines (should NOT split)
  {
    input: `Написать отчёт о проделанной работе

В отчёте нужно отразить все метрики за квартал и сравнить их с показателями предыдущего периода`,
    expectedItems: 1,
    expectedIsMulti: false,
    kind: 'prose_blankline_single',
    description: 'Connected prose with blank line - single task',
  },
  {
    input: `Plan the meeting

We'll discuss the project timeline and assign tasks to team members`,
    expectedItems: 1,
    expectedIsMulti: false,
    kind: 'prose_blankline_single',
    description: 'English prose with blank line - single task',
  },
  // Explicit prefix + multiple lines
  {
    input: `work:
созвон с командой
ревью кода
деплой`,
    expectedItems: 3,
    expectedIsMulti: true,
    kind: 'explicit_prefix_multi',
    description: 'Explicit folder prefix with multiple tasks',
  },
  // Semicolon list (should split)
  {
    input: `купить молоко; позвонить маме; сделать отчёт`,
    expectedItems: 3,
    expectedIsMulti: true,
    kind: 'semicolon_list',
    description: 'Classic semicolon-separated list',
  },
  // Mixed RU/EN
  {
    input: `buy milk

позвонить маме`,
    expectedItems: 2,
    expectedIsMulti: true,
    kind: 'mixed_ru_en',
    description: 'Mixed language tasks with blank line',
  },
  // Single task (should NOT split)
  {
    input: `Просто одна задача`,
    expectedItems: 1,
    expectedIsMulti: false,
    kind: 'single_task',
    description: 'Single simple task',
  },
];

export function getCasesByKind(kind: SplitTestCase['kind']): SplitTestCase[] {
  return CONTEXTUAL_SPLIT_CASES.filter(c => c.kind === kind);
}
