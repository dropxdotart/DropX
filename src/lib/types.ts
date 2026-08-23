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

export type UserRole = 'user' | 'mod' | 'admin'

export type Profile = {
  id: string
  username: string | null
  current_streak: number
  longest_streak: number
  last_answered_date: string | null
  role: UserRole
  badges: string[]
  strike_count: number
}

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'role' | 'badges'>

export type Comment = {
  id: string
  user_id: string
  response_id: string
  body: string
  created_at: string
  profiles: PublicProfile
}

export type FeedItem = {
  id: string
  user_id: string
  answer: string
  is_correct: boolean
  answered_at: string
  profiles: PublicProfile
  challenges: Pick<Challenge, 'prompt' | 'type'>
  likeCount: number
  likedByMe: boolean
  comments: Comment[]
  authorFollowedByMe: boolean
}
