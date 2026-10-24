import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { deleteImage, loadImage, saveImage } from './data';
import { compressImage } from './images';
import type { ImageDoc } from './types';

// ---------------------------------------------------------------------------
// Bottom sheet used for every form.

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate entry. iPhone's number pad has no minus key, so each axis gets its
// own ± toggle and the field itself only ever holds digits.

export interface CoordValue {
  abs: string;
  neg: boolean;
}

export const emptyCoord = (): CoordValue => ({ abs: '', neg: false });
export const coordFrom = (n: number | null): CoordValue => (n === null ? emptyCoord() : { abs: String(Math.abs(n)), neg: n < 0 });
export const coordTo = (c: CoordValue): number | null => (c.abs === '' ? null : (c.neg ? -1 : 1) * Number(c.abs));

export function CoordInput({
  axis,
  value,
  onChange,
  onPasteAll,
  optional,
  autoFocus,
}: {
  axis: string;
  value: CoordValue;
  onChange: (v: CoordValue) => void;
  onPasteAll?: (text: string) => boolean;
  optional?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className={`coord ${value.neg ? 'neg' : ''}`}>
      <span className="coord-axis">{axis}</span>
      <button
        type="button"
        className="sign"
        tabIndex={-1}
        aria-label={`${axis} is ${value.neg ? 'negative' : 'positive'}, tap to flip`}
        aria-pressed={value.neg}
        onPointerDown={(e) => e.preventDefault() /* keep the keyboard up */}
        onClick={() => onChange({ ...value, neg: !value.neg })}
      >
        {value.neg ? '−' : '+'}
      </button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="next"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={optional ? 'opt.' : '0'}
        aria-label={`${axis} coordinate`}
        value={value.abs}
        onPaste={(e) => {
          if (onPasteAll?.(e.clipboardData.getData('text'))) e.preventDefault();
        }}
        onChange={(e) => {
          const raw = e.target.value;
          // Android keypads do have a minus key: treat it as the sign toggle.
          const neg = raw.includes('-') || raw.includes('−') ? !value.neg : value.neg;
          onChange({ abs: raw.replace(/\D/g, '').slice(0, 8), neg });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Images

export function Thumb({ worldId, id, onOpen }: { worldId: string; id: string; onOpen?: (img: ImageDoc) => void }) {
  const [img, setImg] = useState<ImageDoc | null | undefined>();
  useEffect(() => {
    let live = true;
    loadImage(worldId, id).then((i) => live && setImg(i), () => live && setImg(null));
    return () => {
      live = false;
    };
  }, [worldId, id]);
  if (img === undefined) return <div className="thumb loading" />;
  if (img === null) return <div className="thumb missing">?</div>;
  return (
    <button type="button" className="thumb" onClick={() => onOpen?.(img)}>
      <img src={img.dataUrl} alt="" loading="lazy" />
    </button>
  );
}

export function ImageStrip({ worldId, ids }: { worldId: string; ids: string[] }) {
  const lightbox = useLightbox();
  if (!ids.length) return null;
  return (
    <div className="thumbs">
      {ids.map((id) => (
        <Thumb key={id} worldId={worldId} id={id} onOpen={lightbox} />
      ))}
    </div>
  );
}

/**
 * Once a form closes, drop the photos nobody kept: ones removed before Save, or
 * ones added to a form that was then cancelled.
 */
export function settleImages(worldId: string, before: string[], after: string[], saved: boolean) {
  const [keep, other] = saved ? [after, before] : [before, after];
  for (const id of other) if (!keep.includes(id)) deleteImage(worldId, id);
}

/** Pick photos, compress them, and save each one immediately. */
export function ImagePicker({
  worldId,
  ids,
  onChange,
  label = 'Add photo',
}: {
  worldId: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="thumbs editable">
      {ids.map((id) => (
        <div key={id} className="thumb-wrap">
          <Thumb worldId={worldId} id={id} />
          <button
            type="button"
            className="thumb-remove"
            aria-label="Remove photo"
            onClick={() => onChange(ids.filter((i) => i !== id))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="thumb add" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? '…' : `📷 ${label}`}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          setBusy(true);
          const added: string[] = [];
          for (const f of files) {
            try {
              added.push(saveImage(worldId, await compressImage(f)));
            } catch (err) {
              console.error(err);
              toast(`Couldn't read ${f.name}`);
            }
          }
          setBusy(false);
          onChange([...ids, ...added]);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts (with optional Undo) and a full-screen image viewer.

type ToastFn = (message: string, undo?: () => void) => void;
const ToastCtx = createContext<ToastFn>(() => {});
const LightboxCtx = createContext<(img: ImageDoc) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export const useLightbox = () => useContext(LightboxCtx);

export function Overlays({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; undo?: () => void; key: number } | null>(null);
  const [image, setImage] = useState<ImageDoc | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={(message, undo) => setToast({ message, undo, key: Date.now() })}>
      <LightboxCtx.Provider value={setImage}>
        {children}
        {toast && (
          <div className="toast" key={toast.key} role="status">
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  toast.undo!();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
        {image && (
          <div className="lightbox" onClick={() => setImage(null)}>
            <img src={image.dataUrl} alt="" />
          </div>
        )}
      </LightboxCtx.Provider>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------------------

/** Plain text with any URLs turned into links. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {prettyUrl(p)}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^(www|m)\./, '') + (u.pathname.length > 1 ? u.pathname.slice(0, 24) : '');
  } catch {
    return url;
  }
}

export function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
