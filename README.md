# Ballot Quiz Game

An interactive Flappy Bird-style quiz game that helps voters learn about ballot measures and political issues in their area. Powered by AI with personalized learning through Hyperspell memory.

## Features

- **Personalized Quiz Generation**: Uses GPT-5.2 with web search to find real, current ballot measures based on your location and interests
- **Adaptive Learning**: Hyperspell memory layer tracks your performance and personalizes future quizzes
- **Flappy Bird Gameplay**: Fun, engaging way to learn about politics through true/false statements
- **Multiple Topics**: Housing, taxes, immigration, healthcare, and more

## Getting Started

### Prerequisites

- Node.js 18+
- OpenAI API key
- Hyperspell API key (optional, for personalization)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file with:

```env
# Required: OpenAI API Key for quiz generation
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Hyperspell Memory Layer for personalization
# Get your API key at https://app.hyperspell.com/api-keys
HYPERSPELL_API_KEY=your_hyperspell_api_key_here
```

### Running the App

```bash
npm run dev
```

## Hyperspell Integration

This app uses [Hyperspell](https://hyperspell.com) as a memory layer to provide personalized learning experiences:

### What it does:
- **Stores quiz results**: Each completed quiz is saved to the user's memory
- **Tracks performance by topic**: Identifies areas where users excel or struggle
- **Personalizes quiz generation**: Uses past performance to adjust difficulty and avoid repetition
- **Generates learning insights**: Creates recommendations based on user patterns

### How it works:

1. When a user starts a quiz, the API fetches personalization context from Hyperspell
2. This context is added to the LLM prompt to customize question difficulty and topics
3. After completing a quiz, results are saved to Hyperspell memory
4. Future quizzes use this history to provide increasingly personalized experiences

### API Endpoints

- `POST /api/generate-quiz` - Generates personalized quiz with Hyperspell context
- `POST /api/save-results` - Saves quiz results to Hyperspell memory

## Tech Stack

- **Next.js 14** - React framework
- **OpenAI GPT-5.2** - Quiz generation with web search
- **Hyperspell** - Memory layer for personalization
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety