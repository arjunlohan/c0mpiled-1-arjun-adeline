"use client"

import { useState } from "react"
import { OnboardingFlow, OnboardingResult } from "@/components/onboarding/onboarding-flow"
import QuizGame from "@/components/quiz-game/quiz-game"

export default function Page() {
  const [onboardingData, setOnboardingData] = useState<OnboardingResult | null>(null)

  const handleOnboardingComplete = (data: OnboardingResult) => {
    setOnboardingData(data)
  }

  if (!onboardingData) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />
  }

  return (
    <QuizGame 
      topics={onboardingData.topics} 
      location={onboardingData.location}
      knowledgeLevel={onboardingData.knowledgeLevel}
      userType={onboardingData.userType}
      chapters={onboardingData.chapters}
    />
  )
}
