import Image from "next/image"
import { Trash2 as TrashIcon } from "lucide-react"

/**
 * Props for the ImageCard component
 * @interface ImageCardProps
 */
interface ImageCardProps {
  /**
   * Image object containing id, url, and optional alt text
   */
  image: {
    /** Unique identifier for the image */
    id: string;
    /** URL of the image */
    url: string;
    /** Alternative text for the image for accessibility */
    alt?: string;
  };
  /**
   * Callback function to handle image deletion
   * @param id - The id of the image to delete
   */
  onDelete: (id: string) => void;
}

/**
 * ImageCard component displays an image with accessibility features and a delete button
 *
 * @param {ImageCardProps} props - The component props
 * @param {Object} props.image - The image object with id, url, and optional alt text
 * @param {Function} props.onDelete - Callback function when delete button is clicked
 * @returns {JSX.Element} The rendered ImageCard component
 */
export function ImageCard({ image, onDelete }: ImageCardProps) {
  return (
    <div className="relative group" role="figure" aria-labelledby={`img-${image.id}`}>
      <Image
        src={image.url}
        alt={image.alt || "Processed image"}
        width={300}
        height={300}
        className="object-cover rounded-md"
        loading="lazy"
      />
      {image.alt && (
        <div id={`img-${image.id}`} className="sr-only">
          {image.alt}
        </div>
      )}
      <button
        onClick={() => onDelete(image.id)}
        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        aria-label={`Delete image ${image.alt || "processed image"}`}
      >
        <TrashIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}