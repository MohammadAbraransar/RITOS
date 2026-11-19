import { useState } from 'react'
import { Apple, Backpack, Droplets, Laptop, Package, Shirt, Zap, type LucideIcon } from 'lucide-react'

const CATEGORY_ICON: Record<string, LucideIcon> = {
  ELECTRONICS: Laptop, APPAREL: Shirt, HYGIENE: Droplets, ACCESSORIES: Backpack, PERISHABLES: Apple, DIGITAL: Zap,
}

/** Product image when the catalog has one; otherwise a neutral category icon. */
export function ProductThumb({ category, imageUrl, size = 48 }: { category?: string | null; imageUrl?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  const Icon = CATEGORY_ICON[(category || '').toUpperCase()] || Package
  return (
    <span className="product-thumb" style={{ width: size, height: size }} aria-hidden="true">
      {imageUrl && !broken
        ? <img src={imageUrl} alt="" onError={() => setBroken(true)} />
        : <Icon size={Math.round(size * 0.46)} />}
    </span>
  )
}
