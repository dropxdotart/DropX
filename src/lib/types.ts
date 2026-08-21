export type ChallengeType = 'multiple_choice' | 'text'

export type Challenge = {
  id: string
  drop_at: string
  type: ChallengeType
  prompt: string
  choices: string[] | null
  created_at: string
}

export type ChallengeWithAnswer = Challenge & {
  correct_answer: string
  explanation: string | null
}

export type Response = {
  id: string
  user_id: string
  challenge_id: string
  answer: string
  is_correct: boolean
  answered_at: string
}

export type Profile = {
  id: string
  username: string | null
  current_streak: number
  longest_streak: number
  last_answered_date: string | null
}
