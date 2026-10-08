import { notFound } from 'next/navigation'
import DesignPreview from './DesignPreview'

// Dev-only: look at every building design, with a cutaway to see inside.
export default function DevBuildingsPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <DesignPreview />
}
