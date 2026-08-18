import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuItemImage } from '../MenuItemImage';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img data-testid="next-image" {...props} alt={props.alt} />;
  },
}));

describe('MenuItemImage Component', () => {
  it('renders fallback icon when src is missing', () => {
    render(<MenuItemImage alt="Pizza" />);
    expect(screen.queryByTestId('next-image')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('menu-item-image-placeholder')).toHaveClass('absolute', 'inset-0');
  });

  it('renders next/image for production Firebase Storage URL', () => {
    const firebaseUrl = 'https://firebasestorage.googleapis.com/v0/b/app/o/item.webp';
    render(<MenuItemImage src={firebaseUrl} imageStoragePath="menu-images/rest1/item1/up1.webp" alt="Pizza" />);
    
    const img = screen.getByTestId('next-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', firebaseUrl);
  });

  it('renders native img for local emulator Firebase Storage URL', () => {
    const emulatorUrl = 'http://127.0.0.1:9199/v0/b/default-bucket/o/item.webp';
    render(<MenuItemImage src={emulatorUrl} alt="Pizza" />);

    const nativeImg = screen.getByAltText('Pizza');
    expect(nativeImg).toBeInTheDocument();
    expect(nativeImg.tagName.toLowerCase()).toBe('img');
    expect(screen.queryByTestId('next-image')).toBeNull();
  });

  it('renders native img for external URLs', () => {
    const externalUrl = 'https://images.unsplash.com/photo-123.jpg';
    render(<MenuItemImage src={externalUrl} alt="Burger" />);

    const nativeImg = screen.getByAltText('Burger');
    expect(nativeImg).toBeInTheDocument();
    expect(nativeImg.tagName.toLowerCase()).toBe('img');
    expect(nativeImg).toHaveAttribute('loading', 'lazy');
    expect(nativeImg).toHaveAttribute('decoding', 'async');
  });

  it('switches to fallback on image loading error without throwing React exception', () => {
    const badUrl = 'https://example.com/broken.jpg';
    render(<MenuItemImage src={badUrl} alt="Broken image" />);

    const nativeImg = screen.getByAltText('Broken image');
    fireEvent.error(nativeImg);

    expect(screen.getByTestId('menu-item-image-placeholder')).toBeInTheDocument();
  });
});
