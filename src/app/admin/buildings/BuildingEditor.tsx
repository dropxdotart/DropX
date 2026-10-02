'use client'

import { useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Eraser, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BRICK_COLORS, type BrickColor } from '@/lib/game/blueprints'
import { suggestPricing } from '@/lib/game/buildings'
import {
  bricksFromCells,
  cellIndex,
  COLOR_KEYS,
  decodeCells,
  DEFAULT_PARAMS,
  encodeCells,
  generateShape,
  SHAPE_LIMITS,
  type BuilderParams,
  type RoofStyle,
  type ShapeSize,
  type WindowStyle,
} from '@/lib/game/shapes'
import { SchedulePanel, StatusBadge } from '../ads/AdInsights'
import { deleteBuilding, saveBuilding, setBuildingActive, setBuildingSchedule, type CustomBuilding } from './actions'

// three.js needs the browser.
const BuildingPreview = dynamic(() => import('./BuildingPreview'), { ssr: false })

const PRESETS: { label: string; params: Partial<BuilderParams> }[] = [
  { label: 'Brick house', params: { width: 12, depth: 10, floors: 2, floorHeight: 5, roof: 'gable', windows: 'windows', wall: 'brick', wallAlt: 'brickDark', roofColor: 'roofRed', trim: 'trim', corners: true, door: true } },
  { label: 'Glass office', params: { width: 14, depth: 12, floors: 8, floorHeight: 5, roof: 'flat', windows: 'grid', wall: 'concrete', wallAlt: 'concrete', roofColor: 'roof', windowColor: 'glassDark', trim: 'white', corners: false, door: true } },
  { label: 'Warehouse', params: { width: 24, depth: 16, floors: 2, floorHeight: 6, roof: 'flat', windows: 'bands', wall: 'steel', wallAlt: 'steelDark', roofColor: 'roofDark', windowColor: 'glass', trim: 'yellow', corners: true, door: true } },
  { label: 'Domed hall', params: { width: 18, depth: 18, floors: 2, floorHeight: 5, roof: 'dome', windows: 'windows', wall: 'white', wallAlt: 'trim', roofColor: 'blue', windowColor: 'glass', trim: 'navy', corners: true, door: true } },
]

const fmt = (n: number) => Math.round(n).toLocaleString()

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs text-muted-foreground">
        {label} <span className="font-medium tabular-nums text-foreground">{value}</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#ff6b1a]" />
    </label>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-2 py-1 text-xs font-medium ${value === o.value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Swatches({ value, onChange, allowErase }: { value: BrickColor | null; onChange: (c: BrickColor | null) => void; allowErase?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {allowErase && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Eraser"
          className={`flex h-7 w-7 items-center justify-center rounded-md border-2 bg-card ${value === null ? 'border-[#2d7ff9]' : 'border-transparent'}`}
        >
          <Eraser className="h-4 w-4" />
        </button>
      )}
      {COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-md border-2 ${value === c ? 'border-[#2d7ff9]' : 'border-black/10'}`}
          style={{ background: BRICK_COLORS[c] }}
        />
      ))}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: BrickColor; onChange: (c: BrickColor) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-md bg-secondary px-2 py-1.5 text-xs">
        {label}
        <span className="h-4 w-8 rounded border border-black/10" style={{ background: BRICK_COLORS[value] }} />
      </button>
      {open && (
        <Swatches
          value={value}
          onChange={(c) => {
            if (c) onChange(c)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

// Create or edit an admin building: shape it with the slider builder and/or
// paint it brick by brick, set its name and numbers (auto-balanced unless
// overridden), then turn it on or schedule it.
export default function BuildingEditor({ initial }: { initial: CustomBuilding | null }) {
  const router = useRouter()
  const startShape = useMemo(() => {
    if (initial) return { size: initial.shape.size, cells: decodeCells(initial.shape.size, initial.shape.data) }
    return generateShape(DEFAULT_PARAMS)
  }, [initial])

  const [params, setParams] = useState<BuilderParams>(initial?.params ?? DEFAULT_PARAMS)
  const [size, setSize] = useState<ShapeSize>(startShape.size)
  const [cells, setCells] = useState<Uint8Array>(startShape.cells)
  const [edited, setEdited] = useState(!!initial && !initial.params)
  const [tab, setTab] = useState<'builder' | 'bricks' | 'settings'>('builder')
  const [layer, setLayer] = useState(0)
  const [paint, setPaint] = useState<BrickColor | null>('brick')
  const painting = useRef(false)

  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🏢')
  const [level, setLevel] = useState(initial?.required_level ?? 5)
  const [auto, setAuto] = useState(!initial)
  const [manual, setManual] = useState({
    contractCost: initial?.contract_cost ?? 0,
    brickValue: initial?.brick_value ?? 1,
    bonus: initial?.bonus ?? 0,
  })
  const [live, setLive] = useState({ active: initial?.active ?? false, starts_at: initial?.starts_at ?? null, ends_at: initial?.ends_at ?? null })
  const [saving, setSaving] = useState(false)

  const bricks = useMemo(() => bricksFromCells(size, cells).length, [size, cells])
  const pricing = auto ? suggestPricing(level, bricks) : manual
  const tooMany = bricks > SHAPE_LIMITS.maxBricks
  const [W, H, D] = size

  // Builder changes regenerate the shape (after confirming if bricks were
  // painted by hand).
  const updateParams = (next: Partial<BuilderParams>) => {
    if (edited && !confirm('Changing the builder replaces your brick edits. Continue?')) return
    const p = { ...params, ...next }
    setParams(p)
    const g = generateShape(p)
    setSize(g.size)
    setCells(g.cells)
    setEdited(false)
    setLayer((l) => Math.min(l, g.size[1] - 1))
  }

  const paintCell = (x: number, z: number) => {
    const i = cellIndex(size, x, layer, z)
    const v = paint ? COLOR_KEYS.indexOf(paint) + 1 : 0
    if (cells[i] === v) return
    const next = cells.slice()
    next[i] = v
    setCells(next)
    setEdited(true)
  }

  const copyLayerBelow = () => {
    if (layer === 0) return
    const next = cells.slice()
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) next[cellIndex(size, x, layer, z)] = cells[cellIndex(size, x, layer - 1, z)]
    setCells(next)
    setEdited(true)
  }

  const clearLayer = () => {
    const next = cells.slice()
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) next[cellIndex(size, x, layer, z)] = 0
    setCells(next)
    setEdited(true)
  }

  // A new empty layer on top (cells are stored y-major, so it just grows).
  const addLayer = () => {
    if (H >= SHAPE_LIMITS.maxH) return
    const nextSize: ShapeSize = [W, H + 1, D]
    const next = new Uint8Array(W * (H + 1) * D)
    next.set(cells)
    setSize(nextSize)
    setCells(next)
    setLayer(H)
    setEdited(true)
  }

  // Drag-painting that works with touch: find the cell under the finger.
  const onGridPointer = (e: React.PointerEvent) => {
    if (e.type === 'pointerdown') painting.current = true
    if (!painting.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const cell = el?.dataset.cell
    if (!cell) return
    const [x, z] = cell.split(',').map(Number)
    paintCell(x, z)
  }

  const cellPx = Math.max(9, Math.min(22, Math.floor(340 / W)))

  const save = async () => {
    setSaving(true)
    try {
      const result = await saveBuilding(initial?.id ?? null, {
        name,
        emoji,
        shape: { size, data: encodeCells(cells) },
        params: edited ? null : params,
        requiredLevel: Math.round(level),
        contractCost: pricing.contractCost,
        brickValue: pricing.brickValue,
        bonus: pricing.bonus,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Saved')
      if (!initial) router.replace(`/admin/buildings/${result.id}`)
      else router.refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {emoji} {name || (initial ? 'Building' : 'New building')}
        </h1>
        {initial && <StatusBadge ad={live} />}
      </div>

      <BuildingPreview size={size} cells={cells} layer={tab === 'bricks' ? layer : null} />
      <p className={`text-xs tabular-nums ${tooMany ? 'font-bold text-red-600' : 'text-muted-foreground'}`}>
        {W} × {D} footprint · {H} tall · {fmt(bricks)} / {fmt(SHAPE_LIMITS.maxBricks)} visible bricks
        {tooMany ? ' — too many, make it smaller' : ''}
      </p>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'builder', label: 'Builder' },
          { value: 'bricks', label: 'Bricks' },
          { value: 'settings', label: 'Settings' },
        ]}
      />

      {tab === 'builder' && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {edited && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">You&apos;ve painted bricks by hand. Changing the builder will replace those edits.</p>}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((pr) => (
              <button key={pr.label} type="button" onClick={() => updateParams(pr.params)} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                {pr.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Width" value={params.width} min={5} max={SHAPE_LIMITS.maxW} onChange={(v) => updateParams({ width: v })} />
            <Slider label="Depth" value={params.depth} min={5} max={SHAPE_LIMITS.maxD} onChange={(v) => updateParams({ depth: v })} />
            <Slider label="Floors" value={params.floors} min={1} max={24} onChange={(v) => updateParams({ floors: v })} />
            <Slider label="Floor height" value={params.floorHeight} min={3} max={7} onChange={(v) => updateParams({ floorHeight: v })} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Roof</p>
            <Segmented<RoofStyle>
              value={params.roof}
              onChange={(roof) => updateParams({ roof })}
              options={[
                { value: 'flat', label: 'Flat' },
                { value: 'gable', label: 'Peaked' },
                { value: 'dome', label: 'Dome' },
                { value: 'none', label: 'None' },
              ]}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Windows</p>
            <Segmented<WindowStyle>
              value={params.windows}
              onChange={(windows) => updateParams({ windows })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'windows', label: 'Windows' },
                { value: 'bands', label: 'Bands' },
                { value: 'grid', label: 'Glass grid' },
              ]}
            />
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={params.door} onChange={(e) => updateParams({ door: e.target.checked })} /> Front door
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={params.corners} onChange={(e) => updateParams({ corners: e.target.checked })} /> Corner trim
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Walls" value={params.wall} onChange={(wall) => updateParams({ wall })} />
            <ColorField label="Wall stripes" value={params.wallAlt} onChange={(wallAlt) => updateParams({ wallAlt })} />
            <ColorField label="Roof" value={params.roofColor} onChange={(roofColor) => updateParams({ roofColor })} />
            <ColorField label="Windows" value={params.windowColor} onChange={(windowColor) => updateParams({ windowColor })} />
            <ColorField label="Trim" value={params.trim} onChange={(trim) => updateParams({ trim })} />
          </div>
        </div>
      )}

      {tab === 'bricks' && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <Slider label="Layer (0 = ground)" value={layer} min={0} max={H - 1} onChange={setLayer} />
          <Swatches value={paint} onChange={setPaint} allowErase />
          <div className="overflow-x-auto">
            <p className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">Back</p>
            <div
              className="mx-auto grid w-max select-none"
              style={{ gridTemplateColumns: `repeat(${W}, ${cellPx}px)`, touchAction: 'none' }}
              onPointerDown={onGridPointer}
              onPointerMove={onGridPointer}
              onPointerUp={() => (painting.current = false)}
              onPointerLeave={() => (painting.current = false)}
            >
              {Array.from({ length: D }, (_, r) => D - 1 - r).flatMap((z) =>
                Array.from({ length: W }, (_, x) => {
                  const v = cells[cellIndex(size, x, layer, z)]
                  const below = layer > 0 ? cells[cellIndex(size, x, layer - 1, z)] : 0
                  return (
                    <div
                      key={`${x},${z}`}
                      data-cell={`${x},${z}`}
                      className="border border-black/5"
                      style={{
                        width: cellPx,
                        height: cellPx,
                        background: v ? BRICK_COLORS[COLOR_KEYS[v - 1]] : below ? 'rgba(0,0,0,0.06)' : 'transparent',
                      }}
                    />
                  )
                })
              )}
            </div>
            <p className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">Front (faces the camera) · right side →</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyLayerBelow} disabled={layer === 0}>
              Copy layer below
            </Button>
            <Button variant="secondary" onClick={clearLayer}>
              Clear layer
            </Button>
            <Button variant="secondary" onClick={addLayer} disabled={H >= SHAPE_LIMITS.maxH}>
              Add layer on top
            </Button>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              Name
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Old Lighthouse" maxLength={40} />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Emoji
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center text-lg" maxLength={8} />
            </label>
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground">
            Unlock level
            <Input type="number" min={1} max={200} value={level} onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                if (!e.target.checked) setManual(suggestPricing(level, bricks))
                setAuto(e.target.checked)
              }}
            />
            Balance prices automatically
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['contractCost', 'Price to start'],
                ['brickValue', 'Pay per brick'],
                ['bonus', 'Finish bonus'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-muted-foreground">
                {label}
                <Input
                  type="number"
                  min={0}
                  disabled={auto}
                  value={pricing[key]}
                  onChange={(e) => setManual((m) => ({ ...m, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Pays about <span className="font-medium text-foreground">🧱 {fmt(bricks * pricing.brickValue + pricing.bonus)}</span> in total for{' '}
            {fmt(bricks)} bricks{auto ? ', balanced against the built-in buildings at this level' : ''}.
          </p>

          {initial ? (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">In the game</p>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await setBuildingActive(initial.id, !live.active).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
                    if (r.ok) setLive((l) => ({ ...l, active: !l.active }))
                    else toast.error(r.message)
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${live.active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground'}`}
                >
                  {live.active ? 'On' : 'Off'}
                </button>
              </div>
              <SchedulePanel ad={live} onSave={(s, e) => setBuildingSchedule(initial.id, s, e)} onChange={(next) => setLive((l) => ({ ...l, ...next }))} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Save it first, then you can switch it on or schedule it.</p>
          )}
        </div>
      )}

      <Button className="w-full" onClick={save} disabled={saving || tooMany || !name.trim()}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {initial ? 'Save changes' : 'Create building'}
      </Button>
      {!name.trim() && <p className="-mt-2 text-center text-xs text-muted-foreground">Give it a name in Settings to save.</p>}

      {initial && (
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`Delete ${initial.name}? Players already demolishing it can still finish.`)) return
            const r = await deleteBuilding(initial.id).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
            if (r.ok) router.push('/admin/buildings')
            else toast.error(r.message)
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete building
        </button>
      )}
    </div>
  )
}
