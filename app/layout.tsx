import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ChordViewer',
  description: 'Real-time MIDI chord identification and lead sheet transcription',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
