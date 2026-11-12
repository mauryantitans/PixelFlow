import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { pipelineService } from '../services/auth';
import { SavedPipeline } from '../types';
import { CUSTOM_FILTER_CATEGORY } from '../utils/pipelineSteps';

/** Fired after a filter is saved or deleted, so every list refreshes. */
export const FILTERS_CHANGED_EVENT = 'pixelflow:filters-changed';

/** The signed-in user's saved custom filters (pipelines saved "as a filter"). */
export function useMyFilters() {
  const { isAuthenticated } = useAuth();
  const [filters, setFilters] = useState<SavedPipeline[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setFilters([]);
      return;
    }
    setLoading(true);
    try {
      const list = await pipelineService.getUserPipelines(CUSTOM_FILTER_CATEGORY);
      setFilters([...list].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setFilters([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(FILTERS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FILTERS_CHANGED_EVENT, onChange);
  }, [load]);

  return { filters, loading, isAuthenticated, reload: load };
}
