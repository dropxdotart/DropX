import Link from 'next/link'
import Image from 'next/image'

export default function Navbar() {
  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-14">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/rubble-icon-192.png" alt="" width={26} height={26} priority />
            <span className="font-heading text-base font-bold tracking-tight text-foreground">Rubble</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
