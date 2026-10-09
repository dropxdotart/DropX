import { notFound } from 'next/navigation'
import TrucksPreview from './TrucksPreview'

// Dev-only: every truck up close.
export default function DevTrucksPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <TrucksPreview />
}
