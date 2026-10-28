import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from '../src/components/Drawer';
import { Button } from '../src/components/Button';
import { TextField } from '../src/components/Field';

/** A drawer with a form whose submit always fails validation. */
function DrawerHarness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open drawer
      </button>
      <Drawer
        open={open}
        title="Edit merchant"
        description="Fixed phone number"
        busy={busy}
        onClose={() => setOpen(false)}
        footer={
          <Button
            variant="primary"
            onClick={() => setError('Last name is required.')}
          >
            Save changes
          </Button>
        }
      >
        <TextField
          label="First name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...(error ? { error } : {})}
        />
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  it('renders as a modal dialog with its title and description', () => {
    render(<DrawerHarness />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Edit merchant' })).toBeInTheDocument();
    expect(screen.getByText('Fixed phone number')).toBeInTheDocument();
  });

  it('moves focus into the panel when it opens', () => {
    render(<DrawerHarness />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape, on the close button and on a backdrop click', async () => {
    const user = userEvent.setup();

    const { unmount } = render(<DrawerHarness />);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<DrawerHarness />);
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cannot be dismissed while a submit is in flight', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness busy />);

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Close panel' })).toBeDisabled();
  });

  it('keeps entered values when validation fails', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const input = screen.getByLabelText('First name');
    await user.type(input, 'Anita');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // The panel stays open, the typed value survives, and the error is announced.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Anita');
    expect(screen.getByRole('alert')).toHaveTextContent('Last name is required.');
    expect(screen.getByLabelText('First name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('traps Tab inside the panel', () => {
    render(<DrawerHarness />);

    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input'));
    const last = focusable[focusable.length - 1] as HTMLElement;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    // Focus wrapped back into the panel rather than escaping to the page behind it.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('restores body scrolling after it closes', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
