import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogImage } from '../api/types';
import { useFocusTrap } from '../utils/useFocusTrap';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalLinkIcon, ImageIcon } from './Icon';

/**
 * Photos merchants add to products and raw materials from the app. The admin panel
 * only displays them: a thumbnail in lists, a gallery in the edit drawer, and a
 * full-size viewer for both.
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
              alt={`${title}, photo ${index + 1} of ${count}`}
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
