"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { Chapter, Question, GameScore, getGameData, createInitialScore } from "@/lib/game-data"

// Canvas dimensions (mobile portrait)
const CANVAS_WIDTH = 288
const CANVAS_HEIGHT = 512

// Physics constants - Original Flappy Bird style (snappier, more responsive)
const GRAVITY = 0.5
const JUMP_STRENGTH = 9
const BIRD_WIDTH = 34
const BIRD_HEIGHT = 24
const TARGET_FPS = 60
const MAX_DELTA_TIME = 1.5
const JUMP_COOLDOWN = 150

// Pipe constants
const PIPE_WIDTH = 52
const PIPE_SPEED = 2
const PIPE_SPAWN_X = CANVAS_WIDTH + 20
const PIPE_GAP_NORMAL = 200 // Gap for normal single-slot pipes
const MIDDLE_PIPE_HEIGHT = 30 // Middle pipe with proper end caps
const SLOT_HEIGHT = 160 // Larger space for YES/NO slots
const PIPE_END_CAP_HEIGHT = 26 // Height of the pipe end cap

// Number of normal pipes between questions
const NORMAL_PIPES_BETWEEN_QUESTIONS = 5

// Scroll/Parchment constants - AT BOTTOM
const SCROLL_MARGIN = 15
const SCROLL_WIDTH = CANVAS_WIDTH - SCROLL_MARGIN * 2
const SCROLL_HEIGHT = 110
const SCROLL_Y = CANVAS_HEIGHT - SCROLL_HEIGHT - 10

// Play area (bird can fly full screen, dies at screen edges)
const PLAY_AREA_TOP = 0
const PLAY_AREA_BOTTOM = CANVAS_HEIGHT

// Pipe generation area (pipes spawn above the scroll area)
const PIPE_AREA_TOP = 50
const PIPE_AREA_BOTTOM = SCROLL_Y - 20

// Animation timing (ms)
const SCROLL_ANIMATION_DURATION = 600
const CHAPTER_INTRO_TIME = 3000
const CHAPTER_COMPLETE_TIME = 4000
const GAME_OVER_DELAY = 1500
const QUESTION_PREVIEW_TIME = 3000 // Time to read question before pipe appears
const AUTO_FLY_TIME = 4000 // Time bird flies on autopilot while user reads first question

// Colors
const PARCHMENT_COLOR = "#f4e4bc"
const PARCHMENT_BORDER = "#8b7355"
const TEXT_COLOR = "#2d2a26"

// Pipe types
type PipeType = "normal" | "question"

// Game phases
type GamePhase = 
  | "loading"
  | "chapter_intro"
  | "ready_to_play"     // Bird hovers, waiting for first tap to start
  | "auto_fly"          // Bird flies automatically while user reads question
  | "playing"           // Active gameplay (normal + question pipes)
  | "question_preview"  // Show question, bird flies, countdown before pipe appears
  | "game_over"         // Bird hit a pipe
  | "chapter_complete"
  | "game_complete"

interface Bird {
  y: number
  velocity: number
  frame: number
}

interface Pipe {
  x: number
  type: PipeType
  // For normal pipes (single slot)
  gapTop?: number
  gapBottom?: number
  // For question pipes (two slots)
  topPipeBottom?: number
  middlePipeTop?: number
  middlePipeBottom?: number
  bottomPipeTop?: number
  // Common
  passed: boolean
  scored: boolean
  questionAnswered?: boolean
}

interface GameState {
  phase: GamePhase
  bird: Bird
  pipes: Pipe[]
  chapterIndex: number
  questionIndex: number
  score: GameScore
  displayScore: number
  pipesSinceLastQuestion: number // Count pipes since last question
  currentQuestionActive: boolean // Is there a question pipe on screen?
  scrollProgress: number
  phaseStartTime: number
  frameCount: number
  questionPreviewProgress: number // 0-1 progress for question preview countdown
}

interface QuizGameProps {
  topics?: string[]
  location?: string           // Zip code from onboarding
  knowledgeLevel?: string     // User's familiarity with politics
  userType?: string           // Type of voter
  chapters?: Chapter[]        // Pre-generated chapters from LLM
  onComplete?: (score: GameScore) => void
}

export default function QuizGame({ topics, location, knowledgeLevel, userType, chapters: propChapters, onComplete }: QuizGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  // Use prop chapters if provided, otherwise fall back to sample data
  const [chapters] = useState<Chapter[]>(() => propChapters && propChapters.length > 0 ? propChapters : getGameData(topics))

  const lastFrameTimeRef = useRef<number>(0)
  const lastJumpTimeRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBuffersRef = useRef<{
    point?: AudioBuffer
    hit?: AudioBuffer
    wing?: AudioBuffer
  }>({})

  // Game state ref
  const gameStateRef = useRef<GameState>({
    phase: "loading",
    bird: { y: (PIPE_AREA_TOP + PIPE_AREA_BOTTOM) / 2, velocity: 0, frame: 0 },
    pipes: [],
    chapterIndex: 0,
    questionIndex: 0,
    score: createInitialScore(chapters),
    displayScore: 0,
    pipesSinceLastQuestion: 0,
    currentQuestionActive: false,
    scrollProgress: 0,
    phaseStartTime: 0,
    frameCount: 0,
    questionPreviewProgress: 0
  })

  // Asset refs
  const birdSprites = useRef<HTMLImageElement[]>([])
  const backgroundImage = useRef<HTMLImageElement | null>(null)
  const pipeImage = useRef<HTMLImageElement | null>(null)

  // Calculate scale for mobile
  useEffect(() => {
    const updateScale = () => {
      if (window.innerWidth < 768) {
        const scaleX = window.innerWidth / CANVAS_WIDTH
        const scaleY = window.innerHeight / CANVAS_HEIGHT
        setScale(Math.max(scaleX, scaleY))
      } else {
        setScale(1)
      }
    }
    updateScale()
    window.addEventListener("resize", updateScale)
    window.addEventListener("orientationchange", updateScale)
    return () => {
      window.removeEventListener("resize", updateScale)
      window.removeEventListener("orientationchange", updateScale)
    }
  }, [])

  // Load assets
  useEffect(() => {
    const birdUrls = [
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/yellowbird-downflap-ZExrg9YxRxwFfLXDu6JijpJUQgByX6.png",
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/yellowbird-midflap-8mBrx070GYsw2As4Ue9BfQJ5XNMUg3.png",
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/yellowbird-upflap-hMo7jE66Ar0TzdbAMTzTMWaEGpTNx2.png",
    ]
    const backgroundUrl = "/background.png"
    const pipeUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/pipe-green-zrz2zTtoVXaLn6xDqgrNVF9luzjW1B.png"

    const loadImage = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
        img.src = url
      })

    const loadAudioBuffer = async (url: string): Promise<AudioBuffer> => {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = audioContextRef.current || new AudioContextClass()
      audioContextRef.current = audioContext
      return await audioContext.decodeAudioData(arrayBuffer)
    }

    Promise.all([
      ...birdUrls.map(loadImage),
      loadImage(backgroundUrl),
      loadImage(pipeUrl),
      loadAudioBuffer(
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/point-SdTORahWMlxujnLCoDbujDLHI6KFeC.wav"
      ).then((buffer) => { audioBuffersRef.current.point = buffer; return buffer }),
      loadAudioBuffer(
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/hit-YVMFYQJEgZASG6O3xPWiyiqPtOLygb.wav"
      ).then((buffer) => { audioBuffersRef.current.hit = buffer; return buffer }),
      loadAudioBuffer(
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/wing-oOSsspXpVMDc0enrWj4WWLaHVqs6Hk.wav"
      ).then((buffer) => { audioBuffersRef.current.wing = buffer; return buffer }),
    ])
      .then((loadedAssets) => {
        birdSprites.current = loadedAssets.slice(0, 3) as HTMLImageElement[]
        backgroundImage.current = loadedAssets[3] as HTMLImageElement
        pipeImage.current = loadedAssets[4] as HTMLImageElement
        setAssetsLoaded(true)
        gameStateRef.current.phase = "chapter_intro"
        gameStateRef.current.phaseStartTime = performance.now()
      })
      .catch((error) => {
        console.error("Asset loading error:", error)
        setLoadingError(error.message)
      })
  }, [])

  const playSound = useCallback((bufferKey: "point" | "hit" | "wing") => {
    const buffer = audioBuffersRef.current[bufferKey]
    const audioContext = audioContextRef.current
    if (buffer && audioContext && audioContext.state === "running") {
      try {
        const source = audioContext.createBufferSource()
        source.buffer = buffer
        source.connect(audioContext.destination)
        source.start(0)
      } catch (error) {
        console.error("Error playing sound:", error)
      }
    }
  }, [])

  const jump = useCallback(() => {
    const state = gameStateRef.current
    const now = Date.now()

    if (now - lastJumpTimeRef.current < JUMP_COOLDOWN) return
    lastJumpTimeRef.current = now

    // Initialize AudioContext
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioContextRef.current = new AudioContextClass()
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
    }

    if (state.phase === "playing" || state.phase === "question_preview") {
      state.bird.velocity = -JUMP_STRENGTH
      playSound("wing")
    }
  }, [playSound])

  // Helper: Word wrap text
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(" ")
    const lines: string[] = []
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)
    return lines
  }

  // Draw parchment scroll
  const drawParchment = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number = 1
  ) => {
    const actualHeight = height * progress
    if (actualHeight < 10) return

    const drawY = y + height - actualHeight

    ctx.save()

    ctx.shadowColor = "rgba(0, 0, 0, 0.3)"
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = -4

    const gradient = ctx.createLinearGradient(x, drawY, x + width, drawY + actualHeight)
    gradient.addColorStop(0, "#e8d5a3")
    gradient.addColorStop(0.2, PARCHMENT_COLOR)
    gradient.addColorStop(0.5, "#f7edd6")
    gradient.addColorStop(0.8, PARCHMENT_COLOR)
    gradient.addColorStop(1, "#e0d0a0")

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(x, drawY, width, actualHeight, 6)
    ctx.fill()

    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0

    ctx.fillStyle = "rgba(139, 115, 85, 0.08)"
    for (let i = 0; i < 6; i++) {
      const spotX = x + 15 + (i * 40) % (width - 30)
      const spotY = drawY + 15 + (i * 20) % Math.max(10, actualHeight - 30)
      if (spotY < drawY + actualHeight - 10) {
        ctx.beginPath()
        ctx.arc(spotX, spotY, 2 + (i % 3), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const rollGradient = ctx.createLinearGradient(x, drawY + actualHeight - 14, x, drawY + actualHeight)
    rollGradient.addColorStop(0, PARCHMENT_COLOR)
    rollGradient.addColorStop(0.3, "#b8a070")
    rollGradient.addColorStop(0.5, "#d4c4a0")
    rollGradient.addColorStop(0.7, "#c4a84d")
    rollGradient.addColorStop(1, "#8b6914")
    ctx.fillStyle = rollGradient
    ctx.beginPath()
    ctx.roundRect(x, drawY + actualHeight - 14, width, 14, [0, 0, 6, 6])
    ctx.fill()

    ctx.strokeStyle = PARCHMENT_BORDER
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x, drawY, width, actualHeight, 6)
    ctx.stroke()

    ctx.restore()
  }

  // Draw chapter intro
  const drawChapterIntro = (
    ctx: CanvasRenderingContext2D,
    chapter: Chapter,
    progress: number
  ) => {
    const scrollHeight = 200
    const scrollY = (CANVAS_HEIGHT - scrollHeight) / 2
    drawParchment(ctx, SCROLL_MARGIN, scrollY, SCROLL_WIDTH, scrollHeight, progress)

    if (progress < 0.3) return

    const textAlpha = Math.min(1, (progress - 0.3) / 0.3)
    ctx.save()
    ctx.globalAlpha = textAlpha

    ctx.fillStyle = TEXT_COLOR
    ctx.font = "bold 14px Georgia, serif"
    ctx.textAlign = "center"
    const centerX = CANVAS_WIDTH / 2
    let textY = scrollY + 45

    ctx.fillText(`CHAPTER ${chapter.number}`, centerX, textY)

    textY += 15
    ctx.strokeStyle = PARCHMENT_BORDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX - 60, textY)
    ctx.lineTo(centerX + 60, textY)
    ctx.stroke()

    textY += 30
    ctx.font = "bold 20px Georgia, serif"
    ctx.fillText(chapter.title, centerX, textY)

    if (chapter.subtitle) {
      textY += 25
      ctx.font = "bold 18px Georgia, serif"
      ctx.fillText(chapter.subtitle, centerX, textY)
    }

    textY += 35
    ctx.font = "14px Georgia, serif"
    const descLines = wrapText(ctx, chapter.description, SCROLL_WIDTH - 40)
    for (const line of descLines) {
      ctx.fillText(line, centerX, textY)
      textY += 18
    }

    ctx.restore()
  }

  // Draw question scroll at bottom
  const drawQuestionScrollBottom = (
    ctx: CanvasRenderingContext2D,
    question: Question | null,
    progress: number
  ) => {
    if (!question) return
    
    drawParchment(ctx, SCROLL_MARGIN, SCROLL_Y, SCROLL_WIDTH, SCROLL_HEIGHT, progress)

    if (progress < 0.4) return

    const textAlpha = Math.min(1, (progress - 0.4) / 0.3)
    ctx.save()
    ctx.globalAlpha = textAlpha

    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = "center"
    const centerX = CANVAS_WIDTH / 2

    ctx.font = "bold 11px Georgia, serif"
    ctx.fillText("TRUE OR FALSE:", centerX, SCROLL_Y + 22)

    ctx.font = "13px Georgia, serif"
    const lines = wrapText(ctx, question.text, SCROLL_WIDTH - 25)
    let textY = SCROLL_Y + 42
    for (const line of lines) {
      ctx.fillText(line, centerX, textY)
      textY += 16
    }

    ctx.restore()
  }

  // Draw a normal pipe (single slot)
  const drawNormalPipe = (ctx: CanvasRenderingContext2D, pipe: Pipe) => {
    if (!pipeImage.current || pipe.type !== "normal") return

    const img = pipeImage.current

    // Top pipe (from ceiling down to gapTop)
    ctx.save()
    ctx.scale(1, -1)
    ctx.drawImage(img, pipe.x, -(pipe.gapTop || 0), PIPE_WIDTH, 320)
    ctx.restore()

    // Bottom pipe (from gapBottom to floor)
    ctx.drawImage(img, pipe.x, pipe.gapBottom || 0, PIPE_WIDTH, 320)
  }

  // Draw a question pipe (two slots with middle pipe)
  const drawQuestionPipe = (ctx: CanvasRenderingContext2D, pipe: Pipe) => {
    if (!pipeImage.current || pipe.type !== "question") return

    const img = pipeImage.current

    // TOP PIPE (from ceiling down)
    ctx.save()
    ctx.scale(1, -1)
    ctx.drawImage(img, pipe.x, -(pipe.topPipeBottom || 0), PIPE_WIDTH, 320)
    ctx.restore()

    // MIDDLE PIPE (with end caps on both sides)
    const middleTop = pipe.middlePipeTop || 0
    const middleBottom = pipe.middlePipeBottom || 0
    const middleHeight = middleBottom - middleTop

    // Top end cap of middle pipe (pointing down) - draw upside down
    ctx.save()
    ctx.scale(1, -1)
    ctx.drawImage(img, pipe.x, -middleTop - PIPE_END_CAP_HEIGHT, PIPE_WIDTH, PIPE_END_CAP_HEIGHT)
    ctx.restore()

    // Middle section body (if there's space)
    if (middleHeight > PIPE_END_CAP_HEIGHT * 2) {
      ctx.fillStyle = "#73bf2e" // Pipe body color
      ctx.fillRect(pipe.x + 2, middleTop + PIPE_END_CAP_HEIGHT, PIPE_WIDTH - 4, middleHeight - PIPE_END_CAP_HEIGHT * 2)
    }

    // Bottom end cap of middle pipe (pointing up)
    ctx.drawImage(img, pipe.x, middleBottom - PIPE_END_CAP_HEIGHT, PIPE_WIDTH, PIPE_END_CAP_HEIGHT)

    // BOTTOM PIPE (from floor up)
    ctx.drawImage(img, pipe.x, pipe.bottomPipeTop || 0, PIPE_WIDTH, 320)
  }

  // Draw floating YES/NO labels for question pipes
  const drawSlotLabels = (ctx: CanvasRenderingContext2D, pipe: Pipe) => {
    if (pipe.type !== "question") return

    ctx.save()
    ctx.globalAlpha = 0.7
    ctx.font = "bold 24px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    // YES label (top slot)
    const yesY = ((pipe.topPipeBottom || 0) + (pipe.middlePipeTop || 0)) / 2
    ctx.fillStyle = "rgba(34, 197, 94, 0.9)"
    ctx.fillText("YES", pipe.x + PIPE_WIDTH / 2, yesY)

    // NO label (bottom slot)
    const noY = ((pipe.middlePipeBottom || 0) + (pipe.bottomPipeTop || 0)) / 2
    ctx.fillStyle = "rgba(239, 68, 68, 0.9)"
    ctx.fillText("NO", pipe.x + PIPE_WIDTH / 2, noY)

    ctx.restore()
  }

  // Draw bird
  const drawBird = (ctx: CanvasRenderingContext2D, bird: Bird, isDead: boolean = false) => {
    const sprite = birdSprites.current[bird.frame]
    if (!sprite) return

    ctx.save()
    ctx.translate(50 + BIRD_WIDTH / 2, bird.y + BIRD_HEIGHT / 2)
    
    if (isDead) {
      // Dead bird rotates more
      ctx.rotate(Math.PI / 2)
    } else {
      ctx.rotate(Math.min(Math.PI / 4, Math.max(-Math.PI / 4, bird.velocity * 0.08)))
    }
    
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)"
    ctx.shadowBlur = 6
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 3
    
    ctx.drawImage(sprite, -BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT)
    ctx.restore()
  }

  // Draw score
  const drawScore = (ctx: CanvasRenderingContext2D, score: number) => {
    ctx.save()
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
    ctx.beginPath()
    ctx.roundRect(CANVAS_WIDTH - 50, 8, 42, 26, 13)
    ctx.fill()
    
    ctx.fillStyle = "#fff"
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.fillText(score.toString(), CANVAS_WIDTH - 29, 26)
    ctx.restore()
  }

  // Draw question preview progress bar
  const drawQuestionPreviewProgress = (ctx: CanvasRenderingContext2D, progress: number) => {
    const barWidth = 200
    const barHeight = 8
    const barX = (CANVAS_WIDTH - barWidth) / 2
    const barY = 45

    ctx.save()
    
    // Background bar
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)"
    ctx.beginPath()
    ctx.roundRect(barX, barY, barWidth, barHeight, 4)
    ctx.fill()
    
    // Progress fill (green gradient)
    const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * progress, barY)
    gradient.addColorStop(0, "#22c55e")
    gradient.addColorStop(1, "#16a34a")
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 4)
    ctx.fill()
    
    // Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(barX, barY, barWidth, barHeight, 4)
    ctx.stroke()
    
    // "GET READY!" text
    ctx.fillStyle = "#fff"
    ctx.font = "bold 14px Arial"
    ctx.textAlign = "center"
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)"
    ctx.shadowBlur = 4
    ctx.fillText("GET READY!", CANVAS_WIDTH / 2, barY - 8)
    
    ctx.restore()
  }

  // Draw "Tap to Start" overlay for ready_to_play phase
  const drawReadyToPlay = (ctx: CanvasRenderingContext2D) => {
    ctx.save()
    
    // Pulsing "Tap to Start" text
    const pulse = Math.sin(Date.now() / 300) * 0.15 + 0.85
    
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`
    ctx.font = "bold 20px Arial"
    ctx.textAlign = "center"
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)"
    ctx.shadowBlur = 6
    ctx.fillText("TAP TO START", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80)
    
    // Small instruction text
    ctx.font = "14px Arial"
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.shadowBlur = 4
    ctx.fillText("Tap or press Space to fly", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 105)
    
    ctx.restore()
  }

  // Draw auto-fly reading progress
  const drawAutoFlyProgress = (ctx: CanvasRenderingContext2D, progress: number) => {
    const barWidth = 180
    const barHeight = 6
    const barX = (CANVAS_WIDTH - barWidth) / 2
    const barY = 50

    ctx.save()
    
    // "READ THE QUESTION" text
    ctx.fillStyle = "#fff"
    ctx.font = "bold 12px Arial"
    ctx.textAlign = "center"
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)"
    ctx.shadowBlur = 4
    ctx.fillText("📖 READ THE QUESTION", CANVAS_WIDTH / 2, barY - 10)
    
    // Background bar
    ctx.shadowBlur = 0
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)"
    ctx.beginPath()
    ctx.roundRect(barX, barY, barWidth, barHeight, 3)
    ctx.fill()
    
    // Progress fill (blue gradient for reading)
    const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * progress, barY)
    gradient.addColorStop(0, "#60a5fa")
    gradient.addColorStop(1, "#3b82f6")
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 3)
    ctx.fill()
    
    // Remaining time indicator
    const remainingSeconds = Math.ceil((1 - progress) * (AUTO_FLY_TIME / 1000))
    if (remainingSeconds > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)"
      ctx.font = "11px Arial"
      ctx.fillText(`Controls in ${remainingSeconds}s...`, CANVAS_WIDTH / 2, barY + 20)
    }
    
    ctx.restore()
  }

  // Draw game over
  const drawGameOver = (ctx: CanvasRenderingContext2D) => {
    ctx.save()
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.fillStyle = "#fff"
    ctx.font = "bold 32px Arial"
    ctx.textAlign = "center"
    ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20)

    ctx.font = "18px Arial"
    ctx.fillText("Tap to continue", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20)
    ctx.restore()
  }

  // Draw chapter complete
  const drawChapterComplete = (
    ctx: CanvasRenderingContext2D,
    chapter: Chapter,
    chapterScore: { correct: number; total: number },
    progress: number
  ) => {
    const scrollHeight = 200
    const scrollY = (CANVAS_HEIGHT - scrollHeight) / 2
    drawParchment(ctx, SCROLL_MARGIN, scrollY, SCROLL_WIDTH, scrollHeight, progress)

    if (progress < 0.3) return

    const textAlpha = Math.min(1, (progress - 0.3) / 0.3)
    ctx.save()
    ctx.globalAlpha = textAlpha
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = "center"
    const centerX = CANVAS_WIDTH / 2

    ctx.font = "bold 14px Georgia, serif"
    ctx.fillText(`CHAPTER ${chapter.number} COMPLETE`, centerX, scrollY + 45)

    ctx.strokeStyle = PARCHMENT_BORDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX - 70, scrollY + 55)
    ctx.lineTo(centerX + 70, scrollY + 55)
    ctx.stroke()

    ctx.font = "16px Georgia, serif"
    ctx.fillText(`${chapter.title} ${chapter.subtitle}`, centerX, scrollY + 80)

    ctx.font = "bold 24px Georgia, serif"
    ctx.fillText(`${chapterScore.correct}/${chapterScore.total}`, centerX, scrollY + 115)
    ctx.font = "14px Georgia, serif"
    ctx.fillText("correct", centerX, scrollY + 135)

    ctx.font = "italic 14px Georgia, serif"
    ctx.fillText("Tap to continue", centerX, scrollY + 170)

    ctx.restore()
  }

  // Draw game complete
  const drawGameComplete = (
    ctx: CanvasRenderingContext2D,
    chaptersData: Chapter[],
    score: GameScore,
    progress: number
  ) => {
    const scrollHeight = 320
    const scrollY = (CANVAS_HEIGHT - scrollHeight) / 2
    drawParchment(ctx, SCROLL_MARGIN, scrollY, SCROLL_WIDTH, scrollHeight, progress)

    if (progress < 0.3) return

    const textAlpha = Math.min(1, (progress - 0.3) / 0.3)
    ctx.save()
    ctx.globalAlpha = textAlpha
    ctx.fillStyle = TEXT_COLOR
    ctx.textAlign = "center"
    const centerX = CANVAS_WIDTH / 2

    ctx.font = "bold 16px Georgia, serif"
    ctx.fillText("QUIZ COMPLETE!", centerX, scrollY + 35)

    ctx.strokeStyle = PARCHMENT_BORDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX - 70, scrollY + 45)
    ctx.lineTo(centerX + 70, scrollY + 45)
    ctx.stroke()

    ctx.font = "bold 28px Georgia, serif"
    ctx.fillText(`${score.totalCorrect} / ${score.totalQuestions}`, centerX, scrollY + 80)
    ctx.font = "14px Georgia, serif"
    ctx.fillText("correct", centerX, scrollY + 100)

    const percentage = Math.round((score.totalCorrect / score.totalQuestions) * 100)
    ctx.font = "16px Georgia, serif"
    ctx.fillText(`You scored ${percentage}%!`, centerX, scrollY + 130)

    ctx.font = "bold 12px Georgia, serif"
    ctx.fillText("Chapter Breakdown:", centerX, scrollY + 160)

    ctx.font = "13px Georgia, serif"
    let yPos = scrollY + 180
    chaptersData.forEach((chapter, i) => {
      const cs = score.chapterScores[i]
      ctx.fillText(`${chapter.title}: ${cs.correct}/${cs.total}`, centerX, yPos)
      yPos += 18
    })

    ctx.font = "italic 12px Georgia, serif"
    ctx.fillText("You're ready to vote!", centerX, scrollY + 270)

    ctx.font = "12px Georgia, serif"
    ctx.fillStyle = PARCHMENT_BORDER
    ctx.fillText("Tap to play again", centerX, scrollY + 295)

    ctx.restore()
  }

  // Create a normal pipe
  const createNormalPipe = (): Pipe => {
    const minGapTop = PIPE_AREA_TOP
    const maxGapTop = PIPE_AREA_BOTTOM - PIPE_GAP_NORMAL
    const gapTop = minGapTop + Math.random() * (maxGapTop - minGapTop)
    
    return {
      x: PIPE_SPAWN_X,
      type: "normal",
      gapTop: gapTop,
      gapBottom: gapTop + PIPE_GAP_NORMAL,
      passed: false,
      scored: false
    }
  }

  // Create a question pipe
  const createQuestionPipe = (): Pipe => {
    const pipeHeight = PIPE_AREA_BOTTOM - PIPE_AREA_TOP
    const totalNeeded = SLOT_HEIGHT * 2 + MIDDLE_PIPE_HEIGHT
    const topOffset = PIPE_AREA_TOP + (pipeHeight - totalNeeded) / 2

    return {
      x: PIPE_SPAWN_X,
      type: "question",
      topPipeBottom: topOffset,
      middlePipeTop: topOffset + SLOT_HEIGHT,
      middlePipeBottom: topOffset + SLOT_HEIGHT + MIDDLE_PIPE_HEIGHT,
      bottomPipeTop: topOffset + SLOT_HEIGHT * 2 + MIDDLE_PIPE_HEIGHT,
      passed: false,
      scored: false,
      questionAnswered: false
    }
  }

  // Check collision with a pipe
  const checkCollision = (bird: Bird, pipe: Pipe): boolean => {
    const birdLeft = 50
    const birdRight = 50 + BIRD_WIDTH
    const birdTop = bird.y
    const birdBottom = bird.y + BIRD_HEIGHT

    if (birdRight < pipe.x || birdLeft > pipe.x + PIPE_WIDTH) {
      return false
    }

    if (pipe.type === "normal") {
      // Hit top or bottom pipe
      if (birdTop < (pipe.gapTop || 0) || birdBottom > (pipe.gapBottom || 0)) {
        return true
      }
    } else if (pipe.type === "question") {
      // Hit top pipe
      if (birdTop < (pipe.topPipeBottom || 0)) return true
      // Hit middle pipe
      if (birdTop < (pipe.middlePipeBottom || 0) && birdBottom > (pipe.middlePipeTop || 0)) return true
      // Hit bottom pipe
      if (birdBottom > (pipe.bottomPipeTop || 0)) return true
    }

    return false
  }

  // Main game loop
  useEffect(() => {
    if (!assetsLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d", { alpha: false, desynchronized: true })
    if (!canvas || !ctx) return

    let animationFrameId: number

    const gameLoop = (currentTime: number) => {
      const state = gameStateRef.current

      // Delta time
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = currentTime
      }
      let deltaTime = (currentTime - lastFrameTimeRef.current) / (1000 / TARGET_FPS)
      deltaTime = Math.min(deltaTime, MAX_DELTA_TIME)
      lastFrameTimeRef.current = currentTime

      const elapsed = currentTime - state.phaseStartTime

      // Clear canvas
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw background
      if (backgroundImage.current) {
        const img = backgroundImage.current
        const imgRatio = img.width / img.height
        const canvasRatio = CANVAS_WIDTH / CANVAS_HEIGHT
        let drawWidth, drawHeight, drawX, drawY
        if (imgRatio > canvasRatio) {
          drawHeight = CANVAS_HEIGHT
          drawWidth = img.width * (CANVAS_HEIGHT / img.height)
          drawX = (CANVAS_WIDTH - drawWidth) / 2
          drawY = 0
        } else {
          drawWidth = CANVAS_WIDTH
          drawHeight = img.height * (CANVAS_WIDTH / img.width)
          drawX = 0
          drawY = (CANVAS_HEIGHT - drawHeight) / 2
        }
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      }

      const currentChapter = chapters[state.chapterIndex]
      const currentQuestion = currentChapter?.questions[state.questionIndex]

      switch (state.phase) {
        case "chapter_intro": {
          state.scrollProgress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION)
          drawChapterIntro(ctx, currentChapter, state.scrollProgress)

          if (elapsed > CHAPTER_INTRO_TIME) {
            state.phase = "ready_to_play"
            state.phaseStartTime = currentTime
            state.scrollProgress = 0
            state.bird.y = (PIPE_AREA_TOP + PIPE_AREA_BOTTOM) / 2
            state.bird.velocity = 0
            state.pipes = []
            state.pipesSinceLastQuestion = NORMAL_PIPES_BETWEEN_QUESTIONS // Start with a question
            state.currentQuestionActive = false
          }
          break
        }

        case "ready_to_play": {
          // Bird hovers with gentle bobbing animation, no gravity yet
          const bobOffset = Math.sin(currentTime / 300) * 3
          state.bird.y = (PIPE_AREA_TOP + PIPE_AREA_BOTTOM) / 2 + bobOffset
          
          // Animate bird wings
          state.frameCount++
          if (state.frameCount % 8 === 0) {
            state.bird.frame = (state.bird.frame + 1) % 3
          }

          // Draw background is already done above
          drawBird(ctx, state.bird)
          drawScore(ctx, state.displayScore)
          drawReadyToPlay(ctx)
          break
        }

        case "auto_fly": {
          // Calculate progress
          const autoFlyProgress = Math.min(1, elapsed / AUTO_FLY_TIME)
          state.scrollProgress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION)
          
          // Bird flies automatically with a smooth sine wave pattern
          const centerY = (PIPE_AREA_TOP + PIPE_AREA_BOTTOM) / 2
          const flyAmplitude = 40 // How far up/down the bird moves
          const flySpeed = 0.003 // Speed of the sine wave
          state.bird.y = centerY + Math.sin(currentTime * flySpeed) * flyAmplitude
          
          // Animate bird wings faster when "flying"
          state.frameCount++
          if (state.frameCount % 5 === 0) {
            state.bird.frame = (state.bird.frame + 1) % 3
          }

          // Draw the question scroll
          if (currentQuestion) {
            drawQuestionScrollBottom(ctx, currentQuestion, state.scrollProgress)
          }

          drawBird(ctx, state.bird)
          drawScore(ctx, state.displayScore)
          drawAutoFlyProgress(ctx, autoFlyProgress)

          // When auto-fly is complete, spawn question pipe and give user control
          if (autoFlyProgress >= 1) {
            state.pipes.push(createQuestionPipe())
            state.phase = "playing"
            state.phaseStartTime = currentTime
            state.bird.velocity = 0 // Reset velocity for smooth transition
          }
          break
        }

        case "playing": {
          state.scrollProgress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION)

          // Update bird physics
          state.bird.velocity += GRAVITY * deltaTime
          state.bird.y += state.bird.velocity * deltaTime

          // Check boundaries
          if (state.bird.y < PLAY_AREA_TOP || state.bird.y + BIRD_HEIGHT > PLAY_AREA_BOTTOM) {
            state.phase = "game_over"
            state.phaseStartTime = currentTime
            playSound("hit")
            break
          }

          // Animate bird
          state.frameCount++
          if (state.frameCount % 6 === 0) {
            state.bird.frame = (state.bird.frame + 1) % 3
          }

          // Check if it's time for a question
          const hasQuestionPipeOnScreen = state.pipes.some(p => p.type === "question" && !p.passed)
          
          if (state.pipesSinceLastQuestion >= NORMAL_PIPES_BETWEEN_QUESTIONS && 
              !hasQuestionPipeOnScreen && 
              state.questionIndex < currentChapter.questions.length) {
            // Transition to question preview phase
            state.phase = "question_preview"
            state.phaseStartTime = currentTime
            state.questionPreviewProgress = 0
            state.currentQuestionActive = true
            state.scrollProgress = 0
            break
          }

          // Spawn new normal pipes
          const lastPipe = state.pipes[state.pipes.length - 1]
          const shouldSpawnPipe = !lastPipe || lastPipe.x < CANVAS_WIDTH - 180

          if (shouldSpawnPipe && !hasQuestionPipeOnScreen) {
            state.pipes.push(createNormalPipe())
          }

          // Update pipes
          for (const pipe of state.pipes) {
            pipe.x -= PIPE_SPEED * deltaTime

            // Check collision
            if (checkCollision(state.bird, pipe)) {
              state.phase = "game_over"
              state.phaseStartTime = currentTime
              playSound("hit")
              break
            }

            // Check if bird passed the pipe
            const birdLeft = 50
            if (!pipe.passed && pipe.x + PIPE_WIDTH < birdLeft) {
              pipe.passed = true

              if (pipe.type === "normal") {
                // Score point for passing normal pipe
                if (!pipe.scored) {
                  pipe.scored = true
                  state.displayScore += 1
                  state.pipesSinceLastQuestion += 1
                  playSound("point")
                }
              } else if (pipe.type === "question") {
                // Question was answered (or missed)
                state.pipesSinceLastQuestion = 0
                state.currentQuestionActive = false
                
                // Move to next question
                if (state.questionIndex < currentChapter.questions.length - 1) {
                  state.questionIndex++
                } else {
                  // Chapter complete
                  state.phase = "chapter_complete"
                  state.phaseStartTime = currentTime
                  state.scrollProgress = 0
                  break
                }
              }
            }

            // Check answer selection for question pipes
            if (pipe.type === "question" && !pipe.questionAnswered) {
              const birdCenterY = state.bird.y + BIRD_HEIGHT / 2
              const birdRight = 50 + BIRD_WIDTH

              if (birdRight > pipe.x && 50 < pipe.x + PIPE_WIDTH) {
                // Bird is passing through the pipe area
                const inYesSlot = state.bird.y > (pipe.topPipeBottom || 0) && 
                                  state.bird.y + BIRD_HEIGHT < (pipe.middlePipeTop || 0)
                const inNoSlot = state.bird.y > (pipe.middlePipeBottom || 0) && 
                                 state.bird.y + BIRD_HEIGHT < (pipe.bottomPipeTop || 0)

                if (inYesSlot || inNoSlot) {
                  pipe.questionAnswered = true
                  const selectedYes = inYesSlot
                  const correct = currentQuestion.answer === selectedYes

                  if (correct) {
                    state.score.chapterScores[state.chapterIndex].correct += 1
                    state.score.totalCorrect += 1
                    state.displayScore += 5 // Bonus for correct answer
                    playSound("point")
                  } else {
                    state.displayScore = Math.max(0, state.displayScore - 2)
                    // Don't play hit sound here - save it for collision
                  }
                }
              }
            }
          }

          // Remove off-screen pipes
          state.pipes = state.pipes.filter(p => p.x + PIPE_WIDTH > -50)

          // Draw pipes (labels behind, pipes in front)
          for (const pipe of state.pipes) {
            if (pipe.type === "question") {
              drawSlotLabels(ctx, pipe)
            }
          }
          for (const pipe of state.pipes) {
            if (pipe.type === "normal") {
              drawNormalPipe(ctx, pipe)
            } else {
              drawQuestionPipe(ctx, pipe)
            }
          }

          // Draw question scroll only when question pipe is active
          if (state.currentQuestionActive && currentQuestion) {
            drawQuestionScrollBottom(ctx, currentQuestion, state.scrollProgress)
          }

          drawBird(ctx, state.bird)
          drawScore(ctx, state.displayScore)
          break
        }

        case "question_preview": {
          // Update preview progress
          state.questionPreviewProgress = Math.min(1, elapsed / QUESTION_PREVIEW_TIME)
          state.scrollProgress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION)

          // Update bird physics (player can still control bird)
          state.bird.velocity += GRAVITY * deltaTime
          state.bird.y += state.bird.velocity * deltaTime

          // Check boundaries
          if (state.bird.y < PLAY_AREA_TOP || state.bird.y + BIRD_HEIGHT > PLAY_AREA_BOTTOM) {
            state.phase = "game_over"
            state.phaseStartTime = currentTime
            playSound("hit")
            break
          }

          // Animate bird
          state.frameCount++
          if (state.frameCount % 6 === 0) {
            state.bird.frame = (state.bird.frame + 1) % 3
          }

          // Move existing pipes (no new pipes spawn during preview)
          for (const pipe of state.pipes) {
            pipe.x -= PIPE_SPEED * deltaTime

            // Check collision with existing pipes
            if (checkCollision(state.bird, pipe)) {
              state.phase = "game_over"
              state.phaseStartTime = currentTime
              playSound("hit")
              break
            }

            // Check if bird passed a normal pipe
            if (pipe.type === "normal" && !pipe.passed && pipe.x + PIPE_WIDTH < 50) {
              pipe.passed = true
              if (!pipe.scored) {
                pipe.scored = true
                state.displayScore += 1
                state.pipesSinceLastQuestion += 1
                playSound("point")
              }
            }
          }

          // Remove off-screen pipes
          state.pipes = state.pipes.filter(p => p.x + PIPE_WIDTH > -50)

          // Draw existing pipes
          for (const pipe of state.pipes) {
            if (pipe.type === "normal") {
              drawNormalPipe(ctx, pipe)
            }
          }

          // Draw question scroll
          if (currentQuestion) {
            drawQuestionScrollBottom(ctx, currentQuestion, state.scrollProgress)
          }

          // Draw progress bar
          drawQuestionPreviewProgress(ctx, state.questionPreviewProgress)

          drawBird(ctx, state.bird)
          drawScore(ctx, state.displayScore)

          // When preview is complete, spawn question pipe and return to playing
          if (state.questionPreviewProgress >= 1) {
            state.pipes.push(createQuestionPipe())
            state.phase = "playing"
            state.phaseStartTime = currentTime
            state.scrollProgress = 1 // Keep scroll visible
          }
          break
        }

        case "game_over": {
          // Draw everything frozen
          for (const pipe of state.pipes) {
            if (pipe.type === "question") {
              drawSlotLabels(ctx, pipe)
            }
          }
          for (const pipe of state.pipes) {
            if (pipe.type === "normal") {
              drawNormalPipe(ctx, pipe)
            } else {
              drawQuestionPipe(ctx, pipe)
            }
          }
          
          // Bird falls
          state.bird.velocity += GRAVITY * deltaTime * 0.5
          state.bird.y = Math.min(PLAY_AREA_BOTTOM - BIRD_HEIGHT, state.bird.y + state.bird.velocity * deltaTime)

          drawBird(ctx, state.bird, true)
          drawScore(ctx, state.displayScore)
          drawGameOver(ctx)
          break
        }

        case "chapter_complete": {
          state.scrollProgress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION)
          
          drawChapterComplete(
            ctx,
            currentChapter,
            state.score.chapterScores[state.chapterIndex],
            state.scrollProgress
          )
          break
        }

        case "game_complete": {
          state.scrollProgress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION)
          drawGameComplete(ctx, chapters, state.score, state.scrollProgress)
          break
        }
      }

      animationFrameId = requestAnimationFrame(gameLoop)
    }

    animationFrameId = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animationFrameId)
  }, [assetsLoaded, chapters, playSound])

  // Handle keyboard
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault()
        handleCanvasClick()
      }
    }
    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [])

  // Handle click/tap
  const handleCanvasClick = useCallback(() => {
    const state = gameStateRef.current

    if (state.phase === "ready_to_play") {
      // Initialize AudioContext on first interaction
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioContextRef.current = new AudioContextClass()
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume()
      }
      // Start auto-fly phase where bird flies on its own
      state.phase = "auto_fly"
      state.phaseStartTime = performance.now()
      state.scrollProgress = 0
      state.currentQuestionActive = true
      playSound("wing")
    } else if (state.phase === "game_over") {
      // Continue after game over - resume from current position
      state.phase = "playing"
      state.phaseStartTime = performance.now()
      state.bird.y = (PIPE_AREA_TOP + PIPE_AREA_BOTTOM) / 2
      state.bird.velocity = 0
      // Keep pipes but give player some space
      state.pipes = state.pipes.filter(p => p.x > 100)
    } else if (state.phase === "chapter_complete") {
      // Move to next chapter or game complete
      if (state.chapterIndex < chapters.length - 1) {
        state.chapterIndex++
        state.questionIndex = 0
        state.phase = "chapter_intro"
        state.phaseStartTime = performance.now()
        state.scrollProgress = 0
        state.pipes = []
        state.pipesSinceLastQuestion = NORMAL_PIPES_BETWEEN_QUESTIONS
        state.currentQuestionActive = false
      } else {
        state.phase = "game_complete"
        state.phaseStartTime = performance.now()
        state.scrollProgress = 0
      }
    } else if (state.phase === "game_complete") {
      // Restart game
      gameStateRef.current = {
        phase: "chapter_intro",
        bird: { y: (PIPE_AREA_TOP + PIPE_AREA_BOTTOM) / 2, velocity: 0, frame: 0 },
        pipes: [],
        chapterIndex: 0,
        questionIndex: 0,
        score: createInitialScore(chapters),
        displayScore: 0,
        pipesSinceLastQuestion: NORMAL_PIPES_BETWEEN_QUESTIONS,
        currentQuestionActive: false,
        scrollProgress: 0,
        phaseStartTime: performance.now(),
        frameCount: 0,
        questionPreviewProgress: 0
      }
    } else {
      jump()
    }
  }, [jump, chapters, playSound])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    handleCanvasClick()
  }, [handleCanvasClick])

  if (loadingError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center p-4 max-w-md">
          <div className="text-2xl font-bold mb-4 text-red-600">Loading Error</div>
          <div className="text-gray-700 mb-4">{loadingError}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 overflow-hidden">
      {!assetsLoaded && (
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">Loading Quiz...</div>
          <div className="animate-pulse text-gray-600">Please wait</div>
        </div>
      )}
      {assetsLoaded && (
        <>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-gray-300 touch-none md:border"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              imageRendering: "pixelated",
            }}
            onClick={handleCanvasClick}
            onTouchStart={handleTouchStart}
          />
          <p className="hidden md:block mt-4 text-lg text-center px-4">
            Tap or press Space to fly - avoid pipes and answer questions!
          </p>
        </>
      )}
    </div>
  )
}
