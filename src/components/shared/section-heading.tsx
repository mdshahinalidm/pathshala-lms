'use client'

import { motion } from 'framer-motion'

export function SectionHeading({
  title,
  subtitle,
  align = 'center',
}: {
  title: string
  subtitle?: string
  align?: 'center' | 'left'
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45 }}
      className={align === 'center' ? 'text-center' : 'text-left'}
    >
      {/* Rainbow accent bar */}
      <span
        aria-hidden
        className={`rainbow-bar mb-3 block h-1.5 w-16 rounded-full ${align === 'center' ? 'mx-auto' : ''}`}
      />
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
      )}
    </motion.div>
  )
}
