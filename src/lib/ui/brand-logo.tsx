import Image from 'next/image'

export function BrandLogo({
  className = '',
  priority = false,
  compact = false,
  size = 'responsive',
  alt = 'Cert-Ed Academia',
}: {
  className?: string
  priority?: boolean
  compact?: boolean
  size?: 'compact' | 'md' | 'responsive'
  alt?: string
}) {
  const isCompact = compact || size === 'compact'
  if (isCompact) {
    return (
      <Image
        src="/cert-ed-academia-online-tuition-logo.webp"
        alt={alt}
        width={160}
        height={40}
        className={`h-8 w-auto object-contain ${className}`}
        priority={priority}
      />
    )
  }
  if (size === 'md') {
    return (
      <Image
        src="/cert-ed-academia-online-tuition-logo.webp"
        alt={alt}
        width={260}
        height={64}
        className={`h-12 w-auto object-contain ${className}`}
        priority={priority}
      />
    )
  }
  return (
    <Image
      src="/cert-ed-academia-online-tuition-logo.webp"
      alt={alt}
      width={320}
      height={80}
      className={`w-auto max-w-full object-contain ${className}`}
      style={{ height: 'clamp(2.25rem, 4.5vw, 3.75rem)' }}
      priority={priority}
    />
  )
}
