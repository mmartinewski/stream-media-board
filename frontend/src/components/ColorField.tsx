import { useEffect, useState } from 'react';
import { parseCssColorInput, toHexColor } from '../lib/cssColor';

export interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  fallback?: string;
  className?: string;
}

export default function ColorField({
  value,
  onChange,
  fallback = '#ffffff',
  className = '',
}: ColorFieldProps) {
  const resolved = toHexColor(value, fallback);
  const [text, setText] = useState(resolved);

  useEffect(() => {
    setText(toHexColor(value, fallback));
  }, [fallback, value]);

  const commitText = (raw: string) => {
    const parsed = parseCssColorInput(raw);
    if (parsed) {
      onChange(parsed);
      setText(parsed);
      return;
    }
    setText(toHexColor(value, fallback));
  };

  return (
    <div className={`inline-flex max-w-xs items-center gap-2 ${className}`.trim()}>
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-surface">
        <input
          type="color"
          aria-label="Pick color"
          className="form-color absolute inset-0"
          value={resolved}
          onChange={(e) => {
            onChange(e.target.value);
            setText(e.target.value);
          }}
        />
      </div>
      <input
        type="text"
        aria-label="Color value"
        className="min-w-0 flex-1 rounded-md border border-surface bg-bg px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
        value={text}
        spellCheck={false}
        placeholder="#ffffff"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commitText(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitText(text);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setText(resolved);
            e.currentTarget.blur();
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          const parsed = parseCssColorInput(pasted);
          if (!parsed) return;
          e.preventDefault();
          onChange(parsed);
          setText(parsed);
        }}
      />
    </div>
  );
}
