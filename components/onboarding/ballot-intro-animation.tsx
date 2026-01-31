"use client"

import { useState, useRef } from "react"

interface BallotIntroAnimationProps {
  onComplete: () => void
}

export function BallotIntroAnimation({ onComplete }: BallotIntroAnimationProps) {
  const [videoEnded, setVideoEnded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleVideoEnd = () => {
    setVideoEnded(true)
    // Small delay to allow fade transition before completing
    setTimeout(() => {
      onComplete()
    }, 500)
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden z-50">
      {/* Video player */}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          videoEnded ? "opacity-0" : "opacity-100"
        }`}
        src="/Website_Loading_Animation.mp4"
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
      />
    </div>
  )
}
