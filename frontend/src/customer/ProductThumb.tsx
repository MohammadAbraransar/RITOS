import { useState } from 'react'
import { Apple, Backpack, BatteryCharging, Cloud, Droplets, Footprints, Headphones, House, Keyboard, Laptop, Lightbulb,
         Monitor, Package, Shirt, Smartphone, Tablet, Watch, type LucideIcon } from 'lucide-react'

// Keys are product categories as stored (store categories are upper-cased, so "Smart Home" is "SMART HOME")
const CATEGORY_ICON: Record<string, LucideIcon> = {
  ELECTRONICS: Laptop, APPAREL: Shirt, HYGIENE: Droplets, PERISHABLES: Apple, GENERAL: Package,
  // ShopFlow catalog categories
  AUDIO: Headphones, MOBILE: Smartphone, COMPUTERS: Laptop, FOOTWEAR: Footprints, HOME: House, 'SMART HOME': Lightbulb,
  ACCESSORIES: BatteryCharging, BAGS: Backpack, DIGITAL: Cloud, WEARABLES: Watch, PERIPHERALS: Keyboard,
  DISPLAYS: Monitor, TABLETS: Tablet,
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
