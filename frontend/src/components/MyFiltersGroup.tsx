import React from 'react';
import * as LucideReact from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMyFilters } from '../hooks/useMyFilters';
import { SavedPipeline } from '../types';

interface Props {
  onAdd: (filter: SavedPipeline) => void;
  onHint: (text: string | null) => void;
}

/**
 * "My filters" in the Custom section of the operations sidebar: the user's
 * pipelines saved as reusable filters. Adding one inserts a single
 * Custom Filter step that runs the saved steps.
 */
const MyFiltersGroup: React.FC<Props> = ({ onAdd, onHint }) => {
  const { filters, loading, isAuthenticated } = useMyFilters();

  return (
    <div className="category-container">
      <details open className="operation-group">
        <summary className="category-header">
          <div className="flex items-center">
            <LucideReact.Bookmark aria-hidden="true" className="w-3 h-3 mr-1" />
            <span className="text-slate-700 dark:text-slate-300">My filters</span>
          </div>
          <LucideReact.ChevronDown aria-hidden="true" className="w-3 h-3 chevron-icon" />
        </summary>

        {!isAuthenticated ? (
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
            <Link to="/auth" className="underline font-medium">Sign in</Link> to save a pipeline as your own filter and reuse it here.
          </p>
        ) : loading && filters.length === 0 ? (
          <p role="status" className="mt-2 text-xs text-slate-700 dark:text-slate-300">Loading your filters…</p>
        ) : filters.length === 0 ? (
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
            No filters yet. Build a pipeline, choose <strong>Save</strong> and tick <strong>Save as a reusable filter</strong>.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {filters.map((f) => {
              const descId = `my-filter-desc-${f.id}`;
              const desc = `${f.pipeline_data.length} step${f.pipeline_data.length === 1 ? '' : 's'}: ${f.pipeline_data.map((s) => s.name).join(', ')}`;
              return (
                <button
                  key={f.id}
                  type="button"
                  data-filter={f.name}
                  onClick={() => onAdd(f)}
                  onMouseEnter={() => onHint(`${f.name}: ${desc}`)}
                  onFocus={() => onHint(`${f.name}: ${desc}`)}
                  aria-label={`Add filter ${f.name}`}
                  aria-describedby={descId}
                  className="operation-btn-enhanced group"
                >
                  {f.name}
                  <span id={descId} hidden>{desc}</span>
                </button>
              );
            })}
          </div>
        )}
      </details>
    </div>
  );
};

export default MyFiltersGroup;
