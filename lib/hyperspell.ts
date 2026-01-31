/**
 * Hyperspell Client - Memory layer for AI-powered personalization
 * 
 * This module provides the memory layer for the ballot quiz app, enabling:
 * - User performance tracking across sessions
 * - Personalized quiz generation based on past results
 * - Learning pattern analysis and adaptive difficulty
 */

import Hyperspell from 'hyperspell'

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

/**
 * Get a Hyperspell client for a specific user
 * @param userId - Unique identifier for the user (can be session ID or auth ID)
 */
export function getHyperspellClient(userId?: string): Hyperspell {
  return new Hyperspell({
    apiKey: process.env.HYPERSPELL_API_KEY,
    userID: userId,
  })
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

export interface QuizResultMemory {
  type: 'quiz_result'
  timestamp: string
  location: string
  topics: string[]
  knowledgeLevel: string
  userType: string
  chapters: {
    id: string
    title: string
    score: number
    total: number
    topicAccuracy: number // percentage
  }[]
  overallScore: number
  overallTotal: number
  accuracy: number // percentage
}

export interface UserPreferenceMemory {
  type: 'user_preference'
  timestamp: string
  location: string
  favoriteTopics: string[]
  knowledgeLevel: string
  userType: string
}

export interface TopicPerformanceMemory {
  type: 'topic_performance'
  timestamp: string
  topic: string
  questionsAnswered: number
  correctAnswers: number
  averageAccuracy: number
  trend: 'improving' | 'stable' | 'declining'
}

// ============================================================================
// MEMORY OPERATIONS
// ============================================================================

/**
 * Store a quiz result in the user's memory
 */
export async function storeQuizResult(
  userId: string,
  result: Omit<QuizResultMemory, 'type' | 'timestamp'>
): Promise<string | null> {
  try {
    const client = getHyperspellClient(userId)
    
    const memory: QuizResultMemory = {
      type: 'quiz_result',
      timestamp: new Date().toISOString(),
      ...result,
    }

    const response = await client.memories.add({
      text: formatQuizResultForMemory(memory),
      collection: 'quiz_results',
      metadata: {
        type: 'quiz_result',
        location: result.location,
        accuracy: result.accuracy.toString(),
        topics: result.topics.join(','),
        knowledgeLevel: result.knowledgeLevel,
      },
    })

    return response.resource_id
  } catch (error) {
    console.error('Failed to store quiz result in Hyperspell:', error)
    return null
  }
}

/**
 * Store user preferences in memory
 */
export async function storeUserPreferences(
  userId: string,
  preferences: Omit<UserPreferenceMemory, 'type' | 'timestamp'>
): Promise<string | null> {
  try {
    const client = getHyperspellClient(userId)

    const memory: UserPreferenceMemory = {
      type: 'user_preference',
      timestamp: new Date().toISOString(),
      ...preferences,
    }

    const response = await client.memories.add({
      text: formatPreferencesForMemory(memory),
      collection: 'user_preferences',
      metadata: {
        type: 'user_preference',
        location: preferences.location,
        knowledgeLevel: preferences.knowledgeLevel,
        userType: preferences.userType,
      },
    })

    return response.resource_id
  } catch (error) {
    console.error('Failed to store user preferences in Hyperspell:', error)
    return null
  }
}

/**
 * Query user's past performance for personalization
 */
export async function queryUserPerformance(
  userId: string,
  topics?: string[]
): Promise<{
  averageAccuracy: number
  topicsStrength: Map<string, number>
  suggestedDifficulty: string
  totalQuizzesTaken: number
  summary: string
} | null> {
  try {
    const client = getHyperspellClient(userId)

    const query = topics
      ? `What is the user's performance on ${topics.join(', ')} topics?`
      : `What is the user's overall quiz performance and which topics do they struggle with?`

    const response = await client.memories.search({
      query,
      sources: ['vault'],
      answer: true,
      options: {
        vault: {
          collection: 'quiz_results',
        },
        max_results: 10,
      },
    })

    if (!response.documents || response.documents.length === 0) {
      return null
    }

    // Parse the documents to extract performance metrics
    return parsePerformanceFromDocuments(response.documents, response.answer)
  } catch (error) {
    console.error('Failed to query user performance from Hyperspell:', error)
    return null
  }
}

/**
 * Get personalization context for quiz generation
 * This returns a context string that can be added to the LLM prompt
 */
export async function getPersonalizationContext(
  userId: string,
  topics: string[]
): Promise<string> {
  try {
    const client = getHyperspellClient(userId)

    // Query for relevant user context
    const response = await client.memories.search({
      query: `What do we know about this user's voting knowledge, past quiz performance on ${topics.join(', ')}, and areas they need to improve?`,
      sources: ['vault'],
      answer: true,
      options: {
        max_results: 5,
      },
    })

    if (response.answer) {
      return `
## USER MEMORY CONTEXT
Based on previous interactions with this user:
${response.answer}

Use this context to:
- Avoid repeating similar questions they've answered correctly before
- Focus more on topics they've struggled with
- Adjust difficulty based on their demonstrated knowledge level
`
    }

    return ''
  } catch (error) {
    console.error('Failed to get personalization context:', error)
    return ''
  }
}

/**
 * Store learning insights for continuous improvement
 */
export async function storeLearningInsight(
  userId: string,
  insight: {
    topic: string
    observation: string
    recommendation: string
  }
): Promise<string | null> {
  try {
    const client = getHyperspellClient(userId)

    const text = `Learning insight for ${insight.topic}: ${insight.observation}. Recommendation: ${insight.recommendation}`

    const response = await client.memories.add({
      text,
      collection: 'learning_insights',
      metadata: {
        type: 'learning_insight',
        topic: insight.topic,
      },
    })

    return response.resource_id
  } catch (error) {
    console.error('Failed to store learning insight:', error)
    return null
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatQuizResultForMemory(result: QuizResultMemory): string {
  const chapterSummaries = result.chapters
    .map(c => `${c.title}: ${c.score}/${c.total} (${c.topicAccuracy.toFixed(0)}%)`)
    .join(', ')

  return `Quiz completed on ${result.timestamp}. 
Location: ${result.location}. 
Topics: ${result.topics.join(', ')}. 
Knowledge level: ${result.knowledgeLevel}. 
User type: ${result.userType}.
Chapter results: ${chapterSummaries}.
Overall score: ${result.overallScore}/${result.overallTotal} (${result.accuracy.toFixed(0)}% accuracy).`
}

function formatPreferencesForMemory(preferences: UserPreferenceMemory): string {
  return `User preferences updated on ${preferences.timestamp}.
Location: ${preferences.location}.
Favorite topics: ${preferences.favoriteTopics.join(', ')}.
Self-assessed knowledge level: ${preferences.knowledgeLevel}.
User type: ${preferences.userType}.`
}

function parsePerformanceFromDocuments(
  documents: unknown[],
  answer?: string
): {
  averageAccuracy: number
  topicsStrength: Map<string, number>
  suggestedDifficulty: string
  totalQuizzesTaken: number
  summary: string
} {
  // Default values
  let totalAccuracy = 0
  let count = 0
  const topicsStrength = new Map<string, number>()

  // Parse documents to extract metrics
  for (const doc of documents) {
    if (typeof doc === 'object' && doc !== null) {
      const metadata = (doc as Record<string, unknown>).metadata as Record<string, string> | undefined
      if (metadata?.accuracy) {
        totalAccuracy += parseFloat(metadata.accuracy)
        count++
      }
      if (metadata?.topics) {
        const topics = metadata.topics.split(',')
        for (const topic of topics) {
          const currentStrength = topicsStrength.get(topic) || 0
          topicsStrength.set(topic, currentStrength + 1)
        }
      }
    }
  }

  const averageAccuracy = count > 0 ? totalAccuracy / count : 0

  // Suggest difficulty based on performance
  let suggestedDifficulty: string
  if (averageAccuracy >= 80) {
    suggestedDifficulty = 'expert'
  } else if (averageAccuracy >= 50) {
    suggestedDifficulty = 'intermediate'
  } else {
    suggestedDifficulty = 'beginner'
  }

  return {
    averageAccuracy,
    topicsStrength,
    suggestedDifficulty,
    totalQuizzesTaken: count,
    summary: answer || `User has completed ${count} quizzes with ${averageAccuracy.toFixed(0)}% average accuracy.`,
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Generate a unique session ID for anonymous users
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Get or create a user ID from session storage (client-side)
 * This function should be called from the client
 */
export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') {
    return generateSessionId()
  }

  const stored = localStorage.getItem('ballot_quiz_user_id')
  if (stored) {
    return stored
  }

  const newId = generateSessionId()
  localStorage.setItem('ballot_quiz_user_id', newId)
  return newId
}
