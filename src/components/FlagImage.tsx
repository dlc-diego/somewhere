import type { Country } from '../lib/countries'

export default function FlagImage({
  country,
  alt = '',
  className = 'country-flag',
  onError,
}: {
  country: Country
  alt?: string
  className?: string
  onError?: () => void
}) {
  return (
    <img
      className={`flag-image ${className}`}
      src={`${import.meta.env.BASE_URL}flags/${country.id}.svg`}
      alt={alt}
      width={32}
      height={24}
      decoding="async"
      onError={onError}
    />
  )
}
