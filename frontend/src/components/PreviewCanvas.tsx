import React, { useEffect, useRef, useState } from 'react';
import { usePicker } from '../contexts/PickerContext';
import { usePipelineContext } from '../contexts/PipelineContext';
import { announce } from '../utils/announce';

interface PreviewCanvasProps {
  src: string;
  alt?: string;
  className?: string;
}

// Map a client point to normalized [0..1] image coords, accounting for any
// object-contain letterboxing.
function toNormalized(img: HTMLImageElement, clientX: number, clientY: number) {
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || rect.width === 0 || rect.height === 0) return null;
  const elAR = rect.width / rect.height;
  const imAR = nw / nh;
  let cw: number, ch: number, ox: number, oy: number;
  if (imAR > elAR) {
    cw = rect.width;
    ch = rect.width / imAR;
    ox = 0;
    oy = (rect.height - ch) / 2;
  } else {
    ch = rect.height;
    cw = rect.height * imAR;
    oy = 0;
    ox = (rect.width - cw) / 2;
  }
  const x = (clientX - rect.left - ox) / cw;
  const y = (clientY - rect.top - oy) / ch;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

// Inverse of toNormalized: where a normalized image point sits inside the
// <img> element box, as percentages (used to draw the keyboard crosshair).
function toElementPercent(img: HTMLImageElement | null, nx: number, ny: number) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return { left: nx * 100, top: ny * 100 };
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { left: nx * 100, top: ny * 100 };
  const elAR = rect.width / rect.height;
  const imAR = img.naturalWidth / img.naturalHeight;
  let cw = rect.width, ch = rect.height, ox = 0, oy = 0;
  if (imAR > elAR) {
    ch = rect.width / imAR;
    oy = (rect.height - ch) / 2;
  } else {
    cw = rect.height * imAR;
    ox = (rect.width - cw) / 2;
  }
  return { left: ((ox + nx * cw) / rect.width) * 100, top: ((oy + ny * ch) / rect.height) * 100 };
}

function sampleHex(img: HTMLImageElement, nx: number, ny: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const px = Math.min(img.naturalWidth - 1, Math.round(nx * img.naturalWidth));
  const py = Math.min(img.naturalHeight - 1, Math.round(ny * img.naturalHeight));
  try {
    const d = ctx.getImageData(px, py, 1, 1).data;
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(d[0])}${h(d[1])}${h(d[2])}`;
  } catch {
    return null;
  }
}

/**
 * The preview image plus a transparent overlay that — when a coordinate/color
 * picker is armed — captures click (point), drag (rect) or click-sample (color)
 * and writes the normalized value back into the pipeline step.
 */
const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ src, alt, className }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const { activePicker, clear } = usePicker();
  const { updateStepParam } = usePipelineContext();
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const type = activePicker?.type;
  const armed = !!activePicker;

  // Keyboard picking: a crosshair moved with the arrow keys (WCAG 2.1.1).
  const overlayRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!armed) return;
    setCursor({ x: 0.5, y: 0.5 });
    setAnchor(null);
    openerRef.current = document.activeElement as HTMLElement | null;
    // Move keyboard focus onto the image so arrow keys work right away.
    const raf = window.requestAnimationFrame(() => overlayRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [armed, activePicker?.stepId, activePicker?.paramName]);

  const restoreFocus = () => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && document.contains(opener)) window.requestAnimationFrame(() => opener.focus());
  };

  const commit = (value: any) => {
    if (!activePicker) return;
    updateStepParam(activePicker.stepId, activePicker.paramName, value);
    clear();
    setAnchor(null);
  };

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!armed) return;
    const step = e.shiftKey ? 0.1 : 0.01;
    const move = (dx: number, dy: number) => {
      e.preventDefault();
      setCursor((c) => {
        const n = { x: Math.min(1, Math.max(0, c.x + dx)), y: Math.min(1, Math.max(0, c.y + dy)) };
        announce(`x ${pct(n.x)}, y ${pct(n.y)}`);
        return n;
      });
    };
    switch (e.key) {
      case 'ArrowLeft': return move(-step, 0);
      case 'ArrowRight': return move(step, 0);
      case 'ArrowUp': return move(0, -step);
      case 'ArrowDown': return move(0, step);
      case 'Escape':
        e.preventDefault();
        clear();
        setAnchor(null);
        announce('Picking cancelled');
        restoreFocus();
        return;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (type === 'point' || type === 'points') {
          commit(type === 'points' ? [cursor] : cursor);
          announce(`Point set at x ${pct(cursor.x)}, y ${pct(cursor.y)}`);
          restoreFocus();
        } else if (type === 'color') {
          const hex = imgRef.current ? sampleHex(imgRef.current, cursor.x, cursor.y) : null;
          if (hex) {
            commit(hex);
            announce(`Colour ${hex} picked`);
            restoreFocus();
          }
        } else if (type === 'rect') {
          if (!anchor) {
            setAnchor(cursor);
            announce('First corner set. Move to the opposite corner and press Enter.');
          } else {
            const x = Math.min(anchor.x, cursor.x);
            const y = Math.min(anchor.y, cursor.y);
            const w = Math.abs(cursor.x - anchor.x);
            const h = Math.abs(cursor.y - anchor.y);
            if (w > 0.01 && h > 0.01) {
              commit({ x, y, w, h });
              announce(`Region set: x ${pct(x)}, y ${pct(y)}, width ${pct(w)}, height ${pct(h)}`);
              restoreFocus();
            } else {
              announce('Region is too small. Move further from the first corner.');
            }
          }
        }
        return;
      }
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (!armed || !imgRef.current) return;
    const n = toNormalized(imgRef.current, e.clientX, e.clientY);
    if (!n) return;
    if (type === 'point' || type === 'points') {
      commit(type === 'points' ? [n] : n);
    } else if (type === 'color') {
      const hex = sampleHex(imgRef.current, n.x, n.y);
      if (hex) commit(hex);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!armed || type !== 'rect' || !imgRef.current) return;
    const n = toNormalized(imgRef.current, e.clientX, e.clientY);
    if (n) setDrag({ x0: n.x, y0: n.y, x1: n.x, y1: n.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag || !imgRef.current) return;
    const n = toNormalized(imgRef.current, e.clientX, e.clientY);
    if (n) setDrag((d) => (d ? { ...d, x1: n.x, y1: n.y } : d));
  };

  const onMouseUp = () => {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    if (w > 0.01 && h > 0.01) commit({ x, y, w, h });
  };

  const kbBand = anchor
    ? (() => {
        const a = toElementPercent(imgRef.current, Math.min(anchor.x, cursor.x), Math.min(anchor.y, cursor.y));
        const b = toElementPercent(imgRef.current, Math.max(anchor.x, cursor.x), Math.max(anchor.y, cursor.y));
        return { left: `${a.left}%`, top: `${a.top}%`, width: `${b.left - a.left}%`, height: `${b.top - a.top}%` };
      })()
    : null;
  const cross = toElementPercent(imgRef.current, cursor.x, cursor.y);

  const band = drag
    ? {
        left: `${Math.min(drag.x0, drag.x1) * 100}%`,
        top: `${Math.min(drag.y0, drag.y1) * 100}%`,
        width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
        height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
      }
    : null;

  const hint = type === 'rect' ? 'Drag to draw a region' : type === 'color' ? 'Click to pick a color' : 'Click to place the point';
  const keyboardHint =
    type === 'rect'
      ? 'Keyboard: arrow keys move (Shift = 10%), Enter sets the first corner, then Enter again sets the opposite corner. Escape cancels.'
      : 'Keyboard: arrow keys move (Shift = 10%), Enter places it. Escape cancels.';

  return (
    <div className="relative inline-flex max-w-full max-h-full">
      <img ref={imgRef} src={src} alt={alt} className={className} />
      {armed && (
        <div
          ref={overlayRef}
          data-testid="preview-picker-overlay"
          role="application"
          tabIndex={0}
          aria-label={`Image picker. ${hint}.`}
          aria-describedby="picker-keyboard-hint"
          onKeyDown={onKeyDown}
          className="absolute inset-0 cursor-crosshair"
          onClick={onClick}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {band && <div className="absolute border-2 border-blue-500 bg-blue-500/20" style={band} />}
          {kbBand && <div aria-hidden="true" className="absolute border-2 border-dashed border-blue-500 bg-blue-500/20" style={kbBand} />}
          {/* Keyboard crosshair */}
          <div
            aria-hidden="true"
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white ring-2 ring-blue-700 pointer-events-none"
            style={{ left: `${cross.left}%`, top: `${cross.top}%` }}
          />
          <div className="absolute top-2 left-2 text-[11px] font-medium bg-blue-700 text-white px-2 py-1 rounded shadow max-w-[90%]">
            {hint}
            <span id="picker-keyboard-hint" className="block font-normal">{keyboardHint}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewCanvas;
