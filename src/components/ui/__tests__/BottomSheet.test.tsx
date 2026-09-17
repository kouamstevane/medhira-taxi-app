import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { BottomSheet } from '../BottomSheet';

function renderSheet(
  props: Partial<ComponentProps<typeof BottomSheet>> = {},
) {
  const onOpenChange = jest.fn();

  const renderResult = render(
    <BottomSheet
      open
      onOpenChange={onOpenChange}
      title="Options de livraison"
      {...props}
    >
      <p>Contenu de la feuille</p>
    </BottomSheet>,
  );

  return { onOpenChange, ...renderResult };
}

function firePointer(
  type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
  element: HTMLElement,
  clientY: number,
) {
  const event = createEvent[type](element);
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(element, event);
}

describe('BottomSheet', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders an accessible dialog with its title and content when open', () => {
    renderSheet();

    const dialog = screen.getByRole('dialog', { name: 'Options de livraison' });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Contenu de la feuille')).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  it('renders nothing while closed', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('locks body scrolling while open and restores the previous overflow on close', () => {
    document.body.style.overflow = 'scroll';
    const { onOpenChange } = renderSheet();

    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('restores the previous overflow value when unmounted while open', () => {
    document.body.style.overflow = 'clip';
    const onOpenChange = jest.fn();
    const { unmount } = render(
      <BottomSheet open onOpenChange={onOpenChange} title="Titre">
        <span>Contenu</span>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('clip');
  });

  it('restores the previous overflow value when closed', () => {
    document.body.style.overflow = 'auto';
    const onOpenChange = jest.fn();
    const { rerender } = render(
      <BottomSheet open onOpenChange={onOpenChange} title="Titre">
        <span>Contenu</span>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <BottomSheet open={false} onOpenChange={onOpenChange} title="Titre">
        <span>Contenu</span>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('auto');
  });

  it.each([
    ['the backdrop', () => screen.getByTestId('bottom-sheet-backdrop')],
    ['the close button', () => screen.getByRole('button', { name: 'Fermer' })],
  ])('closes from %s when dismissible', (_source, getTarget) => {
    const { onOpenChange } = renderSheet();

    fireEvent.click(getTarget());

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape when dismissible', () => {
    const { onOpenChange } = renderSheet();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss from backdrop, close button, or Escape when canDismiss is false', () => {
    const { onOpenChange } = renderSheet({ canDismiss: false });

    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('routes the explicit close button to onCloseRequest when dismissal is blocked', () => {
    const onCloseRequest = jest.fn();
    const { onOpenChange } = renderSheet({ canDismiss: false, onCloseRequest });

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('dismisses after a downward handle drag of at least 120 pixels', () => {
    const { onOpenChange } = renderSheet();
    const handle = screen.getByTestId('bottom-sheet-handle');

    firePointer('pointerDown', handle, 100);
    firePointer('pointerMove', handle, 220);
    firePointer('pointerUp', handle, 220);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss when canDismiss becomes false during a drag', () => {
    const { onOpenChange, rerender } = renderSheet();
    const handle = screen.getByTestId('bottom-sheet-handle');

    firePointer('pointerDown', handle, 100);
    rerender(
      <BottomSheet
        open
        onOpenChange={onOpenChange}
        title="Options de livraison"
        canDismiss={false}
      >
        <p>Contenu de la feuille</p>
      </BottomSheet>,
    );
    firePointer('pointerUp', handle, 220);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('resets a canceled downward handle drag without dismissing', () => {
    const { onOpenChange } = renderSheet();
    const handle = screen.getByTestId('bottom-sheet-handle');

    firePointer('pointerDown', handle, 100);
    firePointer('pointerMove', handle, 220);
    firePointer('pointerCancel', handle, 220);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps the dialog open after a short downward handle drag', () => {
    const { onOpenChange } = renderSheet();
    const handle = screen.getByTestId('bottom-sheet-handle');

    firePointer('pointerDown', handle, 100);
    firePointer('pointerMove', handle, 180);
    firePointer('pointerUp', handle, 180);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('only begins dragging from the handle or header', () => {
    const { onOpenChange } = renderSheet();
    const content = screen.getByText('Contenu de la feuille');

    firePointer('pointerDown', content, 100);
    firePointer('pointerMove', content, 240);
    firePointer('pointerUp', content, 240);

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
