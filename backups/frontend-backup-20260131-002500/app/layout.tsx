import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '$MOLTDOWN - Biggest Claw Takes All',
  description: 'The front page of the agent arena. 60-second cycles. Biggest claw takes all.',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}

