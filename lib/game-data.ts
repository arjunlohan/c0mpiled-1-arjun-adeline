// Game Data Types and Quiz Generation

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Question {
  id: string
  text: string           // Max ~100 chars for display
  answer: boolean        // true = YES is correct, false = NO is correct
  feedbackCorrect: string // Max ~80 chars
  feedbackWrong: string   // Max ~80 chars
}

export interface Chapter {
  id: string
  number: number
  title: string          // Max ~25 chars
  subtitle: string       // Max ~40 chars
  description: string    // Max ~60 chars
  questions: Question[]
}

export interface GameScore {
  chapterScores: { correct: number; total: number }[]
  totalCorrect: number
  totalQuestions: number
}

export interface GameConfig {
  chapters: Chapter[]
}

// API Request/Response types
export interface GenerateQuizRequest {
  topics: string[]
  location: string           // Zip code from onboarding
  knowledgeLevel: string     // "beginner" | "intermediate" | "expert"
  userType: string           // "first-time" | "regular" | "curious"
  questionsPerChapter?: number
}

export interface GenerateQuizResponse {
  success: boolean
  chapters?: Chapter[]
  error?: string
}

// ============================================================================
// LLM QUIZ GENERATION
// ============================================================================

/**
 * Generates quiz chapters using the LLM API
 * 
 * @param topics - Array of topic names to generate questions for
 * @param location - Zip code from onboarding
 * @param knowledgeLevel - User's familiarity with politics
 * @param userType - Type of voter (first-time, regular, curious)
 * @param questionsPerChapter - Number of questions per chapter (default: 4)
 * @returns Promise with generated chapters or error
 */
export async function generateQuizWithLLM(
  topics: string[],
  location: string,
  knowledgeLevel: string,
  userType: string,
  questionsPerChapter: number = 4
): Promise<GenerateQuizResponse> {
  try {
    const response = await fetch("/api/generate-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topics,
        location,
        knowledgeLevel,
        userType,
        questionsPerChapter,
      } as GenerateQuizRequest),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || `HTTP error: ${response.status}`,
      }
    }

    const data = await response.json() as GenerateQuizResponse
    return data

  } catch (error) {
    console.error("Error calling quiz generation API:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error occurred",
    }
  }
}

// ============================================================================
// SAMPLE/FALLBACK DATA
// ============================================================================

export const SAMPLE_GAME_DATA: Chapter[] = [
  {
    id: "border-immigration",
    number: 1,
    title: "BORDER SECURITY",
    subtitle: "& IMMIGRATION",
    description: "California's proposed changes to sanctuary laws",
    questions: [
      {
        id: "q1-1",
        text: "The Border Security Initiative would END California's sanctuary state status",
        answer: true,
        feedbackCorrect: "Correct! It would fully repeal sanctuary laws",
        feedbackWrong: "Actually, it WOULD end sanctuary status statewide"
      },
      {
        id: "q1-2",
        text: "California currently has state guard deployed at the southern border",
        answer: false,
        feedbackCorrect: "Right! The initiative would START this deployment",
        feedbackWrong: "No troops currently - the measure would deploy them"
      },
      {
        id: "q1-3",
        text: "The initiative would cut state welfare funding for undocumented immigrants",
        answer: true,
        feedbackCorrect: "Correct! It revokes state and local welfare funding",
        feedbackWrong: "Yes, it would immediately revoke welfare program funding"
      },
      {
        id: "q1-4",
        text: "This initiative has already qualified for the 2026 ballot",
        answer: false,
        feedbackCorrect: "Right! Still collecting signatures",
        feedbackWrong: "Not yet - needs 875,000 valid signatures first"
      }
    ]
  },
  {
    id: "taxes-economy",
    number: 2,
    title: "TAXES",
    subtitle: "& ECONOMY",
    description: "Proposed changes to California's tax system",
    questions: [
      {
        id: "q2-1",
        text: "The Wealth Tax would apply to income over $50,000 per year",
        answer: false,
        feedbackCorrect: "Right! It's $50 MILLION, not thousand",
        feedbackWrong: "Actually $50 MILLION - only ultra-wealthy"
      },
      {
        id: "q2-2",
        text: "The Wealth Tax would raise approximately $12 billion annually",
        answer: true,
        feedbackCorrect: "Correct! Projected $12B per year",
        feedbackWrong: "Yes - estimated $12 billion in new revenue"
      },
      {
        id: "q2-3",
        text: "Revenue from the Wealth Tax must be spent on education and healthcare",
        answer: true,
        feedbackCorrect: "Yes! Funds are earmarked for schools & health",
        feedbackWrong: "Actually YES - it's restricted to education/healthcare"
      },
      {
        id: "q2-4",
        text: "The tax rate would be 1.5% on qualifying income",
        answer: true,
        feedbackCorrect: "Correct! 1.5% annual tax on $50M+ income",
        feedbackWrong: "Yes - 1.5% on income above the threshold"
      }
    ]
  },
  {
    id: "housing-elections",
    number: 3,
    title: "HOUSING",
    subtitle: "& ELECTIONS",
    description: "Rent control and voting changes for 2026",
    questions: [
      {
        id: "q3-1",
        text: "The Rent Control measure would cap increases at 5% per year statewide",
        answer: true,
        feedbackCorrect: "Correct! 5% annual cap for all rentals",
        feedbackWrong: "Yes - 5% maximum annual increase"
      },
      {
        id: "q3-2",
        text: "California currently requires photo ID to vote in all elections",
        answer: false,
        feedbackCorrect: "Right! CA doesn't currently require photo ID",
        feedbackWrong: "No - this would be a NEW requirement"
      },
      {
        id: "q3-3",
        text: "The Voter ID initiative would require ID for mail-in ballots as well",
        answer: true,
        feedbackCorrect: "Yes! Last 4 digits of ID number required",
        feedbackWrong: "Yes - mail ballots would need ID number too"
      },
      {
        id: "q3-4",
        text: "Rent control would apply to all housing, including single-family homes",
        answer: true,
        feedbackCorrect: "Correct! All rental properties statewide",
        feedbackWrong: "Yes - includes single-family rentals too"
      }
    ]
  }
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets game data - uses sample data as fallback
 * For LLM-generated content, use generateQuizWithLLM() instead
 */
export function getGameData(topics?: string[]): Chapter[] {
  // Return sample data - for dynamic generation, call generateQuizWithLLM()
  return SAMPLE_GAME_DATA
}

/**
 * Creates initial score structure based on chapters
 */
export function createInitialScore(chapters: Chapter[]): GameScore {
  return {
    chapterScores: chapters.map(c => ({ correct: 0, total: c.questions.length })),
    totalCorrect: 0,
    totalQuestions: chapters.reduce((sum, c) => sum + c.questions.length, 0)
  }
}

/**
 * Validates a chapter array to ensure it matches expected format
 */
export function validateChapters(chapters: unknown): chapters is Chapter[] {
  if (!Array.isArray(chapters)) return false
  
  return chapters.every(chapter => {
    if (typeof chapter !== "object" || chapter === null) return false
    
    const c = chapter as Record<string, unknown>
    if (
      typeof c.id !== "string" ||
      typeof c.number !== "number" ||
      typeof c.title !== "string" ||
      typeof c.subtitle !== "string" ||
      typeof c.description !== "string" ||
      !Array.isArray(c.questions)
    ) {
      return false
    }
    
    return (c.questions as unknown[]).every(question => {
      if (typeof question !== "object" || question === null) return false
      
      const q = question as Record<string, unknown>
      return (
        typeof q.id === "string" &&
        typeof q.text === "string" &&
        typeof q.answer === "boolean" &&
        typeof q.feedbackCorrect === "string" &&
        typeof q.feedbackWrong === "string"
      )
    })
  })
}
