import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageCard } from '../../components/image-card';

// Mock the next/image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe('ImageCard Component', () => {
  const mockImage = {
    id: 'test-id',
    url: '/uploads/test-image.jpg',
    alt: 'Test Image',
  };

  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the image with correct attributes', () => {
    render(
      <ImageCard
        image={mockImage}
        onDelete={mockOnRemove}
      />
    );

    const imageElement = screen.getByAltText('Test Image');
    expect(imageElement).toBeInTheDocument();
    expect(imageElement).toHaveAttribute('src', '/uploads/test-image.jpg');
  });

  it('calls onRemove when remove button is clicked', () => {
    render(
      <ImageCard
        image={mockImage}
        onDelete={mockOnRemove}
      />
    );

    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);

    expect(mockOnRemove).toHaveBeenCalledTimes(1);
    expect(mockOnRemove).toHaveBeenCalledWith(mockImage.id);
  });
});
