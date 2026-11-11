import React from 'react';
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

  const handleMoveUp = () => {
    if (index > 0) onMove(index, index - 1);
  };

  const handleMoveDown = () => {
    if (index < totalSteps - 1) onMove(index, index + 1);
  };

  return (
    <div className="pipeline-step flex items-center gap-3">
      {/* Reorder Controls */}
      <div className="flex flex-col gap-1">
        <button
          onClick={handleMoveUp}
          disabled={index === 0}
          className="reorder-btn text-gray-400 hover:text-zinc-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <LucideReact.ArrowUp className="w-4 h-4" />
        </button>
        <button
          onClick={handleMoveDown}
          disabled={index === totalSteps - 1}
          className="reorder-btn text-gray-400 hover:text-zinc-800 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <LucideReact.ArrowDown className="w-4 h-4" />
        </button>
      </div>

      {/* Step Content */}
      <div className="flex-grow">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              {op?.label ?? step.name}
            </h3>
              {/* Info Button */}
                <button
                  onClick={onShowDetails}
                  className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="Method details"
                >
                  <LucideReact.Info className="w-4 h-4" />
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
            {op.params.map((param) => (
              <div key={param.name}>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  {param.label}
                </label>
                <ParamControl
                  spec={param}
                  value={step.params[param.name]}
                  stepId={step.id}
                  onChange={(v) => onParameterChange(step.id, param.name, v)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Per-step error (validation / execution) surfaced from the backend */}
        {stepError && (
          <div className="mt-2 flex items-start gap-1.5 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-1.5">
            <LucideReact.AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300">{stepError.message}</span>
          </div>
        )}
      </div>

      {/* Action Controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Remove step"
          >
            <LucideReact.X className="w-5 h-5" />
          </button>
          <button
            onClick={onPreview}
            className={`transition-colors ${
              isViewing
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-400 hover:text-zinc-800 dark:hover:text-white'
            }`}
            title="Preview this step"
          >
            <LucideReact.Eye className="w-5 h-5" />
          </button>
          
        </div>
    </div>
  );
};

export default PipelineStepComponent;
