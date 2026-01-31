import { NextRequest, NextResponse } from "next/server"
import { storeQuizResult, storeLearningInsight } from "@/lib/hyperspell"

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ChapterResult {
  id: string
  title: string
  score: number
  total: number
}

interface SaveResultsRequest {
  userId: string
  location: string
  topics: string[]
  knowledgeLevel: string
  userType: string
  chapters: ChapterResult[]
  overallScore: number
  overallTotal: number
}

interface SaveResultsResponse {
  success: boolean
  memoryId?: string
  error?: string
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<SaveResultsResponse>> {
  try {
    // Check if Hyperspell is configured
    if (!process.env.HYPERSPELL_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Hyperspell is not configured" },
        { status: 503 }
      )
    }

    // Parse request body
    const body = await request.json() as SaveResultsRequest
    const {
      userId,
      location,
      topics,
      knowledgeLevel,
      userType,
      chapters,
      overallScore,
      overallTotal,
    } = body

    // Validate required fields
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      )
    }

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      return NextResponse.json(
        { success: false, error: "chapters array is required" },
        { status: 400 }
      )
    }

    // Calculate accuracy metrics
    const accuracy = overallTotal > 0 ? (overallScore / overallTotal) * 100 : 0
    const chaptersWithAccuracy = chapters.map(chapter => ({
      ...chapter,
      topicAccuracy: chapter.total > 0 ? (chapter.score / chapter.total) * 100 : 0,
    }))

    console.log(`Saving quiz results for user ${userId}: ${overallScore}/${overallTotal} (${accuracy.toFixed(0)}%)`)

    // Store the quiz result in Hyperspell
    const memoryId = await storeQuizResult(userId, {
      location,
      topics,
      knowledgeLevel,
      userType,
      chapters: chaptersWithAccuracy,
      overallScore,
      overallTotal,
      accuracy,
    })

    if (!memoryId) {
      return NextResponse.json(
        { success: false, error: "Failed to store quiz result" },
        { status: 500 }
      )
    }

    // Generate and store learning insights for low-performing topics
    for (const chapter of chaptersWithAccuracy) {
      if (chapter.topicAccuracy < 50) {
        // Store an insight about topics the user struggles with
        await storeLearningInsight(userId, {
          topic: chapter.title,
          observation: `User scored ${chapter.score}/${chapter.total} (${chapter.topicAccuracy.toFixed(0)}%) on ${chapter.title}`,
          recommendation: `Consider including more ${chapter.title} questions in future quizzes and adjust difficulty to beginner level for this topic.`,
        })
      } else if (chapter.topicAccuracy >= 80) {
        // Store insight about strong topics
        await storeLearningInsight(userId, {
          topic: chapter.title,
          observation: `User demonstrates strong knowledge of ${chapter.title} with ${chapter.topicAccuracy.toFixed(0)}% accuracy`,
          recommendation: `Can increase difficulty for ${chapter.title} questions or introduce more advanced sub-topics.`,
        })
      }
    }

    console.log(`Quiz results saved successfully with memory ID: ${memoryId}`)

    return NextResponse.json({
      success: true,
      memoryId,
    })

  } catch (error) {
    console.error("Error saving quiz results:", error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "An unexpected error occurred" 
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET handler for documentation
// ============================================================================

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    message: "Quiz Results API - Powered by Hyperspell Memory",
    description: "Stores quiz results to build a personalized learning profile",
    features: [
      "Stores quiz performance in user memory",
      "Tracks accuracy per topic/chapter",
      "Generates learning insights for weak areas",
      "Enables personalized future quiz generation",
    ],
    usage: {
      method: "POST",
      body: {
        userId: "session_123456_abc",
        location: "90210",
        topics: ["Housing & Rent", "Taxes & Economy"],
        knowledgeLevel: "intermediate",
        userType: "first-time",
        chapters: [
          { id: "housing", title: "HOUSING", score: 3, total: 4 },
          { id: "taxes", title: "TAXES", score: 2, total: 4 },
        ],
        overallScore: 5,
        overallTotal: 8,
      },
    },
    configured: !!process.env.HYPERSPELL_API_KEY,
  })
}
