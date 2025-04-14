import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImageCard from '../../app/components/ImageCard';

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
    src: '/uploads/test-image.jpg',
    alt: 'Test Image',
    width: 300,
    height: 200,
  };

  const mockOnSelect = jest.fn();
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the image with correct attributes', () => {
    render(
      <ImageCard
        image={mockImage}
        selected={false}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />
    );

    const imageElement = screen.getByAltText('Test Image');
    expect(imageElement).toBeInTheDocument();
    expect(imageElement).toHaveAttribute('src', '/uploads/test-image.jpg');
    expect(imageElement).toHaveAttribute('width', '300');
    expect(imageElement).toHaveAttribute('height', '200');
  });

  it('calls onSelect when clicked', () => {
    render(
      <ImageCard
        image={mockImage}
        selected={false}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />
    );

    const card = screen.getByRole('button');
    fireEvent.click(card);

    expect(mockOnSelect).toHaveBeenCalledTimes(1);
    expect(mockOnSelect).toHaveBeenCalledWith(mockImage);
  });

  it('shows selected state when selected prop is true', () => {
    render(
      <ImageCard
        image={mockImage}
        selected={true}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />
    );

    const card = screen.getByRole('button');
    expect(card).toHaveClass('selected');
  });

  it('calls onRemove when remove button is clicked', () => {
    render(
      <ImageCard
        image={mockImage}
        selected={false}
        onSelect={mockOnSelect}
        onRemove={mockOnRemove}
      />
    );

    const removeButton = screen.getByLabelText('Remove image');
    fireEvent.click(removeButton);

    expect(mockOnRemove).toHaveBeenCalledTimes(1);
    expect(mockOnRemove).toHaveBeenCalledWith(mockImage);
    // The event should not propagate to the card
    expect(mockOnSelect).not.toHaveBeenCalled();
  });
});
