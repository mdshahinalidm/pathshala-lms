'use client'

/**
 * NotFoundView — 404 page with home button.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUI } from '@/store/ui-store'

export default function NotFoundView() {
  const { tx } = useUI()

  return (
    <div className="hero-dots flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gradient-to-b from-primary/5 to-transparent px-4 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-4"
      >
        <p className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent sm:text-8xl">
          404
        </p>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-bold sm:text-2xl">
          {tx('পাতাটি খুঁজে পাওয়া যায়নি', 'Page not found')}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {tx(
            'আপনি যে পাতাটি খুঁজছেন সেটি সরানো হয়েছে বা কখনোই ছিল না। চিন্তা নেই — শেখা চালিয়ে যান!',
            'The page you are looking for has been moved or never existed. No worries — keep learning!'
          )}
        </p>
        <Button size="lg" asChild className="mt-2">
          <Link href="/">{tx('হোমে ফিরে যান', 'Back to home')}</Link>
        </Button>
      </motion.div>
    </div>
  )
}
