export function ImageCard({ image, onDelete }) {
  return (
    <div className="relative group">
      <Image 
        src={image.url} 
        alt={image.alt || "Processed image"} // Meaningful alt text
        width={300} 
        height={300}
        className="object-cover rounded-md"
        loading="lazy"
      />
      <button
        onClick={() => onDelete(image.id)}
        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={`Delete image ${image.alt || "processed image"}`} // Descriptive action
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  )
}