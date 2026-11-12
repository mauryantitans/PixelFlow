import React, { useEffect, useId, useState } from 'react';
import { ParamSpecDTO } from '../../types';

interface Props {
  spec: ParamSpecDTO;
  value: number[][] | undefined;
  stepLabel?: string;
  /** id of the visible caption, used as the group's accessible name */
  labelledBy?: string;
  onChange: (value: number[][]) => void;
}

const isSquare = (m: unknown): m is number[][] =>
  Array.isArray(m) && m.length > 0 && m.every((r) => Array.isArray(r) && r.length === m.length);

/** Resize around the centre: grow pads with zeros, shrink crops the edges. */
function resize(m: number[][], size: number): number[][] {
  const old = m.length;
  const shift = (size - old) / 2;
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const or = r - shift;
      const oc = c - shift;
      return or >= 0 && oc >= 0 && or < old && oc < old ? m[or][oc] : 0;
    }),
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));

/**
 * Editor for a convolution kernel: presets, an odd size (3×3…9×9) and a grid of
 * number inputs, one per weight, each named "row r, column c" for screen
 * readers. Typing a value that's out of range or not a number shows an error
 * and keeps the last valid kernel.
 */
const MatrixEditor: React.FC<Props> = ({ spec, value, stepLabel, labelledBy, onChange }) => {
  const min = spec.value_min ?? -255;
  const max = spec.value_max ?? 255;
  const minSize = spec.min_size ?? 3;
  const maxSize = spec.max_size ?? 9;
  const matrix = isSquare(value) ? value : isSquare(spec.default) ? spec.default : [[0, 0, 0], [0, 1, 0], [0, 0, 0]];
  const size = matrix.length;
  const sizes: number[] = [];
  for (let s = minSize; s <= maxSize; s += 2) sizes.push(s);

  // Raw text per cell, so "-" or "0." can be typed without being rejected.
  const [draft, setDraft] = useState<string[][]>(() => matrix.map((row) => row.map(fmt)));
  const [error, setError] = useState('');
  const uid = useId();
  const errorId = `${uid}-error`;
  const sumId = `${uid}-sum`;

  useEffect(() => {
    setDraft(matrix.map((row) => row.map(fmt)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(matrix)]);

  const commitCell = (r: number, c: number, text: string) => {
    const next = draft.map((row) => row.slice());
    next[r][c] = text;
    setDraft(next);
    const n = Number(text);
    if (text.trim() === '' || Number.isNaN(n)) {
      setError(`Row ${r + 1}, column ${c + 1}: enter a number.`);
      return;
    }
    if (n < min || n > max) {
      setError(`Row ${r + 1}, column ${c + 1}: use a value between ${min} and ${max}.`);
      return;
    }
    setError('');
    onChange(matrix.map((row, ri) => row.map((v, ci) => (ri === r && ci === c ? n : v))));
  };

  const sum = matrix.flat().reduce((a, b) => a + b, 0);
  const what = stepLabel ? `${stepLabel} kernel` : 'Kernel';

  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={`${sumId}${error ? ` ${errorId}` : ''}`} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {spec.presets && spec.presets.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
            <span>Preset</span>
            <select
              className="param-select"
              value=""
              onChange={(e) => {
                const preset = spec.presets?.[+e.target.value];
                if (preset) {
                  setError('');
                  onChange(preset.value.map((row) => row.slice()));
                }
              }}
            >
              <option value="">Choose…</option>
              {spec.presets.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label} ({p.value.length}×{p.value.length})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
          <span>Size</span>
          <select className="param-select" value={size} onChange={(e) => onChange(resize(matrix, +e.target.value))}>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-1"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(2.75rem, 3.25rem))` }}
        >
          {draft.map((row, r) =>
            row.map((cell, c) => {
              const centre = r === (size - 1) / 2 && c === (size - 1) / 2;
              return (
                <input
                  key={`${r}-${c}`}
                  type="text"
                  inputMode="decimal"
                  value={cell}
                  aria-label={`${what}, row ${r + 1}, column ${c + 1}${centre ? ' (centre)' : ''}`}
                  aria-invalid={error.startsWith(`Row ${r + 1}, column ${c + 1}:`) || undefined}
                  onChange={(e) => commitCell(r, c, e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`w-full rounded border px-1 py-1 text-center text-xs font-mono tabular-nums bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white ${
                    centre ? 'border-blue-600 dark:border-blue-400' : 'border-gray-500 dark:border-zinc-500'
                  }`}
                />
              );
            }),
          )}
        </div>
      </div>

      <p id={sumId} className="text-xs text-gray-600 dark:text-gray-400">
        Sum of weights: <span className="font-mono tabular-nums">{fmt(sum)}</span>
        {Math.abs(sum) > 1e-9 ? ' (Normalize divides by this)' : ' (zero: Normalize has no effect)'}
      </p>
      <p id={errorId} role="alert" className={error ? 'text-xs text-red-700 dark:text-red-400' : 'sr-only'}>
        {error}
      </p>
    </div>
  );
};

export default MatrixEditor;
