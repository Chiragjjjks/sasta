import { Geolocation } from '@capacitor/geolocation'
import { Crosshair, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Location } from '@/lib/types'
import { Sheet } from './Sheet'

export function LocationSheet({ open, value, onClose, onSave }: { open: boolean; value: Location; onClose: () => void; onSave: (l: Location) => void }) {
  const [label, setLabel] = useState(value.label)
  const [pincode, setPincode] = useState(value.pincode)
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({ lat: value.lat, lng: value.lng })
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setLabel(value.label); setPincode(value.pincode); setCoords({ lat: value.lat, lng: value.lng }); setError('') }
  }, [open, value])

  async function locate() {
    setLocating(true); setError('')
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
      setCoords({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) })
      if (!label || label === value.label) setLabel('Current location')
    } catch {
      setError('Could not get your location. Check that location permission is on.')
    } finally {
      setLocating(false)
    }
  }

  const valid = /^\d{6}$/.test(pincode) && label.trim().length > 0
  const field = 'w-full rounded-xl bg-surface px-4 py-3 text-[15px] font-medium outline-none ring-ink/10 focus:ring-2'

  return (
    <Sheet open={open} onClose={onClose} title="Delivery location">
      <h3 className="font-display text-[18px] font-bold">Delivery location</h3>
      <p className="mt-1 text-[13px] text-muted">Every app prices and stocks per dark store, so results depend on this.</p>
      <button onClick={locate} disabled={locating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3 text-[14px] font-semibold active:scale-[.99]">
        {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
        Use my current location
      </button>
      {coords.lat !== undefined && (
        <p className="mt-2 text-center text-[12px] text-muted tabular">Pinned at {coords.lat}, {coords.lng}</p>
      )}
      {error && <p className="mt-2 text-center text-[12px] text-accent">{error}</p>}
      <div className="mt-4 space-y-2.5">
        <input className={field} placeholder="Area, e.g. Rajajinagar" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className={field} placeholder="Pincode" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} />
      </div>
      <button
        disabled={!valid}
        onClick={() => { onSave({ label: label.trim(), pincode, ...coords }); onClose() }}
        className="mt-4 w-full rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-bg disabled:opacity-40"
      >
        Save location
      </button>
    </Sheet>
  )
}
