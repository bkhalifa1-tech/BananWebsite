export type Deck = { id: string; name: string; count: number; due: number };
export type Flashcard = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  topic: string;
  source: string;
  version: number;
  next_review: string;
  interval_days: number;
  repetitions: number;
};
export type Quiz = { id: string; title: string; count: number };
export type Question = {
  id: string;
  kind:
    | "mcq"
    | "true_false"
    | "short_answer"
    | "fill_blank"
    | "matching"
    | "problem_solving";
  prompt: string;
  options: string[];
  correct_answer?: string;
  explanation?: string;
  topic: string;
  source: string;
  student_answer?: string;
  correct?: boolean;
};
export type Result = {
  score: number;
  total: number;
  seconds: number;
  results: Question[];
};
export type PracticeData = {
  decks: Deck[];
  quizzes: Quiz[];
  attempts: {
    id: string;
    quiz_id: string;
    title: string;
    score: number;
    total: number;
    finished_at: string;
  }[];
  mistakes: {
    id: string;
    prompt: string;
    student_answer: string;
    correct_answer: string;
    explanation: string;
    topic: string;
    source: string;
    created_at: string;
    resolved: number;
  }[];
};
