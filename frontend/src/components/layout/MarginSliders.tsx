import { useEffect, useState } from 'react';

interface MarginSlidersProps {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  onChange: (margins: {
    margin_top: number;
    margin_right: number;
    margin_bottom: number;
    margin_left: number;
  }) => void;
  disabled?: boolean;
}

function clampMargin(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function marginsAreUniform(
  marginTop: number,
  marginRight: number,
  marginBottom: number,
  marginLeft: number,
): boolean {
  return (
    marginTop === marginRight &&
    marginRight === marginBottom &&
    marginBottom === marginLeft
  );
}

export default function MarginSliders({
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  onChange,
  disabled = false,
}: MarginSlidersProps) {
  const valuesUniform = marginsAreUniform(
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
  );

  const [uniformMode, setUniformMode] = useState(valuesUniform);

  useEffect(() => {
    if (!valuesUniform) {
      setUniformMode(false);
    }
  }, [valuesUniform]);

  const setUniform = (value: number) => {
    const v = clampMargin(value);
    onChange({
      margin_top: v,
      margin_right: v,
      margin_bottom: v,
      margin_left: v,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Margins (%)</p>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={uniformMode}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.checked) {
                setUniformMode(true);
                setUniform(marginTop);
              } else {
                setUniformMode(false);
              }
            }}
          />
          Uniform
        </label>
      </div>

      {uniformMode ? (
        <label className="block text-sm">
          <span className="flex justify-between text-xs text-text-muted">
            <span>All sides</span>
            <span>{marginTop}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={50}
            disabled={disabled}
            value={marginTop}
            onChange={(e) => setUniform(Number(e.target.value))}
            className="mt-1 w-full accent-accent"
          />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['Top', 'margin_top', marginTop],
              ['Right', 'margin_right', marginRight],
              ['Bottom', 'margin_bottom', marginBottom],
              ['Left', 'margin_left', marginLeft],
            ] as const
          ).map(([label, key, value]) => (
            <label key={key} className="block text-sm">
              <span className="flex justify-between text-xs text-text-muted">
                <span>{label}</span>
                <span>{value}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={50}
                disabled={disabled}
                value={value}
                onChange={(e) =>
                  onChange({
                    margin_top: marginTop,
                    margin_right: marginRight,
                    margin_bottom: marginBottom,
                    margin_left: marginLeft,
                    [key]: clampMargin(Number(e.target.value)),
                  })
                }
                className="mt-1 w-full accent-accent"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
