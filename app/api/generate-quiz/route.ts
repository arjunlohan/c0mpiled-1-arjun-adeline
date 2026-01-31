import OpenAI from "openai"
import { NextRequest, NextResponse } from "next/server"
import { getPersonalizationContext, storeUserPreferences } from "@/lib/hyperspell"

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// ============================================================================
// TYPE DEFINITIONS - These define the exact structure we expect from the LLM
// ============================================================================

interface GeneratedQuestion {
  id: string
  text: string           // The true/false statement (max 100 chars)
  answer: boolean        // true = YES is correct, false = NO is correct
  feedbackCorrect: string // Shown when user answers correctly (max 80 chars)
  feedbackWrong: string   // Shown when user answers incorrectly (max 80 chars)
}

interface GeneratedChapter {
  id: string
  number: number
  title: string          // Short title (max 25 chars)
  subtitle: string       // Subtitle for context (max 40 chars)
  description: string    // Brief description (max 60 chars)
  questions: GeneratedQuestion[]
}

interface GenerateQuizRequest {
  topics: string[]           // Array of topic names selected by user during onboarding
  location: string           // Zip code from onboarding
  knowledgeLevel: string     // "beginner" | "intermediate" | "expert"
  userType: string           // "first-time" | "regular" | "curious"
  questionsPerChapter?: number // Default: 4
  userId?: string            // Optional user ID for personalization via Hyperspell
}

interface GenerateQuizResponse {
  success: boolean
  chapters?: GeneratedChapter[]
  error?: string
}

// ============================================================================
// JSON SCHEMA - Structured Outputs ensure the LLM returns exactly this format
// ============================================================================

const QUIZ_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    chapters: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: {
            type: "string" as const,
            description: "Unique kebab-case identifier for the chapter, e.g., 'border-security'"
          },
          number: {
            type: "integer" as const,
            description: "Chapter number starting from 1"
          },
          title: {
            type: "string" as const,
            description: "Short uppercase title (max 25 chars), e.g., 'BORDER SECURITY'"
          },
          subtitle: {
            type: "string" as const,
            description: "Subtitle providing context (max 40 chars), e.g., '& IMMIGRATION'"
          },
          description: {
            type: "string" as const,
            description: "Brief description of the chapter topic (max 60 chars)"
          },
          questions: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: {
                  type: "string" as const,
                  description: "Unique identifier, format: q{chapter}-{question}, e.g., 'q1-1'"
                },
                text: {
                  type: "string" as const,
                  description: "True/false statement (max 100 chars). MUST be a declarative statement, NOT a question."
                },
                answer: {
                  type: "boolean" as const,
                  description: "true if the statement is correct (YES), false if incorrect (NO)"
                },
                feedbackCorrect: {
                  type: "string" as const,
                  description: "Feedback shown when user answers correctly (max 80 chars). Start with 'Correct!' or 'Right!'"
                },
                feedbackWrong: {
                  type: "string" as const,
                  description: "Feedback shown when user answers incorrectly (max 80 chars). Explain the correct answer."
                }
              },
              required: ["id", "text", "answer", "feedbackCorrect", "feedbackWrong"] as const,
              additionalProperties: false
            }
          }
        },
        required: ["id", "number", "title", "subtitle", "description", "questions"] as const,
        additionalProperties: false
      }
    }
  },
  required: ["chapters"] as const,
  additionalProperties: false
}

// ============================================================================
// PROMPT BUILDER - Creates a detailed prompt with user's onboarding info
// ============================================================================

function buildSystemPrompt(knowledgeLevel: string, userType: string): string {
  // Adapt complexity based on knowledge level
  const complexityOptions: Record<string, string> = {
    beginner: `
- Use simple, everyday language - avoid jargon and technical terms
- Explain any necessary political terms in the question or feedback
- Focus on the most impactful and easy-to-understand aspects of each measure
- Keep statements straightforward and concrete`,
    intermediate: `
- Use moderate complexity - some political terminology is okay
- Include context about why measures matter
- Balance accessibility with substantive detail`,
    expert: `
- Feel free to use political and legal terminology
- Include nuanced details about implementation and implications
- Reference specific legislation, precedents, or policy mechanisms`
  }
  const complexityGuidance = complexityOptions[knowledgeLevel] || complexityOptions.intermediate

  // Adapt tone based on user type
  const toneOptions: Record<string, string> = {
    "first-time": `
- Be encouraging and welcoming
- Emphasize that there are no "wrong" answers - this is about learning
- Frame feedback positively, even when correcting mistakes`,
    regular: `
- Be informative and efficient
- Assume familiarity with voting process
- Focus on what's new or different in current measures`,
    curious: `
- Be engaging and interesting
- Highlight surprising or counterintuitive facts
- Make connections to broader civic themes`
  }
  const toneGuidance = toneOptions[userType] || toneOptions.regular

  return `You are an expert civic educator creating an educational quiz game for voters. Your role is to help citizens understand upcoming ballot measures and current political issues in their area.

## YOUR CAPABILITIES
- You have access to web search to find REAL, CURRENT ballot measures and political news
- You MUST use web search to find accurate, up-to-date information
- Focus on ACTUAL ballot measures, propositions, and initiatives that voters will see

## USER PROFILE ADAPTATION
This user has indicated they are at the "${knowledgeLevel}" knowledge level and identified as a "${userType}" voter.

### Complexity Level (${knowledgeLevel}):
${complexityGuidance}

### Tone & Approach (${userType}):
${toneGuidance}

## YOUR APPROACH
1. ALWAYS search the web first to find real ballot measures and current political news
2. Use the user's zip code to find their specific state and local ballot measures
3. Create factual, accurate TRUE/FALSE statements based on real data
4. Be politically neutral - focus on WHAT measures do, not opinions about them
5. Include specific details (percentages, dollar amounts, dates) from your research
6. Adapt difficulty and language to match the user's knowledge level

## OUTPUT FORMAT
You must return valid JSON matching the exact schema provided. Never include markdown formatting or code blocks in your response - just pure JSON.`
}

function buildUserPrompt(
  topics: string[],
  location: string,
  knowledgeLevel: string,
  userType: string,
  questionsPerChapter: number
): string {
  const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join("\n")
  const currentYear = new Date().getFullYear()
  
  // Knowledge level descriptions for context
  const knowledgeDesc = {
    beginner: "new to politics",
    intermediate: "follows the headlines",
    expert: "well-informed about politics"
  }[knowledgeLevel] || "moderate familiarity"

  const userTypeDesc = {
    "first-time": "first-time voter",
    regular: "regular voter",
    curious: "curious about politics"
  }[userType] || "voter"
  
  return `## USER'S ONBOARDING SELECTIONS
The user has completed onboarding and selected the following:

**Zip Code:** ${location}
**Topics of Interest:**
${topicList}
**Knowledge Level:** ${knowledgeLevel} (${knowledgeDesc})
**User Type:** ${userType} (${userTypeDesc})

## YOUR TASK
Create a personalized quiz for this voter about their selected topics, tailored to their experience level.

### STEP 1: WEB SEARCH (REQUIRED)
You MUST search the web to find:
1. First, identify the STATE from zip code ${location}
2. Current and upcoming ballot measures in that state for ${currentYear} and ${currentYear + 1}
3. Recent political news and proposed legislation related to: ${topics.join(", ")}
4. Specific propositions, initiatives, or referendums on the ballot
5. Key details: what each measure would do, funding amounts, deadlines, requirements

Search queries to use:
- "zip code ${location} state"
- "[state from zip] ${currentYear} ballot measures ${topics[0]}"
- "[state from zip] propositions ${currentYear + 1}"
- "[state from zip] ${topics.join(" ")} legislation news"

### STEP 2: CREATE QUIZ CHAPTERS
Generate ${topics.length} chapters, one for each topic the user selected.
Each chapter should have exactly ${questionsPerChapter} TRUE/FALSE questions.

### REQUIREMENTS

**Adapt to User's Level (${knowledgeLevel}):**
${knowledgeLevel === "beginner" ? 
  "- Use simple language, explain any political terms\n- Focus on the most impactful, easy-to-understand aspects" :
  knowledgeLevel === "expert" ?
  "- Feel free to use political/legal terminology\n- Include nuanced details about implementation" :
  "- Use moderate complexity with some political terms\n- Balance accessibility with substantive detail"}

**Statement Format:**
- Each question MUST be a declarative STATEMENT, not a question
- Good: "Proposition 33 would allow cities to expand rent control to all housing"
- Bad: "Would Proposition 33 expand rent control?"

**Answer Design:**
- Mix of TRUE (about 50%) and FALSE (about 50%) answers
- Base ALL statements on REAL ballot measures and laws you found via web search
- Include specific names (Prop 33, SB 1047, Initiative 2024-001, etc.)
- Include specific numbers when available (5% cap, $12 billion, 2026 deadline)

**Character Limits (STRICT - must fit on mobile screen):**
- title: max 25 characters
- subtitle: max 40 characters  
- description: max 60 characters
- question text: max 100 characters
- feedbackCorrect: max 80 characters
- feedbackWrong: max 80 characters

**Formatting:**
- Chapter titles: UPPERCASE (e.g., "HOUSING")
- Subtitles: Often start with "&" (e.g., "& RENT CONTROL")
- Question IDs: q{chapterNum}-{questionNum} (e.g., q1-1, q1-2, q2-1)
- Chapter IDs: kebab-case (e.g., "housing-policy")

### EXAMPLE OUTPUT
{
  "chapters": [
    {
      "id": "housing-rent-control",
      "number": 1,
      "title": "HOUSING",
      "subtitle": "& RENT CONTROL",
      "description": "Proposed rent control measures for ${currentYear + 1}",
      "questions": [
        {
          "id": "q1-1",
          "text": "Proposition 33 would allow cities to expand rent control to all housing",
          "answer": true,
          "feedbackCorrect": "Correct! Prop 33 repeals Costa-Hawkins Act limits",
          "feedbackWrong": "Actually YES - it removes current rent control restrictions"
        },
        {
          "id": "q1-2",
          "text": "California currently has a statewide 10% rent cap for all rentals",
          "answer": false,
          "feedbackCorrect": "Right! The cap is 5% + inflation, max 10% total",
          "feedbackWrong": "No - the AB 1482 cap is 5% + inflation (max 10%)"
        }
      ]
    }
  ]
}

Now search the web to find the state for zip code ${location}, then find real ballot measures about ${topics.join(", ")} for that state, and generate the quiz based on what you find. Remember to tailor complexity to the ${knowledgeLevel} level.`
}

// ============================================================================
// API ROUTE HANDLER - Uses Responses API with Web Search
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<GenerateQuizResponse>> {
  try {
    // Parse request body
    const body = await request.json() as GenerateQuizRequest
    const { 
      topics, 
      location, 
      knowledgeLevel = "intermediate", 
      userType = "regular",
      questionsPerChapter = 4,
      userId
    } = body

    // Validate input
    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json(
        { success: false, error: "topics array is required and must not be empty" },
        { status: 400 }
      )
    }

    if (!location || typeof location !== "string") {
      return NextResponse.json(
        { success: false, error: "location (zip code) is required and must be a string" },
        { status: 400 }
      )
    }

    console.log(`Generating quiz for zip ${location} (${knowledgeLevel}/${userType}) with topics: ${topics.join(", ")}`)

    // ========================================================================
    // HYPERSPELL INTEGRATION - Memory-powered personalization
    // ========================================================================
    
    let personalizationContext = ""
    
    // If we have a user ID and Hyperspell is configured, get personalization context
    if (userId && process.env.HYPERSPELL_API_KEY) {
      console.log(`Fetching personalization context for user: ${userId}`)
      
      try {
        // Store user preferences for future reference
        await storeUserPreferences(userId, {
          location,
          favoriteTopics: topics,
          knowledgeLevel,
          userType,
        })
        
        // Get context from past quiz performance
        personalizationContext = await getPersonalizationContext(userId, topics)
        
        if (personalizationContext) {
          console.log("Hyperspell personalization context retrieved successfully")
        }
      } catch (hyperspellError) {
        // Log but don't fail - Hyperspell is optional enhancement
        console.warn("Hyperspell personalization failed, continuing without:", hyperspellError)
      }
    }

    // Build prompts with user profile data and personalization context
    const systemPrompt = buildSystemPrompt(knowledgeLevel, userType)
    const userPrompt = buildUserPrompt(topics, location, knowledgeLevel, userType, questionsPerChapter) + personalizationContext

    // Call OpenAI Responses API with gpt-5.2 and web search
    // Using the Responses API as recommended in the docs
    const response = await openai.responses.create({
      model: "gpt-5.2-2025-12-11",
      instructions: systemPrompt,
      input: userPrompt,
      tools: [
        { type: "web_search" }  // Enable web search for real ballot data
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quiz_chapters",
          strict: true,
          schema: QUIZ_OUTPUT_SCHEMA
        }
      }
    })

    // Extract the response content
    // The Responses API returns output_text for convenience
    const content = response.output_text
    
    if (!content) {
      console.error("No content returned from LLM")
      return NextResponse.json(
        { success: false, error: "No content returned from LLM" },
        { status: 500 }
      )
    }

    console.log("LLM response received, parsing JSON...")

    // Parse the JSON response
    let parsedResponse: { chapters: GeneratedChapter[] }
    try {
      parsedResponse = JSON.parse(content)
    } catch (parseError) {
      console.error("Failed to parse LLM response:", content.substring(0, 500))
      return NextResponse.json(
        { success: false, error: "Failed to parse LLM response as JSON" },
        { status: 500 }
      )
    }

    // Validate the response structure
    if (!parsedResponse.chapters || !Array.isArray(parsedResponse.chapters)) {
      console.error("Invalid response structure:", parsedResponse)
      return NextResponse.json(
        { success: false, error: "Invalid response structure: missing chapters array" },
        { status: 500 }
      )
    }

    // Validate each chapter and question
    for (const chapter of parsedResponse.chapters) {
      if (!chapter.id || !chapter.title || !chapter.questions) {
        console.error("Invalid chapter structure:", chapter)
        return NextResponse.json(
          { success: false, error: `Invalid chapter structure: missing required fields` },
          { status: 500 }
        )
      }

      for (const question of chapter.questions) {
        if (
          typeof question.id !== "string" ||
          typeof question.text !== "string" ||
          typeof question.answer !== "boolean" ||
          typeof question.feedbackCorrect !== "string" ||
          typeof question.feedbackWrong !== "string"
        ) {
          console.error("Invalid question structure:", question)
          return NextResponse.json(
            { success: false, error: `Invalid question structure in chapter ${chapter.id}` },
            { status: 500 }
          )
        }
      }
    }

    console.log(`Successfully generated ${parsedResponse.chapters.length} chapters`)

    // Return successful response
    return NextResponse.json({
      success: true,
      chapters: parsedResponse.chapters
    })

  } catch (error) {
    console.error("Error generating quiz:", error)
    
    // Handle specific error types
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Failed to parse LLM response as JSON" },
        { status: 500 }
      )
    }

    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API error:", error.message, error.status)
      return NextResponse.json(
        { success: false, error: `OpenAI API error: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: false, error: `An unexpected error occurred: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET handler for testing/documentation
// ============================================================================

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    message: "Quiz Generation API - Powered by GPT-5.2 with Web Search",
    description: "Generates personalized quiz questions based on real, current ballot measures",
    features: [
      "Uses GPT-5.2-2025-12-11 model",
      "Web search enabled for real-time ballot data",
      "Personalized to user's zip code, topics, and experience level",
      "Adapts difficulty based on knowledge level (beginner/intermediate/expert)",
      "Tailors tone based on user type (first-time/regular/curious)",
      "Structured JSON output with strict schema validation"
    ],
    usage: {
      method: "POST",
      body: {
        topics: ["Housing & Rent", "Taxes & Economy", "Healthcare"],
        location: "90210",
        knowledgeLevel: "beginner | intermediate | expert",
        userType: "first-time | regular | curious",
        questionsPerChapter: 4
      },
      description: "All fields come from user's onboarding selections"
    },
    outputSchema: QUIZ_OUTPUT_SCHEMA
  })
}
