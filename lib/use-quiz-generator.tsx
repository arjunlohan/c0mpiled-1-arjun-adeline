"use client"

import { useState, useCallback, createContext, useContext, ReactNode } from "react"
import { Chapter, generateQuizWithLLM, SAMPLE_GAME_DATA } from "./game-data"

// ============================================================================
// HOOK TYPES
// ============================================================================

export interface UseQuizGeneratorState {
  chapters: Chapter[]
  isLoading: boolean
  error: string | null
  isGenerated: boolean // true if using LLM-generated content
}

export interface UseQuizGeneratorActions {
  generate: (topics: string[], state: string, questionsPerChapter?: number) => Promise<boolean>
  reset: () => void
  useSampleData: () => void
}

export type UseQuizGeneratorReturn = UseQuizGeneratorState & UseQuizGeneratorActions

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * React hook for managing quiz generation with LLM
 * 
 * @example
 * ```tsx
 * const { chapters, isLoading, error, generate } = useQuizGenerator()
 * 
 * const handleStart = async () => {
 *   const success = await generate(
 *     ["Border Security", "Tax Reform"], 
 *     "California"
 *   )
 *   if (success) {
 *     // Start the game with chapters
 *   }
 * }
 * ```
 */
export function useQuizGenerator(): UseQuizGeneratorReturn {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGenerated, setIsGenerated] = useState(false)

  /**
   * Generate quiz chapters using the LLM API
   * @returns true if generation succeeded, false otherwise
   */
  const generate = useCallback(async (
    topics: string[],
    state: string,
    questionsPerChapter: number = 4
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await generateQuizWithLLM(topics, state, questionsPerChapter)

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
  }, [])

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    setChapters([])
    setIsLoading(false)
    setError(null)
    setIsGenerated(false)
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
    generate,
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
