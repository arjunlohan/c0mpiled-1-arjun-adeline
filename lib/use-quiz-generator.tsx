"use client"

import { useState, useCallback, useEffect, createContext, useContext, ReactNode } from "react"
import { Chapter, generateQuizWithLLM, saveQuizResults, SAMPLE_GAME_DATA } from "./game-data"
import { getOrCreateUserId } from "./hyperspell"

// ============================================================================
// HOOK TYPES
// ============================================================================

export interface QuizContext {
  location: string
  topics: string[]
  knowledgeLevel: string
  userType: string
}

export interface ChapterScore {
  id: string
  title: string
  score: number
  total: number
}

export interface UseQuizGeneratorState {
  chapters: Chapter[]
  isLoading: boolean
  error: string | null
  isGenerated: boolean // true if using LLM-generated content
  userId: string | null // User ID for Hyperspell personalization
  quizContext: QuizContext | null // Context for saving results
}

export interface UseQuizGeneratorActions {
  generate: (
    topics: string[], 
    location: string, 
    knowledgeLevel: string,
    userType: string,
    questionsPerChapter?: number
  ) => Promise<boolean>
  saveResults: (chapterScores: ChapterScore[], overallScore: number, overallTotal: number) => Promise<boolean>
  reset: () => void
  useSampleData: () => void
}

export type UseQuizGeneratorReturn = UseQuizGeneratorState & UseQuizGeneratorActions

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * React hook for managing quiz generation with LLM and Hyperspell memory
 * 
 * @example
 * ```tsx
 * const { chapters, isLoading, error, generate, saveResults } = useQuizGenerator()
 * 
 * const handleStart = async () => {
 *   const success = await generate(
 *     ["Border Security", "Tax Reform"], 
 *     "90210",
 *     "intermediate",
 *     "first-time"
 *   )
 *   if (success) {
 *     // Start the game with chapters
 *   }
 * }
 * 
 * // After game completion
 * await saveResults(chapterScores, totalScore, totalQuestions)
 * ```
 */
export function useQuizGenerator(): UseQuizGeneratorReturn {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGenerated, setIsGenerated] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [quizContext, setQuizContext] = useState<QuizContext | null>(null)

  // Initialize user ID on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const id = getOrCreateUserId()
      setUserId(id)
    }
  }, [])

  /**
   * Generate quiz chapters using the LLM API with Hyperspell personalization
   * @returns true if generation succeeded, false otherwise
   */
  const generate = useCallback(async (
    topics: string[],
    location: string,
    knowledgeLevel: string,
    userType: string,
    questionsPerChapter: number = 4
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    // Store context for later result saving
    setQuizContext({ location, topics, knowledgeLevel, userType })

    try {
      const response = await generateQuizWithLLM(
        topics, 
        location, 
        knowledgeLevel, 
        userType, 
        questionsPerChapter,
        userId || undefined
      )

      if (response.success && response.chapters) {
        setChapters(response.chapters)
        setIsGenerated(true)
        setIsLoading(false)
        return true
      } else {
        // Fall back to sample data on error
        console.warn("Quiz generation failed, using sample data:", response.error)
        setError(response.error || "Failed to generate quiz")
        setChapters(SAMPLE_GAME_DATA)
        setIsGenerated(false)
        setIsLoading(false)
        return false
      }
    } catch (err) {
      console.error("Unexpected error in quiz generation:", err)
      setError(err instanceof Error ? err.message : "Unexpected error")
      setChapters(SAMPLE_GAME_DATA)
      setIsGenerated(false)
      setIsLoading(false)
      return false
    }
  }, [userId])

  /**
   * Save quiz results to Hyperspell memory for future personalization
   * @returns true if save succeeded, false otherwise
   */
  const saveResults = useCallback(async (
    chapterScores: ChapterScore[],
    overallScore: number,
    overallTotal: number
  ): Promise<boolean> => {
    if (!userId || !quizContext) {
      console.warn("Cannot save results: missing userId or quiz context")
      return false
    }

    try {
      const response = await saveQuizResults({
        userId,
        location: quizContext.location,
        topics: quizContext.topics,
        knowledgeLevel: quizContext.knowledgeLevel,
        userType: quizContext.userType,
        chapters: chapterScores,
        overallScore,
        overallTotal,
      })

      if (response.success) {
        console.log("Quiz results saved to Hyperspell memory:", response.memoryId)
        return true
      } else {
        console.warn("Failed to save quiz results:", response.error)
        return false
      }
    } catch (err) {
      console.error("Error saving quiz results:", err)
      return false
    }
  }, [userId, quizContext])

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    setChapters([])
    setIsLoading(false)
    setError(null)
    setIsGenerated(false)
    setQuizContext(null)
  }, [])

  /**
   * Use sample data without calling LLM
   */
  const useSampleData = useCallback(() => {
    setChapters(SAMPLE_GAME_DATA)
    setIsGenerated(false)
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    chapters,
    isLoading,
    error,
    isGenerated,
    userId,
    quizContext,
    generate,
    saveResults,
    reset,
    useSampleData,
  }
}

// ============================================================================
// CONTEXT PROVIDER (Optional - for app-wide state)
// ============================================================================

const QuizGeneratorContext = createContext<UseQuizGeneratorReturn | null>(null)

interface QuizGeneratorProviderProps {
  children: ReactNode
}

export function QuizGeneratorProvider({ children }: QuizGeneratorProviderProps) {
  const quizGenerator = useQuizGenerator()

  return (
    <QuizGeneratorContext.Provider value={quizGenerator}>
      {children}
    </QuizGeneratorContext.Provider>
  )
}

export function useQuizGeneratorContext(): UseQuizGeneratorReturn {
  const context = useContext(QuizGeneratorContext)
  if (!context) {
    throw new Error("useQuizGeneratorContext must be used within QuizGeneratorProvider")
  }
  return context
}
