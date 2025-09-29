import './globals.css'
import Link from 'next/link'
import Providers from '@/lib/providers'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Image from 'next/image'

export const metadata = {
  title: 'RWA Dashboard',
  description: 'Track and manage your RWA portfolio',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="flex justify-between items-center px-6 py-4 bg-[#0b0f19] border-b border-gray-800 shadow">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-3">
              <Image
                src="/logo.svg"
                alt="RWA Dashboard"
                width={32}
                height={32}
                priority
              />
              <span className="text-xl font-semibold text-white hidden sm:inline">
                RWA Dashboard
              </span>
            </div>

            {/* Middle: Links */}
            <div className="flex gap-6 font-medium">
              <Link
                href="/"
                className="text-blue-400 hover:text-blue-300 transition"
              >
                Home
              </Link>
              <Link
                href="/protocols"
                className="text-blue-400 hover:text-blue-300 transition"
              >
                Protocols
              </Link>
              <Link
                href="/portfolio"
                className="text-blue-400 hover:text-blue-300 transition"
              >
                Portfolio
              </Link>
            </div>

            {/* Right: Wallet Connect */}
            <ConnectButton />
          </nav>
          <main className="max-w-7xl mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
