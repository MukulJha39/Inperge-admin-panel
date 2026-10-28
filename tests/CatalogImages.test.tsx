import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import type { CatalogImage } from '../src/api/types';
import { ImageGallery, ImageThumb, imagesOf } from '../src/components/CatalogImages';
import { useFocusTrap } from '../src/utils/useFocusTrap';

function photo(id: string, isCover = false): CatalogImage {
  return {
    id,
    url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.jpg`,
    thumbnailUrl: `https://res.cloudinary.com/demo/image/upload/c_fill,w_240,h_240/v1/${id}.jpg`,
    width: 800,
    height: 600,
    bytes: 1000,
    isCover,
    createdAt: '2026-10-28T10:00:00.000Z',
  };
}

const THREE = [photo('a', true), photo('b'), photo('c')];

describe('imagesOf', () => {
  it('falls back to imageUrl when the API sends no gallery', () => {
    expect(imagesOf({ imageUrl: 'https://x/y.png' })).toEqual([
      expect.objectContaining({ id: 'cover', url: 'https://x/y.png', isCover: true }),
    ]);
    expect(imagesOf({ imageUrl: null })).toEqual([]);
    expect(imagesOf({ imageUrl: 'https://x/y.png', images: [] })).toEqual([]);
  });
});

describe('ImageThumb', () => {
  it('shows a placeholder, not a button, when there are no photos', () => {
    render(<ImageThumb record={{ imageUrl: null, images: [] }} name="Chai" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the cover thumbnail with a count of the rest', () => {
    render(<ImageThumb record={{ imageUrl: THREE[0]!.url, images: THREE }} name="Chai" />);
    const button = screen.getByRole('button', { name: 'View 3 photos of Chai' });
    expect(button.querySelector('img')).toHaveAttribute('src', THREE[0]!.thumbnailUrl);
    expect(within(button).getByText('+2')).toBeInTheDocument();
  });

  it('opens the full-size viewer and steps through photos with the arrows', async () => {
    const user = userEvent.setup();
    render(<ImageThumb record={{ imageUrl: THREE[0]!.url, images: THREE }} name="Chai" />);

    await user.click(screen.getByRole('button', { name: 'View 3 photos of Chai' }));
    const viewer = screen.getByRole('dialog', { name: 'Chai' });
    expect(within(viewer).getByText(/Photo 1 of 3/)).toBeInTheDocument();
    expect(within(viewer).getByAltText('Chai, photo 1 of 3')).toHaveAttribute('src', THREE[0]!.url);

    await user.keyboard('{ArrowRight}');
    expect(within(viewer).getByText(/Photo 2 of 3/)).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(within(viewer).getByText(/Photo 3 of 3/)).toBeInTheDocument();

    await user.click(within(viewer).getByRole('button', { name: 'Show photo 1' }));
    expect(within(viewer).getByText(/Photo 1 of 3 · Cover/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not let the click reach a clickable row', async () => {
    const user = userEvent.setup();
    const onRow = jest.fn();
    render(
      <div onClick={onRow}>
        <ImageThumb record={{ imageUrl: THREE[0]!.url, images: THREE }} name="Chai" />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: /View 3 photos/ }));
    expect(onRow).not.toHaveBeenCalled();
  });
});

/** A stand-in for the edit drawer: its own focus trap, closed by Escape. */
function DrawerWithGallery() {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: open, onEscape: () => setOpen(false) });
  if (!open) return <p>Drawer closed</p>;
  return (
    <div ref={ref} role="dialog" aria-label="Edit product">
      <ImageGallery record={{ imageUrl: THREE[0]!.url, images: THREE }} name="Chai" />
    </div>
  );
}

describe('ImageGallery', () => {
  it('explains where photos come from when there are none', () => {
    render(<ImageGallery record={{ imageUrl: null, images: [] }} name="Sugar" />);
    expect(screen.getByText(/hasn.t added any photos/)).toBeInTheDocument();
  });

  it('marks the cover and opens the viewer on the chosen photo', async () => {
    const user = userEvent.setup();
    render(<ImageGallery record={{ imageUrl: THREE[0]!.url, images: THREE }} name="Chai" />);

    expect(screen.getByText('Cover')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View photo 3 of 3' }));
    expect(screen.getByRole('dialog', { name: 'Chai' })).toHaveTextContent('Photo 3 of 3');
  });

  it('closes only the viewer, not the drawer underneath, on Escape', async () => {
    const user = userEvent.setup();
    render(<DrawerWithGallery />);

    await user.click(screen.getByRole('button', { name: 'View photo 1 of 3' }));
    expect(screen.getByRole('dialog', { name: 'Chai' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Chai' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit product' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByText('Drawer closed')).toBeInTheDocument();
  });
});
