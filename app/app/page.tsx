'use client'

import dynamic from 'next/dynamic'

const ChordViewerApp = dynamic(
  () => import('@/components/ChordViewerApp').then((mod) => ({ default: mod.ChordViewerApp })),
  { ssr: false }
)

export default function AppPage() {
  return <ChordViewerApp />
}
