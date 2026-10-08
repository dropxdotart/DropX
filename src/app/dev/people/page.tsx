import { notFound } from 'next/navigation'
import PeoplePreview from './PeoplePreview'

// Dev-only: the Boss in each outfit and every manager.
export default function DevPeoplePage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <PeoplePreview />
}
