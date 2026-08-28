'use client'

import { useEffect } from 'react'

// The user-detail dialog (and any other admin dropdown/popover) renders
// through a portal to document.body, outside this layout's own DOM
// subtree — a class on a wrapping div wouldn't reach it. Toggling the class
// on body instead means CSS inheritance covers portaled content too.
//
// className defaults to the full admin theme (font + the light-mode color
// tokens); Handlers passes 'font-scope' instead to opt into just the font
// swap without the color tokens, since its own markup still targets the
// old dark theme — see globals.css for both classes.
export default function AdminFontScope({ className }: { className?: string }) {
  const resolved = className ?? 'admin-scope'

  useEffect(() => {
    document.body.classList.add(resolved)
    return () => document.body.classList.remove(resolved)
  }, [resolved])

  return null
}
