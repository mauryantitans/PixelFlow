import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Link2, Link2Off } from 'lucide-react';
import { pipelineService } from '../services/auth';
import { ShareLink } from '../types';
import { announce } from '../utils/announce';

interface Props {
  pipelineId: number;
  pipelineName: string;
}

/**
 * Share-by-link controls for one saved pipeline: create a link, copy it, or
 * turn sharing off (the old link then stops working). Anyone with the link can
 * view the steps and open them in their own workspace; they never see images.
 */
const SharePanel: React.FC<Props> = ({ pipelineId, pipelineName }) => {
  const [share, setShare] = useState<ShareLink | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    pipelineService
      .getShareLink(pipelineId)
      .then((s) => !cancelled && setShare(s))
      .catch(() => !cancelled && setShare(null));
    return () => {
      cancelled = true;
    };
  }, [pipelineId]);

  const url = share ? `${window.location.origin}${share.path}` : '';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      announce('Link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: select the text so Ctrl/Cmd+C works.
      inputRef.current?.select();
      announce('Press Control or Command plus C to copy the selected link');
    }
  };

  if (share === undefined) return <p role="status" className="text-xs text-gray-600">Checking sharing…</p>;

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
      {share ? (
        <>
          <label htmlFor={inputId} className="block text-xs font-medium text-gray-800">
            Anyone with this link can view and copy “{pipelineName}”
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id={inputId}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-gray-500 bg-white px-2 py-1.5 text-xs font-mono text-gray-900"
            />
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700">
            <span>
              Opened {share.view_count} time{share.view_count === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await pipelineService.deleteShareLink(pipelineId);
                  setShare(null);
                  announce('Sharing turned off. The link no longer works.');
                })
              }
              className="flex items-center gap-1 rounded px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Link2Off aria-hidden="true" size={14} /> Stop sharing
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-700">Share a read-only link to these steps. Your images are never shared.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setShare(await pipelineService.createShareLink(pipelineId));
                announce('Share link created');
              })
            }
            className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Link2 aria-hidden="true" size={14} /> Create link
          </button>
        </div>
      )}
      <p role="alert" className={error ? 'text-xs text-red-700' : 'sr-only'}>
        {error}
      </p>
    </div>
  );
};

export default SharePanel;
