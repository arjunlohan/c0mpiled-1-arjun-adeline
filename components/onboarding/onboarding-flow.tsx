"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { TopicCard } from "./topic-card"
import { BallotIntroAnimation } from "./ballot-intro-animation"
import { Chapter, generateQuizWithLLM, SAMPLE_GAME_DATA } from "@/lib/game-data"
import { cn } from "@/lib/utils"
import {
  DollarSign,
  Users,
  Heart,
  GraduationCap,
  Leaf,
  Shield,
  Home,
  Globe,
  MapPin,
  ArrowLeft,
  Sparkles,
  Sprout,
  Newspaper,
  Vote,
  UserCheck,
  Eye,
  Check,
} from "lucide-react"

const TOPICS = [
  { id: "housing", label: "Housing & Rent", icon: Home },
  { id: "taxes", label: "Taxes & Economy", icon: DollarSign },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "immigration", label: "Immigration", icon: Globe },
  { id: "climate", label: "Climate", icon: Leaf },
  { id: "healthcare", label: "Healthcare", icon: Heart },
]

const KNOWLEDGE_LEVELS = [
  { id: "beginner", label: "I'm new to this", icon: Sprout },
  { id: "intermediate", label: "I follow the headlines", icon: Newspaper },
  { id: "expert", label: "I'm pretty informed", icon: GraduationCap },
]

const USER_TYPES = [
  { id: "first-time", label: "First-time voter", icon: Vote },
  { id: "regular", label: "Regular voter", icon: UserCheck },
  { id: "curious", label: "Just curious", icon: Eye },
]

const LOADING_STEPS = [
  "Finding your local ballot",
  "Matching your priorities",
  "Calibrating difficulty",
  "Personalizing experience",
]

interface OnboardingData {
  location: string
  topics: string[]
  knowledgeLevel: string
  userType: string
}

export interface OnboardingResult {
  topics: string[]
  location: string
  knowledgeLevel: string
  userType: string
  chapters: Chapter[]
  isGenerated: boolean
}

interface OnboardingFlowProps {
  onComplete?: (data: OnboardingResult) => void
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [showVideo, setShowVideo] = useState(true)
  const [step, setStep] = useState(0) // 0 = intro, 1-4 = steps, 5 = loading
  const [data, setData] = useState<OnboardingData>({
    location: "",
    topics: [],
    knowledgeLevel: "",
    userType: "",
  })
  const [locationInput, setLocationInput] = useState("")
  const [loadingStep, setLoadingStep] = useState(0)
  const [completedLoadingSteps, setCompletedLoadingSteps] = useState<number[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedChapters, setGeneratedChapters] = useState<Chapter[]>([])
  const [isGenerated, setIsGenerated] = useState(false)

  // Loading step animation - 19 seconds total for 4 steps (~4.75s per step)
  useEffect(() => {
    if (step !== 5) return

    const STEP_DURATION = 4750 // 19 seconds / 4 steps
    let stepIndex = 0

    const interval = setInterval(() => {
      if (stepIndex < LOADING_STEPS.length) {
        setCompletedLoadingSteps((c) => [...c, stepIndex])
        stepIndex++
        if (stepIndex < LOADING_STEPS.length) {
          setLoadingStep(stepIndex)
        }
      }
      if (stepIndex >= LOADING_STEPS.length) {
        clearInterval(interval)
      }
    }, STEP_DURATION)

    return () => clearInterval(interval)
  }, [step])

  // Auto-start game when both animation is complete AND AI has responded
  const allStepsComplete = completedLoadingSteps.length === LOADING_STEPS.length
  const aiReady = !isGenerating && generatedChapters.length > 0
  const canStartGame = allStepsComplete && aiReady && data.location && generatedChapters.length > 0

  useEffect(() => {
    if (canStartGame && onComplete) {
      // Small delay for smooth transition
      const timer = setTimeout(() => {
        onComplete({
          topics: data.topics,
          location: data.location,
          knowledgeLevel: data.knowledgeLevel,
          userType: data.userType,
          chapters: generatedChapters,
          isGenerated: isGenerated,
        })
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [canStartGame, onComplete, data, generatedChapters, isGenerated])

  if (showVideo) {
    return <BallotIntroAnimation onComplete={() => setShowVideo(false)} />
  }

  const toggleTopic = (topicId: string) => {
    setData((prev) => {
      if (prev.topics.includes(topicId)) {
        return { ...prev, topics: prev.topics.filter((t) => t !== topicId) }
      } else if (prev.topics.length < 3) {
        return { ...prev, topics: [...prev.topics, topicId] }
      }
      return prev
    })
  }

  const handleNext = async () => {
    if (step === 4) {
      // Move to loading step and start generating quiz
      setStep(5)
      setIsGenerating(true)

      try {
        const topicLabels = data.topics
          .map((t) => TOPICS.find((topic) => topic.id === t)?.label)
          .filter((label): label is string => label !== undefined)

        // Pass all onboarding data to the quiz generator
        const response = await generateQuizWithLLM(
          topicLabels,
          data.location,
          data.knowledgeLevel,
          data.userType,
          4
        )

        if (response.success && response.chapters) {
          setGeneratedChapters(response.chapters)
          setIsGenerated(true)
        } else {
          console.warn("Quiz generation failed, using sample data:", response.error)
          setGeneratedChapters(SAMPLE_GAME_DATA)
          setIsGenerated(false)
        }
      } catch (error) {
        console.error("Error generating quiz:", error)
        setGeneratedChapters(SAMPLE_GAME_DATA)
        setIsGenerated(false)
      } finally {
        setIsGenerating(false)
      }
    } else {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleLocationSubmit = () => {
    if (locationInput.trim()) {
      setData((prev) => ({ ...prev, location: locationInput.trim() }))
      handleNext()
    }
  }
  // asdasd

  const handleStartGame = () => {
    if (onComplete && data.location && generatedChapters.length > 0) {
      onComplete({
        topics: data.topics,
        location: data.location,
        knowledgeLevel: data.knowledgeLevel,
        userType: data.userType,
        chapters: generatedChapters,
        isGenerated: isGenerated,
      })
    }
  }


  return (
    <div className="min-h-screen relative">
      {/* Static background image */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/Website_Post_Loading_Static_Background.png')" }}
      />
      {/* Dark scrim */}
      <div className="fixed inset-0 bg-black/70" />

      {/* Content overlay */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Intro step - no card background */}
          {step === 0 && (
            <div className="text-center py-8">
              <h1 className="text-7xl md:text-7xl font-heading text-white mb-6">
                Before the Ballot
              </h1>
              <p className="text-white/80 text-lg leading-relaxed mb-10 max-w-sm mx-auto">
                Learn your ballot by playing a personalized game. Democracy just got fun.
              </p>
              <Button
                onClick={handleNext}
                className="w-6/12 h-11 text-sm font-medium bg-white text-zinc-900 hover:bg-white/90"
                size="lg"
              >
                Start personalizing
              </Button>
            </div>
          )}

          {/* Card-based steps */}
          {step > 0 && step < 5 && (
            <div className="bg-zinc-900/80 backdrop-blur-md rounded-xl border border-white/10 p-6 md:p-8">
              {/* Progress indicator */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-white/60 tracking-wide uppercase">
                    Step {step} of 4
                  </span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${(step / 4) * 100}%` }}
                  />
                </div>
              </div>

              {/* Step 1: Location */}
              {step === 1 && (
                <div className="space-y-8">
                  <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 border border-white/20 mb-1">
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-4xl font-heading text-white">Where do you vote?</h1>
                    <p className="text-sm text-white/60">
                      Enter your zip code to see your actual ballot
                    </p>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="90210"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLocationSubmit()}
                      className="w-full h-12 text-center text-lg tracking-widest bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
                      maxLength={5}
                      inputMode="numeric"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleBack}
                      variant="outline"
                      className="h-11 px-4 text-sm font-medium bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleLocationSubmit}
                      disabled={!locationInput.trim() || locationInput.length < 5}
                      className="flex-1 h-11 text-sm font-medium bg-white text-zinc-900 hover:bg-white/90"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Topics */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h1 className="text-4xl font-heading text-white">
                      What matters most to you?
                    </h1>
                    <p className="text-sm text-white/60">
                      Pick up to 3 topics to personalize your quiz
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {TOPICS.map((topic) => {
                      const isSelected = data.topics.includes(topic.id)
                      const isDisabled = !isSelected && data.topics.length >= 3

                      return (
                        <TopicCard
                          key={topic.id}
                          icon={<topic.icon className="w-5 h-5" />}
                          label={topic.label}
                          selected={isSelected}
                          disabled={isDisabled}
                          onClick={() => toggleTopic(topic.id)}
                        />
                      )
                    })}
                  </div>

                  <div className="text-center">
                    <span className="text-xs font-medium text-white/60">
                      {data.topics.length}/3 selected
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      className="h-11 px-4 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={data.topics.length === 0}
                      className="flex-1 h-11 text-sm font-medium bg-white text-zinc-900 hover:bg-white/90"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Knowledge Level */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h1 className="text-4xl font-heading text-white">
                      How familiar are you with politics?
                    </h1>
                    <p className="text-sm text-white/60">
                      We'll tailor the quiz to your experience level.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {KNOWLEDGE_LEVELS.map((level) => {
                      const isSelected = data.knowledgeLevel === level.id
                      const Icon = level.icon

                      return (
                        <button
                          key={level.id}
                          onClick={() => setData((prev) => ({ ...prev, knowledgeLevel: level.id }))}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-lg border transition-all duration-150",
                            isSelected
                              ? "border-white bg-white text-zinc-900"
                              : "border-white/20 bg-white/10 text-white hover:border-white/40"
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-sm font-medium">{level.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      className="h-11 px-4 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!data.knowledgeLevel}
                      className="flex-1 h-11 text-sm font-medium bg-white text-zinc-900 hover:bg-white/90"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: User Type */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h1 className="text-4xl font-heading text-white">
                      What describes you best?
                    </h1>
                    <p className="text-sm text-white/60">
                      Help us personalize your experience.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {USER_TYPES.map((type) => {
                      const isSelected = data.userType === type.id
                      const Icon = type.icon

                      return (
                        <button
                          key={type.id}
                          onClick={() => setData((prev) => ({ ...prev, userType: type.id }))}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-lg border transition-all duration-150",
                            isSelected
                              ? "border-white bg-white text-zinc-900"
                              : "border-white/20 bg-white/10 text-white hover:border-white/40"
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-sm font-medium">{type.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      className="h-11 px-4 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!data.userType}
                      className="flex-1 h-11 text-sm font-medium bg-white text-zinc-900 hover:bg-white/90"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading step */}
          {step === 5 && (
            <div className="bg-zinc-900/80 backdrop-blur-md rounded-xl border border-white/10 p-6 md:p-8">
              <div className="space-y-8 py-2">
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 border border-white/20 mb-1">
                    <Sparkles
                      className={cn(
                        "w-5 h-5 text-white transition-transform duration-500",
                        !allStepsComplete && "animate-pulse"
                      )}
                    />
                  </div>
                  <h1 className="text-4xl font-heading text-white">
                    {allStepsComplete ? "You're all set" : "Building your quiz"}
                  </h1>
                  <p className="text-sm text-white/60">
                    {allStepsComplete
                      ? "Your experience has been customized"
                      : "This will only take a moment"}
                  </p>
                </div>

                <div className="space-y-1">
                  {LOADING_STEPS.map((loadingStepText, index) => {
                    const isCompleted = completedLoadingSteps.includes(index)
                    const isCurrent = loadingStep === index && !isCompleted

                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                          isCompleted && "bg-white/10"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 shrink-0",
                            isCompleted
                              ? "bg-white"
                              : "bg-white/10 border border-white/20"
                          )}
                        >
                          {isCompleted ? (
                            <Check className="w-3 h-3 text-zinc-900" />
                          ) : isCurrent ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm transition-colors duration-200",
                            isCompleted
                              ? "text-white font-medium"
                              : isCurrent
                              ? "text-white"
                              : "text-white/60"
                          )}
                        >
                          {loadingStepText}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {allStepsComplete && (
                  <div className="space-y-3">
                    {canStartGame ? (
                      <Button
                        onClick={handleStartGame}
                        className="w-full h-11 text-sm font-medium bg-white text-zinc-900 hover:bg-white/90"
                      >
                        Start Quiz
                      </Button>
                    ) : (
                      <div className="text-center text-white/60 text-sm">
                        {isGenerating ? "Finishing up..." : "Preparing..."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
