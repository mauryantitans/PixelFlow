import React from 'react';
import * as LucideReact from 'lucide-react';
import { ParamSpecDTO } from '../../types';
import { usePicker } from '../../contexts/PickerContext';
import { announce } from '../../utils/announce';

interface ParamControlProps {
  spec: ParamSpecDTO;
  value: any;
  stepId: string;
  /** id for the primary input so the visible caption can label it */
  controlId?: string;
  /** human label of the owning step, used in accessible names */
  stepLabel?: string;
  onChange: (value: any) => void;
}

function summarize(type: string, value: any): string {
  if (value === null || value === undefined) return 'not set';
  if (type === 'point') return `(${(+value.x).toFixed(2)}, ${(+value.y).toFixed(2)})`;
  if (type === 'points') return `${Array.isArray(value) ? value.length : 0} point(s)`;
  if (type === 'rect')
    return `x ${(+value.x).toFixed(2)}, y ${(+value.y).toFixed(2)}, w ${(+value.w).toFixed(2)}, h ${(+value.h).toFixed(2)}`;
  return String(value);
}

/**
 * Renders the right input control for a single operation parameter, driven by
 * the param's declared `type` from the backend schema.
 */
const ParamControl: React.FC<ParamControlProps> = ({ spec, value, stepId, controlId, stepLabel, onChange }) => {
  const { arm: armPicker, isArmed } = usePicker();
  const armed = isArmed(stepId, spec.name);
  // Arm the image picker; tell screen-reader/keyboard users if there is no
  // preview image to pick on yet (picking needs Live Processing).
  const arm: typeof armPicker = (p) => {
    armPicker(p);
    window.requestAnimationFrame(() => {
      if (!document.querySelector('[data-testid="preview-picker-overlay"]')) {
        announce('No preview to pick on. Turn on Live Processing with one image selected and use the Normal view, then try again.');
      }
    });
  };

  switch (spec.type) {
    case 'int':
    case 'odd_kernel':
    case 'float':
    case 'angle': {
      const isFloat = spec.type === 'float' || spec.type === 'angle';
      const step = spec.step ?? (spec.type === 'odd_kernel' ? 2 : isFloat ? 0.01 : 1);
      const current = typeof value === 'number' ? value : Number(value ?? spec.default ?? 0);
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            id={controlId}
            aria-valuetext={String(value ?? spec.default ?? '')}
            min={spec.min}
            max={spec.max}
            step={step}
            value={Number.isFinite(current) ? current : 0}
            onChange={(e) =>
              onChange(isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
            }
            className="param-slider flex-1"
          />
          <span className="text-sm font-mono text-gray-600 dark:text-gray-300 w-12 text-right" aria-hidden="true">
            {String(value ?? spec.default ?? '')}
          </span>
        </div>
      );
    }

    case 'enum':
      return (
        <select
          id={controlId}
          value={String(value ?? spec.default ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="param-select"
        >
          {(spec.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case 'bool':
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value ?? spec.default)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-500 dark:border-zinc-500 accent-blue-600"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">{spec.help || spec.label}</span>
        </label>
      );

    case 'color': {
      const hex = typeof value === 'string' ? value : spec.default ?? '#000000';
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            id={controlId}
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-10 rounded border border-gray-500 dark:border-zinc-500 bg-transparent cursor-pointer"
          />
          <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{hex}</span>
          <button
            type="button"
            onClick={() => arm({ stepId, paramName: spec.name, type: 'color' })}
            className={`ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded border ${
              armed
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-gray-300'
            }`}
            title="Pick a color from the image"
            aria-label={armed ? `Click image… to pick ${spec.label}` : `Eyedropper: pick ${spec.label} from the image`}
            aria-pressed={armed}
          >
            <LucideReact.Pipette aria-hidden="true" className="w-3.5 h-3.5" />
            {armed ? 'Click image…' : 'Eyedropper'}
          </button>
        </div>
      );
    }

    // Interactive image-coordinate inputs: arm the PreviewCanvas picker.
    case 'point':
    case 'points':
    case 'rect':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => arm({ stepId, paramName: spec.name, type: spec.type })}
            aria-labelledby={controlId ? `${controlId}-label ${controlId}-pick` : undefined}
            id={controlId ? `${controlId}-pick` : undefined}
            aria-pressed={armed}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${
              armed
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 animate-pulse'
                : 'border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-gray-300'
            }`}
          >
            <LucideReact.Crosshair aria-hidden="true" className="w-3.5 h-3.5" />
            {armed
              ? spec.type === 'rect'
                ? 'Drag on image…'
                : 'Click image…'
              : value
              ? 'Re-pick'
              : 'Pick on image'}
          </button>
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
            {summarize(spec.type, value)}
          </span>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-gray-600 hover:text-red-500 dark:text-gray-400"
              title="Clear"
              aria-label={`Clear ${spec.label}${stepLabel ? ` for ${stepLabel}` : ''}`}
            >
              <LucideReact.X aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
};

export default ParamControl;
