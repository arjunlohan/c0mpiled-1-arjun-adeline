"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TopicCardProps {
  icon: React.ReactNode
  label: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
}

export function TopicCard({ icon, label, selected, disabled, onClick }: TopicCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border transition-all duration-150",
        selected
          ? "border-white bg-white text-zinc-900"
          : "border-white/20 bg-white/10 text-white hover:border-white/40",
        disabled && "opacity-30 cursor-not-allowed hover:border-white/20"
      )}
    >
      <div className="w-5 h-5">
        {icon}
      </div>
      <span className="text-xs font-medium text-center">{label}</span>
    </button>
  )
}
