import type { AdPlacement } from './actions'

// `size` is the recommended media size for how each ad type is shown in game.
export const PLACEMENTS: { value: AdPlacement; label: string; short: string; hint: string; size: string }[] = [
  { value: 'rewarded', label: 'Rewarded', short: 'Rew', hint: 'Watch-to-claim (bonus truck drop)', size: '1280 × 720 (16:9)' },
  { value: 'interstitial', label: 'Interstitial', short: 'Int', hint: 'Full-screen, when a site is cleared', size: '1280 × 720 (16:9)' },
  { value: 'banner', label: 'Banner', short: 'Ban', hint: 'Strip at the bottom of the screen', size: '1200 × 175 (wide strip)' },
  { value: 'billboard', label: 'Billboard', short: 'Bill', hint: 'The 3D billboards behind the home lot', size: '1280 × 720 (16:9)' },
]

export function placementInfo(p: AdPlacement) {
  return PLACEMENTS.find((x) => x.value === p)!
}

export type Preview = { kind: 'image' | 'video'; url: string }
