import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Layers, User } from 'lucide-react';
import { Header } from './Header';
import { pipelineService } from '../services/auth';
import { SharedPipelineView } from '../types';
import { usePipelineContext } from '../contexts/PipelineContext';
import { useOperationSchema } from '../contexts/OperationSchemaContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { announce } from '../utils/announce';
import { stepDisplayName } from '../utils/pipelineSteps';

/** /p/:token: a pipeline someone shared by link. No account needed. */
export const SharedPipelinePage: React.FC = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { pipeline, setPipeline } = usePipelineContext();
  const { getOp } = useOperationSchema();
  const [data, setData] = useState<SharedPipelineView | null>(null);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useDocumentTitle(data ? `${data.name} (shared pipeline)` : error ? 'Link not found' : 'Shared pipeline');

  useEffect(() => {
    let cancelled = false;
    pipelineService
      .getSharedPipeline(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.detail || "This share link doesn't exist or was turned off.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (data || error) headingRef.current?.focus();
  }, [data, error]);

  const open = () => {
    if (!data) return;
    setPipeline(
      data.pipeline_data.map((s, i) => ({
        id: `step_${Date.now()}_${i}`,
        name: s.name,
        params: s.params || {},
        enabled: s.enabled !== false,
      })),
    );
    announce(`Opened ${data.name} in the workspace`);
    navigate('/app');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-10 focus:outline-none">
        {!data && !error && (
          <p role="status" className="text-slate-700 dark:text-slate-300">Loading shared pipeline…</p>
        )}

        {error && (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-slate-900 dark:text-slate-50 focus:outline-none">
              Link not found
            </h1>
            <p className="text-slate-700 dark:text-slate-300">{error}</p>
            <Link to="/app" className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300 underline">
              Go to the workspace <ArrowRight aria-hidden="true" className="w-4 h-4" />
            </Link>
          </div>
        )}

        {data && (
          <article className="space-y-6">
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Shared pipeline</p>
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-slate-900 dark:text-slate-50 focus:outline-none">
                {data.name}
              </h1>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                {data.author && (
                  <span className="inline-flex items-center gap-1">
                    <User aria-hidden="true" className="w-4 h-4" /> by {data.author}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Layers aria-hidden="true" className="w-4 h-4" /> {data.pipeline_data.length} step{data.pipeline_data.length === 1 ? '' : 's'}
                </span>
              </p>
              {data.description && <p className="text-slate-700 dark:text-slate-300">{data.description}</p>}
            </header>

            <section aria-labelledby="shared-steps-heading" className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
              <h2 id="shared-steps-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-3">Steps</h2>
              <ol className="space-y-2">
                {data.pipeline_data.map((s, i) => {
                  const label = stepDisplayName(s, getOp(s.name)?.label);
                  const params = Object.entries(s.params || {}).filter(([k]) => k !== 'steps' && k !== 'filter_name');
                  return (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-zinc-800 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-50">
                          {label}
                          {s.enabled === false && <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-400">(off)</span>}
                        </p>
                        {params.length > 0 && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 break-words">
                            {params.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="space-y-2">
              <button type="button" onClick={open} className="btn-primary inline-flex items-center gap-2">
                Open in workspace <ArrowRight aria-hidden="true" className="w-4 h-4" />
              </button>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {pipeline.length > 0
                  ? 'This replaces the pipeline you are building (Undo brings it back). '
                  : ''}
                You'll add your own images; nothing else is shared.
              </p>
            </div>
          </article>
        )}
      </main>
    </div>
  );
};

export default SharedPipelinePage;
