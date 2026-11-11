import React, { useRef, useState } from 'react';

interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Before/after comparison with a wipe divider.
 *
 * The divider handle is a real `role="slider"`: it can be dragged with a mouse,
 * finger or pen (pointer events), and moved with the keyboard — Left/Right
 * (1%), Shift+Arrow or PageUp/PageDown (10%), Home/End (0% / 100%).
 */
const CompareSlider: React.FC<CompareSliderProps> = ({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(50); // divider position, %

  const clamp = (p: number) => Math.min(100, Math.max(0, p));

  const update = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(clamp(((clientX - r.left) / r.width) * 100));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const small = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = pos - small;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = pos + small;
        break;
      case 'PageDown':
        next = pos - 10;
        break;
      case 'PageUp':
        next = pos + 10;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 100;
        break;
    }
    if (next !== null) {
      e.preventDefault();
      setPos(clamp(next));
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block max-w-full max-h-full select-none touch-none"
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      {/* Before image defines the box */}
      <img src={beforeSrc} alt={beforeLabel} className="block max-w-full max-h-full object-contain rounded-lg" />

      {/* After image shown to the RIGHT of the divider (matches the labels:
          before on the left, after on the right). It used to be clipped to the
          left side, so the "Before"/"After" captions were swapped. */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <img src={afterSrc} alt={afterLabel} className="absolute inset-0 w-full h-full object-contain rounded-lg" />
      </div>

      {/* Divider + handle */}
      <div className="absolute top-0 bottom-0" style={{ left: `${pos}%` }}>
        <div className="w-0.5 h-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" aria-hidden="true" />
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Comparison divider: ${beforeLabel} on the left, ${afterLabel} on the right`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${Math.round(pos)}% ${beforeLabel}, ${100 - Math.round(pos)}% ${afterLabel}`}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.preventDefault();
            dragging.current = true;
            (e.currentTarget as HTMLElement).focus();
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow border-2 border-zinc-700 flex items-center justify-center cursor-ew-resize text-zinc-700 text-xs font-bold"
        >
          <span aria-hidden="true">⇆</span>
        </div>
      </div>

      <span className="absolute top-2 left-2 text-[11px] bg-black/75 text-white px-1.5 py-0.5 rounded" aria-hidden="true">{beforeLabel}</span>
      <span className="absolute top-2 right-2 text-[11px] bg-black/75 text-white px-1.5 py-0.5 rounded" aria-hidden="true">{afterLabel}</span>
    </div>
  );
};

export default CompareSlider;
