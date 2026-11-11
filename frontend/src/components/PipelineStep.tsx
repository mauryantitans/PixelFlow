import React, { useRef } from 'react';
import * as LucideReact from 'lucide-react';
import { PipelineStep, StepErrorDTO } from '../types';
import { useOperationSchema } from '../contexts/OperationSchemaContext';
import ParamControl from './params/ParamControl';

interface PipelineStepProps {
  step: PipelineStep;
  index: number;
  totalSteps: number;
  onRemove: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onParameterChange: (stepId: string, paramName: string, value: any) => void;
  onPreview: () => void;
  isViewing: boolean;
  stepTiming?: { duration: number; isAverage?: boolean };
  onShowDetails: () => void;
  stepError?: StepErrorDTO | null;
}

const PipelineStepComponent: React.FC<PipelineStepProps> = ({
  step,
  index,
  totalSteps,
  onRemove,
  onMove,
  onParameterChange,
  onPreview,
  isViewing,
  stepTiming,
  onShowDetails,
  stepError
}) => {
  const { getOp } = useOperationSchema();
  const op = getOp(step.name);
  const stepLabel = op?.label ?? step.name;

  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  // Keyboard-friendly reordering: this list is reordered with buttons (and
  // Alt+Arrow keys) rather than drag-and-drop, so it works without a mouse.
  // After a move, keep focus on the moved step; if the button just pressed
  // became disabled (step reached the top/bottom), focus the other one.
  const keepFocus = (preferred: React.RefObject<HTMLButtonElement>, fallback: React.RefObject<HTMLButtonElement>) => {
    window.requestAnimationFrame(() => {
      const target = preferred.current && !preferred.current.disabled ? preferred.current : fallback.current;
      target?.focus();
    });
  };

  const handleMoveUp = () => {
    if (index > 0) {
      onMove(index, index - 1);
      keepFocus(upRef, downRef);
    }
  };

  const handleMoveDown = () => {
    if (index < totalSteps - 1) {
      onMove(index, index + 1);
      keepFocus(downRef, upRef);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleMoveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleMoveDown();
    }
  };

  return (
    <div
      className="pipeline-step flex items-center gap-3"
      onKeyDown={handleKeyDown}
    >
      {/* Reorder Controls */}
      <div className="flex flex-col gap-1">
        <button
          ref={upRef}
          type="button"
          onClick={handleMoveUp}
          disabled={index === 0}
          aria-label={`Move ${stepLabel} up`}
          aria-keyshortcuts="Alt+ArrowUp"
          title="Move up"
          className="reorder-btn text-gray-600 hover:text-zinc-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed dark:text-gray-400"
        >
          <LucideReact.ArrowUp aria-hidden="true" className="w-4 h-4" />
        </button>
        <button
          ref={downRef}
          type="button"
          onClick={handleMoveDown}
          disabled={index === totalSteps - 1}
          aria-label={`Move ${stepLabel} down`}
          aria-keyshortcuts="Alt+ArrowDown"
          title="Move down"
          className="reorder-btn text-gray-600 hover:text-zinc-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed dark:text-gray-400"
        >
          <LucideReact.ArrowDown aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {/* Step Content */}
      <div className="flex-grow">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              <span className="sr-only">Step {index + 1} of {totalSteps}: </span>
              {stepLabel}
            </h3>
              {/* Info Button */}
                <button
                  type="button"
                  onClick={onShowDetails}
                  className="text-gray-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors dark:text-gray-400"
                  title="Method details"
                  aria-label={`Method details for ${stepLabel}`}
                >
                  <LucideReact.Info aria-hidden="true" className="w-4 h-4" />
                </button>
            {/* Step Timing Display */}
            {stepTiming && stepTiming.duration > 0 && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full font-mono">
                {stepTiming.isAverage ? 'avg ' : ''}
                {stepTiming.duration < 1 
                  ? `${(stepTiming.duration * 1000).toFixed(0)}ms`
                  : `${stepTiming.duration.toFixed(2)}s`
                }
              </span>
            )}
          </div>
        </div>

        {/* Parameters (rendered dynamically from the operation schema) */}
        {op && op.params.length > 0 && (
          <div className="space-y-2">
            {op.params.map((param) => {
              const controlId = `${step.id}-${param.name}`;
              // bool controls carry their own <label>; coordinate pickers have no
              // single input, so their caption is referenced via aria-labelledby.
              const hasSingleInput = param.type !== 'bool' && !['point', 'points', 'rect'].includes(param.type);
              return (
                <div key={param.name}>
                  {hasSingleInput ? (
                    <label htmlFor={controlId} className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                      {param.label}
                    </label>
                  ) : (
                    <span id={`${controlId}-label`} className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                      {param.label}
                    </span>
                  )}
                  <ParamControl
                    spec={param}
                    value={step.params[param.name]}
                    stepId={step.id}
                    controlId={controlId}
                    stepLabel={stepLabel}
                    onChange={(v) => onParameterChange(step.id, param.name, v)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Per-step error (validation / execution) surfaced from the backend */}
        {stepError && (
          <div className="mt-2 flex items-start gap-1.5 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-1.5">
            <LucideReact.AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300">{stepError.message}</span>
          </div>
        )}
      </div>

      {/* Action Controls */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-600 hover:text-red-600 dark:hover:text-red-400 transition-colors dark:text-gray-400"
            title="Remove step"
            aria-label={`Remove ${stepLabel} step`}
          >
            <LucideReact.X aria-hidden="true" className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onPreview}
            aria-label={`Preview ${stepLabel} step`}
            aria-pressed={isViewing}
            className={`transition-colors ${
              isViewing
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-600 hover:text-zinc-800 dark:hover:text-white dark:text-gray-400'
            }`}
            title="Preview this step"
          >
            <LucideReact.Eye aria-hidden="true" className="w-5 h-5" />
          </button>
          
        </div>
    </div>
  );
};

export default PipelineStepComponent;
