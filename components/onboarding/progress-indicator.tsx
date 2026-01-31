import { cn } from "@/lib/utils"

interface ProgressIndicatorProps {
  currentStep: number
  totalSteps: number
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            index === currentStep
              ? "w-8 bg-primary"
              : index < currentStep
                ? "w-2 bg-primary"
                : "w-2 bg-white/30"
          )}
        />
      ))}
    </div>
  )
}
