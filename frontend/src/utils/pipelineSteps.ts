import { PipelineStep } from '../types';

/** The category that marks a saved pipeline as a reusable filter (Custom → My filters). */
export const CUSTOM_FILTER_CATEGORY = 'Custom filter';
/** Operation label of the step that runs a saved filter. */
export const CUSTOM_FILTER_OP = 'Custom Filter';

/** Steps as the API expects them (processing requests and saved pipelines). */
export function toApiSteps(pipeline: PipelineStep[]) {
  return pipeline.map((step) => ({ name: step.name, params: step.params, enabled: step.enabled !== false }));
}

/** The name to show for a step: a custom filter shows its own name. */
export function stepDisplayName(step: Pick<PipelineStep, 'name' | 'params'>, fallbackLabel?: string): string {
  if (step.name === CUSTOM_FILTER_OP && typeof step.params?.filter_name === 'string' && step.params.filter_name.trim()) {
    return step.params.filter_name.trim();
  }
  return fallbackLabel ?? step.name;
}
