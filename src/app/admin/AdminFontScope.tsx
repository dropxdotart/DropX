'use client'

import { useEffect } from 'react'

// The user-detail dialog (and any other admin dropdown/popover) renders
// through a portal to document.body, outside this layout's own DOM
// subtree — a class on a wrapping div wouldn't reach it. Toggling the class
// on body instead means CSS inheritance covers portaled content too.
export default function AdminFontScope() {
  useEffect(() => {
    document.body.classList.add('admin-scope')
    return () => document.body.classList.remove('admin-scope')
  }, [])

  return null
}
