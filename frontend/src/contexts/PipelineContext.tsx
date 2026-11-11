import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import { PipelineStep } from '../types';

interface PipelineContextType {
  pipeline: PipelineStep[];
  addStep: (operationName: string, params?: Record<string, any>) => void;
  removeStep: (index: number) => void;
  updateStepParam: (stepId: string, paramName: string, value: any) => void;
  moveStep: (fromIndex: number, toIndex: number) => void;
  resetPipeline: () => void;
  setPipeline: (pipeline: PipelineStep[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

export const usePipelineContext = (): PipelineContextType => {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipelineContext must be used within PipelineProvider');
  }
  return context;
};

interface PipelineProviderProps {
  children: ReactNode;
}

export const PipelineProvider: React.FC<PipelineProviderProps> = ({ children }) => {
  const [pipeline, setPipelineState] = useState<PipelineStep[]>([]);
  const [history, setHistory] = useState<PipelineStep[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const saveToHistory = useCallback((newPipeline: PipelineStep[]) => {
    // Don't save if pipeline hasn't actually changed
    const currentPipeline = history[historyIndex] || [];
    if (JSON.stringify(currentPipeline) === JSON.stringify(newPipeline)) {
      return;
    }
    
    // Remove any future history when making a new change
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newPipeline]);
    
    // Limit history to last 50 actions to prevent memory issues
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(newHistory.length - 1);
    }
    
    setHistory(newHistory);
  }, [history, historyIndex]);
  
  const addStep = useCallback((operationName: string, params: Record<string, any> = {}) => {
    const newStep: PipelineStep = {
      // Date.now() alone collides when two steps are added in the same
      // millisecond (duplicate React keys; editing one step edited both).
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: operationName,
      params
    };
    const newPipeline = [...pipeline, newStep];
    setPipelineState(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const removeStep = useCallback((index: number) => {
    const newPipeline = pipeline.filter((_, i) => i !== index);
    setPipelineState(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const updateStepParam = useCallback((stepId: string, paramName: string, value: any) => {
    const newPipeline = pipeline.map(step => 
      step.id === stepId 
        ? { ...step, params: { ...step.params, [paramName]: value } }
        : step
    );
    setPipelineState(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const moveStep = useCallback((fromIndex: number, toIndex: number) => {
    const newPipeline = [...pipeline];
    const [movedStep] = newPipeline.splice(fromIndex, 1);
    newPipeline.splice(toIndex, 0, movedStep);
    setPipelineState(newPipeline);
    saveToHistory(newPipeline);
  }, [pipeline, saveToHistory]);
  
  const resetPipeline = useCallback(() => {
    const newPipeline: PipelineStep[] = [];
    setPipelineState(newPipeline);
    saveToHistory(newPipeline);
  }, [saveToHistory]);
  
  const setPipeline = useCallback((newPipeline: PipelineStep[]) => {
    // Add unique IDs to loaded steps if they don't have them
    const stepsWithIds = newPipeline.map((step, index) => ({
      ...step,
      id: step.id || `step_${Date.now()}_${index}`
    }));
    
    setPipelineState(stepsWithIds);
    saveToHistory(stepsWithIds);
  }, [saveToHistory]);
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPipelineState([...history[newIndex]]);
    }
  }, [history, historyIndex]);
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPipelineState([...history[newIndex]]);
    }
  }, [history, historyIndex]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const value: PipelineContextType = {
    pipeline,
    addStep,
    removeStep,
    updateStepParam,
    moveStep,
    resetPipeline,
    setPipeline,
    undo,
    redo,
    canUndo,
    canRedo,
  };

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
};
