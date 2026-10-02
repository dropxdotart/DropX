import Navbar from '@/components/layout/Navbar'
import AdminBack from './AdminBack'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <AdminBack />
      {children}
    </>
  )
}
