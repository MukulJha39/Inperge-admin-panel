import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogImage } from '../api/types';
import { useFocusTrap } from '../utils/useFocusTrap';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalLinkIcon, ImageIcon, PlusIcon, TrashIcon } from './Icon';

/**
 * Photos of products, services and raw materials. Merchants add them from the app, and
 * support can manage them on a merchant's behalf: a thumbnail in lists, a gallery in the
 * edit drawer (editable where the administrator may manage the record), and a full-size
 * viewer for both.
 */

interface WithImages {
  imageUrl: string | null;
  images?: CatalogImage[];
}

/** A record's photos, cover first. Falls back to `imageUrl` for an older API. */
export function imagesOf(record: WithImages): CatalogImage[] {
  if (record.images) return record.images;
  if (!record.imageUrl) return [];
  return [
    {
      id: 'cover',
      url: record.imageUrl,
      thumbnailUrl: record.imageUrl,
      width: null,
      height: null,
      bytes: null,
      isCover: true,
      createdAt: '',
    },
  ];
}

/* --------------------------------- viewer --------------------------------- */

interface ImageViewerProps {
  images: CatalogImage[];
  startIndex: number;
  title: string;
  onClose: () => void;
}

export function ImageViewer({ images, startIndex, title, onClose }: ImageViewerProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), images.length - 1));
  const [loaded, setLoaded] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(dialogRef, { active: true, onEscape: onClose });

  const count = images.length;
  const go = useCallback(
    (step: number) => {
      if (count < 2) return;
      setDirection(step > 0 ? 'next' : 'prev');
      setLoaded(false);
      setIndex((current) => (current + step + count) % count);
    },
    [count],
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [go]);

  const image = images[index];
  if (!image) return null;

  return createPortal(
    <div
      className="viewer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="viewer__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="viewer__bar">
          <div className="viewer__heading">
            <h2 className="viewer__title" id={titleId}>
              {title}
            </h2>
            <span className="viewer__count">
              Photo {index + 1} of {count}
              {image.isCover ? ' · Cover' : ''}
            </span>
          </div>
          <div className="row gap-2">
            <a className="viewer__action" href={image.url} target="_blank" rel="noreferrer noopener">
              <ExternalLinkIcon size={15} />
              <span>Original</span>
            </a>
            <button type="button" className="viewer__icon" aria-label="Close photo viewer" onClick={onClose}>
              <CloseIcon size={18} />
            </button>
          </div>
        </header>

        <div className="viewer__stage">
          {count > 1 ? (
            <button type="button" className="viewer__nav viewer__nav--prev" aria-label="Previous photo" onClick={() => go(-1)}>
              <ChevronLeftIcon size={22} />
            </button>
          ) : null}

          <div className={`viewer__frame${loaded ? ' viewer__frame--loaded' : ''}`}>
            <span className="viewer__spinner" aria-hidden="true" />
            <img
              key={image.id}
              className={`viewer__image viewer__image--${direction}`}
              src={image.url}
              alt={`${title} (${index + 1} of ${count})`}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          </div>

          {count > 1 ? (
            <button type="button" className="viewer__nav viewer__nav--next" aria-label="Next photo" onClick={() => go(1)}>
              <ChevronRightIcon size={22} />
            </button>
          ) : null}
        </div>

        {count > 1 ? (
          <div className="viewer__strip" role="group" aria-label="All photos">
            {images.map((entry, position) => (
              <button
                key={entry.id}
                type="button"
                className={`viewer__thumb${position === index ? ' viewer__thumb--active' : ''}`}
                aria-label={`Show photo ${position + 1}`}
                aria-current={position === index ? 'true' : undefined}
                onClick={() => {
                  if (position === index) return;
                  setDirection(position > index ? 'next' : 'prev');
                  setLoaded(false);
                  setIndex(position);
                }}
              >
                <img src={entry.thumbnailUrl} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ list thumbnail ----------------------------- */

interface ImageThumbProps {
  record: WithImages;
  name: string;
  size?: number;
}

/** The cover photo as a small square; opens the viewer when there is one. */
export function ImageThumb({ record, name, size = 36 }: ImageThumbProps) {
  const images = imagesOf(record);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const cover = images[0];
  const style = { width: size, height: size };

  if (!cover || failed) {
    return (
      <span className="thumb thumb--empty" style={style} aria-hidden="true">
        <ImageIcon size={Math.round(size * 0.45)} />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="thumb"
        style={style}
        aria-label={`View ${images.length} photo${images.length === 1 ? '' : 's'} of ${name}`}
        onClick={(event) => {
          // Rows can be clickable; looking at a photo should not also open the row.
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <img src={cover.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        {images.length > 1 ? <span className="thumb__count">+{images.length - 1}</span> : null}
      </button>
      {open ? <ImageViewer images={images} startIndex={0} title={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A list cell: the cover thumbnail beside the record's name. */
export function NameWithThumb({ record, name }: { record: WithImages; name: string }) {
  return (
    <span className="name-thumb">
      <ImageThumb record={record} name={name} />
      <span className="text-medium truncate">{name}</span>
    </span>
  );
}

/* --------------------------------- gallery -------------------------------- */

/** Every photo of a record, for the edit drawer. Read-only: merchants manage photos in the app. */
export function ImageGallery({ record, name }: { record: WithImages; name: string }) {
  const images = imagesOf(record);
  const [viewing, setViewing] = useState<number | null>(null);

  return (
    <section className="gallery" aria-label="Photos">
      <div className="gallery__head">
        <span className="field__label">Photos</span>
        <span className="text-xs text-secondary">
          {images.length === 0 ? 'None yet' : `${images.length} added by the merchant`}
        </span>
      </div>

      {images.length === 0 ? (
        <div className="gallery__empty">
          <ImageIcon size={20} />
          <span>The merchant hasn&apos;t added any photos. They add them from the app.</span>
        </div>
      ) : (
        <ul className="gallery__grid">
          {images.map((image, index) => (
            <li key={image.id} className="gallery__cell" style={{ animationDelay: `${index * 40}ms` }}>
              <button
                type="button"
                className="gallery__tile"
                aria-label={`View photo ${index + 1} of ${images.length}`}
                onClick={() => setViewing(index)}
              >
                <img src={image.thumbnailUrl} alt="" loading="lazy" />
                {image.isCover ? <span className="gallery__badge">Cover</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewing !== null ? (
        <ImageViewer images={images} startIndex={viewing} title={name} onClose={() => setViewing(null)} />
      ) : null}
    </section>
  );
}

/* ------------------------------ managing photos ----------------------------- */

/** The most photos a record can carry, matching the API. */
export const MAX_IMAGES = 8;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Checks files before they are sent, so a wrong pick is explained without a round trip. */
export function checkImageFiles(files: File[], room: number): string | null {
  if (files.length > room) {
    return room === 0
      ? `This already has ${MAX_IMAGES} photos. Remove one before adding another.`
      : `You can add ${room} more photo${room === 1 ? '' : 's'}.`;
  }
  if (files.some((file) => !ACCEPTED.includes(file.type))) return 'Choose PNG, JPG or WebP images.';
  if (files.some((file) => file.size > MAX_BYTES)) return 'Each photo must be smaller than 5 MB.';
  return null;
}

function AddPhotosTile({ disabled, onPick }: { disabled: boolean; onPick: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <li className="gallery__cell">
      <button
        type="button"
        className="gallery__tile gallery__tile--add"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <PlusIcon size={18} />
        <span>Add photos</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        hidden
        aria-label="Choose photos to upload"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onPick(files);
        }}
      />
    </li>
  );
}

interface ImageManagerProps {
  record: WithImages;
  name: string;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (image: CatalogImage) => Promise<void>;
  onMakeCover: (image: CatalogImage) => Promise<void>;
}

/**
 * An editable gallery: add photos, choose the cover, remove one. Each action is saved
 * straight away, as it is in the merchant app, and the parent receives the updated record.
 */
export function ImageManager({ record, name, onUpload, onRemove, onMakeCover }: ImageManagerProps) {
  const images = imagesOf(record);
  const [viewing, setViewing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gallery" aria-label="Photos" aria-busy={busy}>
      <div className="gallery__head">
        <span className="field__label">Photos</span>
        <span className="text-xs text-secondary">
          {images.length} of {MAX_IMAGES}
          {busy ? ' · saving…' : ''}
        </span>
      </div>

      <ul className="gallery__grid">
        {images.map((image, index) => (
          <li key={image.id} className="gallery__cell" style={{ animationDelay: `${index * 40}ms` }}>
            <button
              type="button"
              className="gallery__tile"
              aria-label={`View photo ${index + 1} of ${images.length}`}
              onClick={() => setViewing(index)}
            >
              <img src={image.thumbnailUrl} alt="" loading="lazy" />
              {image.isCover ? <span className="gallery__badge">Cover</span> : null}
            </button>
            <span className="gallery__tools">
              {!image.isCover ? (
                <button
                  type="button"
                  className="gallery__tool"
                  disabled={busy}
                  onClick={() => void run(() => onMakeCover(image))}
                >
                  Make cover
                </button>
              ) : null}
              <button
                type="button"
                className="gallery__tool gallery__tool--danger"
                aria-label={`Remove photo ${index + 1}`}
                disabled={busy}
                onClick={() => void run(() => onRemove(image))}
              >
                <TrashIcon size={13} />
              </button>
            </span>
          </li>
        ))}
        {images.length < MAX_IMAGES ? (
          <AddPhotosTile
            disabled={busy}
            onPick={(files) => {
              const issue = checkImageFiles(files, MAX_IMAGES - images.length);
              if (issue) setProblem(issue);
              else void run(() => onUpload(files));
            }}
          />
        ) : null}
      </ul>

      {problem ? (
        <span className="field__error" role="alert">
          {problem}
        </span>
      ) : (
        <span className="field__hint">PNG, JPG or WebP, up to 5 MB each. The first photo is the cover.</span>
      )}

      {viewing !== null && images.length > 0 ? (
        <ImageViewer images={images} startIndex={viewing} title={name} onClose={() => setViewing(null)} />
      ) : null}
    </section>
  );
}

/** Photos chosen before a record exists; they are uploaded right after it is created. */
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const canPreview = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    const urls = canPreview ? files.map((file) => URL.createObjectURL(file)) : files.map(() => '');
    setPreviews(urls);
    return () => {
      if (canPreview) urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  return (
    <section className="gallery" aria-label="Photos">
      <div className="gallery__head">
        <span className="field__label">
          Photos <span className="field__optional">Optional</span>
        </span>
        <span className="text-xs text-secondary">
          {files.length} of {MAX_IMAGES}
        </span>
      </div>
      <ul className="gallery__grid">
        {files.map((file, index) => (
          <li key={`${file.name}-${index}`} className="gallery__cell">
            <span className="gallery__tile">
              {previews[index] ? <img src={previews[index]} alt="" /> : null}
              {index === 0 ? <span className="gallery__badge">Cover</span> : null}
            </span>
            <span className="gallery__tools">
              <button
                type="button"
                className="gallery__tool gallery__tool--danger"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, position) => position !== index))}
              >
                <TrashIcon size={13} />
              </button>
            </span>
          </li>
        ))}
        {files.length < MAX_IMAGES ? (
          <AddPhotosTile
            disabled={false}
            onPick={(picked) => {
              const issue = checkImageFiles(picked, MAX_IMAGES - files.length);
              setProblem(issue);
              if (!issue) onChange([...files, ...picked]);
            }}
          />
        ) : null}
      </ul>
      {problem ? (
        <span className="field__error" role="alert">
          {problem}
        </span>
      ) : (
        <span className="field__hint">Uploaded once the record is saved. The first photo is the cover.</span>
      )}
    </section>
  );
}
