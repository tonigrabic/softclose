'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  percent: number
}

export function ProgressBar({ percent }: ProgressBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-border/80"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Form progress"
    >
      <motion.div
        className="h-full rounded-r-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}
