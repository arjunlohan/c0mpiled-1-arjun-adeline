"use client"

import { cn } from "@/lib/utils"
import { Check, ChevronDown } from "lucide-react"
import { useState, useRef, useEffect } from "react"

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming"
]

interface StateSelectorProps {
  value: string | null
  onChange: (state: string) => void
}

export function StateSelector({ value, onChange }: StateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredStates = US_STATES.filter((state) =>
    state.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-all duration-150",
          isOpen 
            ? "border-white bg-white/10" 
            : "border-white/20 bg-white/10 hover:border-white/40",
          value ? "text-white" : "text-white/60"
        )}
      >
        <span className="text-sm">{value || "Select your state"}</span>
        <ChevronDown className={cn(
          "w-4 h-4 transition-transform text-white/60",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search states..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white/10 text-white placeholder:text-white/40 rounded-md outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredStates.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => {
                  onChange(state)
                  setIsOpen(false)
                  setSearch("")
                }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
                  "hover:bg-white/10",
                  value === state 
                    ? "bg-white text-zinc-900" 
                    : "text-white"
                )}
              >
                <span>{state}</span>
                {value === state && <Check className="w-4 h-4" />}
              </button>
            ))}
            {filteredStates.length === 0 && (
              <div className="px-4 py-6 text-center text-white/40 text-sm">
                No states found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
