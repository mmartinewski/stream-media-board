export const TODO_FONT_SYSTEM_FALLBACK = 'system-ui, sans-serif';

export type TodoFontOption = {
  id: string;
  label: string;
  value: string;
};

export type TodoFontOptionGroup = {
  label: string;
  options: TodoFontOption[];
};

const bundled = (id: string, label: string, primary: string): TodoFontOption => ({
  id,
  label,
  value: `${primary}, ${TODO_FONT_SYSTEM_FALLBACK}`,
});

/** Clean modern faces — good for readable overlays. */
export const TODO_FONT_MODERN_OPTIONS: TodoFontOption[] = [
  bundled('inter', 'Inter', 'Inter'),
  bundled('roboto', 'Roboto', 'Roboto'),
  bundled('oswald', 'Oswald', 'Oswald'),
  bundled('bebas-neue', 'Bebas Neue', '"Bebas Neue"'),
  bundled('montserrat', 'Montserrat', 'Montserrat'),
  bundled('poppins', 'Poppins', 'Poppins'),
  bundled('rajdhani', 'Rajdhani', 'Rajdhani'),
  bundled('orbitron', 'Orbitron', 'Orbitron'),
];

/** Fantasy, medieval, retro RPG — titles and quest vibes. */
export const TODO_FONT_RPG_OPTIONS: TodoFontOption[] = [
  bundled('cinzel', 'Cinzel', 'Cinzel'),
  bundled('cinzel-decorative', 'Cinzel Decorative', '"Cinzel Decorative"'),
  bundled('medievalsharp', 'Medieval Sharp', '"MedievalSharp"'),
  bundled('uncial-antiqua', 'Uncial Antiqua', '"Uncial Antiqua"'),
  bundled('almendra', 'Almendra', 'Almendra'),
  bundled('pirata-one', 'Pirata One', '"Pirata One"'),
  bundled('press-start-2p', 'Press Start 2P', '"Press Start 2P"'),
  bundled('metamorphous', 'Metamorphous', 'Metamorphous'),
];

/** Loud display faces — horror, metal, street, glitch energy. */
export const TODO_FONT_EDGE_OPTIONS: TodoFontOption[] = [
  bundled('creepster', 'Creepster', 'Creepster'),
  bundled('metal-mania', 'Metal Mania', '"Metal Mania"'),
  bundled('new-rocker', 'New Rocker', '"New Rocker"'),
  bundled('black-ops-one', 'Black Ops One', '"Black Ops One"'),
  bundled('bungee', 'Bungee', 'Bungee'),
  bundled('righteous', 'Righteous', 'Righteous'),
  bundled('audiowide', 'Audiowide', 'Audiowide'),
];

/** Common system faces — no extra download; may vary by OS. */
export const TODO_FONT_SYSTEM_OPTIONS: TodoFontOption[] = [
  { id: 'system', label: 'System UI', value: TODO_FONT_SYSTEM_FALLBACK },
  { id: 'segoe', label: 'Segoe UI', value: 'Segoe UI, system-ui, sans-serif' },
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', value: 'Verdana, system-ui, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', value: 'Trebuchet MS, system-ui, sans-serif' },
  { id: 'georgia', label: 'Georgia', value: 'Georgia, Times New Roman, serif' },
  { id: 'times', label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { id: 'courier', label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { id: 'impact', label: 'Impact', value: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif' },
];

/** @deprecated Use TODO_FONT_MODERN_OPTIONS — kept for any external imports. */
export const TODO_FONT_BUNDLED_OPTIONS = TODO_FONT_MODERN_OPTIONS;

export const TODO_FONT_OPTION_GROUPS: TodoFontOptionGroup[] = [
  { label: 'Modern', options: TODO_FONT_MODERN_OPTIONS },
  { label: 'RPG & Fantasy', options: TODO_FONT_RPG_OPTIONS },
  { label: 'Bold & Edge', options: TODO_FONT_EDGE_OPTIONS },
  { label: 'System', options: TODO_FONT_SYSTEM_OPTIONS },
];

export const TODO_FONT_OPTIONS: TodoFontOption[] = [
  ...TODO_FONT_MODERN_OPTIONS,
  ...TODO_FONT_RPG_OPTIONS,
  ...TODO_FONT_EDGE_OPTIONS,
  ...TODO_FONT_SYSTEM_OPTIONS,
];

/** Ensures overlay/preview CSS always ends with a system stack fallback. */
export function withTodoFontFallback(fontFamily: string | undefined | null): string {
  const trimmed = fontFamily?.trim();
  if (!trimmed) return TODO_FONT_SYSTEM_FALLBACK;
  if (/system-ui|ui-sans-serif|ui-serif|ui-monospace/i.test(trimmed)) return trimmed;
  return `${trimmed}, ${TODO_FONT_SYSTEM_FALLBACK}`;
}

export function todoFontOptionsForSelect(currentFontFamily: string | undefined): TodoFontOptionGroup[] {
  const current = withTodoFontFallback(currentFontFamily);
  if (TODO_FONT_OPTIONS.some((option) => option.value === current)) {
    return TODO_FONT_OPTION_GROUPS;
  }
  const primary = current.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || 'Custom';
  return [
    { label: 'Current', options: [{ id: 'custom', label: `Custom (${primary})`, value: current }] },
    ...TODO_FONT_OPTION_GROUPS,
  ];
}

export function todoFontSelectValue(currentFontFamily: string | undefined): string {
  return withTodoFontFallback(currentFontFamily);
}
