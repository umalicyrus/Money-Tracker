type BrandLogoProps = {
  size?: number
  className?: string
}

export default function BrandLogo({ size = 34, className = '' }: BrandLogoProps) {
  return <img
    className={className}
    src="/app-icon-192.png"
    alt=""
    width={size}
    height={size}
    style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
  />
}
