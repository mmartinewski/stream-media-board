export const TODO_FONT_SIZES = ['tiny', 'small', 'medium', 'large'] as const;

export type TodoFontSizeId = (typeof TODO_FONT_SIZES)[number];

export const TODO_FONT_SIZE_DEFAULT: TodoFontSizeId = 'medium';

export const TODO_FONT_SIZE_LABELS: Record<TodoFontSizeId, string> = {
  tiny: 'Tiny',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

type FontSizeScale = {
  title: string;
  group: string;
  item: string;
  thumb: string;
};

const OVERLAY_SCALES: Record<TodoFontSizeId, FontSizeScale> = {
  tiny: {
    title: '2rem',
    group: '1.1875rem',
    item: '1.125rem',
    thumb: '1.5rem',
  },
  small: {
    title: '2.625rem',
    group: '1.625rem',
    item: '1.5rem',
    thumb: '2.0625rem',
  },
  medium: {
    title: '3.5rem',
    group: '2.125rem',
    item: '2rem',
    thumb: '2.75rem',
  },
  large: {
    title: '4.375rem',
    group: '2.625rem',
    item: '2.5rem',
    thumb: '3.4375rem',
  },
};

const PREVIEW_SCALES: Record<TodoFontSizeId, FontSizeScale> = {
  tiny: {
    title: '0.5625rem',
    group: '0.4375rem',
    item: '0.4375rem',
    thumb: '0.6875rem',
  },
  small: {
    title: '0.75rem',
    group: '0.5625rem',
    item: '0.5625rem',
    thumb: '0.9375rem',
  },
  medium: {
    title: '1rem',
    group: '0.6875rem',
    item: '0.6875rem',
    thumb: '1.25rem',
  },
  large: {
    title: '1.25rem',
    group: '0.875rem',
    item: '0.875rem',
    thumb: '1.5625rem',
  },
};

export function normalizeTodoFontSize(raw: unknown): TodoFontSizeId {
  if (typeof raw === 'string' && (TODO_FONT_SIZES as readonly string[]).includes(raw)) {
    return raw as TodoFontSizeId;
  }
  return TODO_FONT_SIZE_DEFAULT;
}

export function todoFontSizeIndex(size: TodoFontSizeId | undefined | null): number {
  const index = TODO_FONT_SIZES.indexOf(normalizeTodoFontSize(size));
  return index >= 0 ? index : TODO_FONT_SIZES.indexOf(TODO_FONT_SIZE_DEFAULT);
}

export function todoFontSizeFromIndex(index: number): TodoFontSizeId {
  const clamped = Math.min(Math.max(0, Math.round(index)), TODO_FONT_SIZES.length - 1);
  return TODO_FONT_SIZES[clamped] ?? TODO_FONT_SIZE_DEFAULT;
}

export function todoFontSizeCssVars(
  size: TodoFontSizeId | undefined | null,
  context: 'overlay' | 'preview' = 'overlay',
  titleSize?: TodoFontSizeId | undefined | null,
): Record<string, string> {
  const scales = context === 'preview' ? PREVIEW_SCALES : OVERLAY_SCALES;
  const bodyScale = scales[normalizeTodoFontSize(size)];
  const titleScale = scales[normalizeTodoFontSize(titleSize ?? size)];
  return {
    '--todo-fs-title': titleScale.title,
    '--todo-fs-group': bodyScale.group,
    '--todo-fs-item': bodyScale.item,
    '--todo-fs-thumb': bodyScale.thumb,
  };
}
