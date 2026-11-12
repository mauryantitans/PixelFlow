import React, { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';

/** Public-domain / CC0 images from scikit-image, served from /samples (see CREDITS.md there). */
export const SAMPLE_IMAGES = [
  { key: 'astronaut', label: 'Astronaut', credit: 'NASA, public domain' },
  { key: 'chelsea', label: 'Cat', credit: 'Stéfan van der Walt, CC0' },
  { key: 'coffee', label: 'Coffee', credit: 'Rachel Michetti, CC0' },
  { key: 'rocket', label: 'Rocket launch', credit: 'SpaceX, public domain' },
  { key: 'coins', label: 'Coins', credit: 'scikit-image, no known restrictions' },
  { key: 'immunohistochemistry', label: 'Microscopy', credit: 'scikit-image, no known restrictions' },
] as const;

interface Props {
  /** Receives the sample as a File, so it goes through the normal upload. */
  onPick: (file: File) => Promise<void> | void;
}

/** "Try a sample" button + panel of sample photos (disclosure, like the appearance menu). */
const SampleImagesMenu: React.FC<Props> = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button[data-sample]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const pick = async (key: string) => {
    setBusy(key);
    try {
      const res = await fetch(`/samples/${key}.jpg`);
      const blob = await res.blob();
      await onPick(new File([blob], `${key}.jpg`, { type: 'image/jpeg' }));
      setOpen(false);
      buttonRef.current?.focus();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="btn-secondary flex items-center gap-2"
      >
        <ImagePlus aria-hidden="true" className="w-4 h-4" />
        Try a sample
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          className="absolute left-0 top-full mt-2 z-[60] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-3"
        >
          <h2 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2">
            Sample images
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {SAMPLE_IMAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                data-sample={s.key}
                onClick={() => pick(s.key)}
                disabled={busy !== null}
                aria-label={`Add sample image: ${s.label}`}
                className="group rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 text-left disabled:opacity-60"
              >
                <img src={`/samples/${s.key}-thumb.jpg`} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                <span className="block px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 truncate">
                  {busy === s.key ? 'Adding…' : s.label}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Public domain / CC0 photos from scikit-image.</p>
        </div>
      )}
    </div>
  );
};

export default SampleImagesMenu;
