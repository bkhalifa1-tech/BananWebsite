export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Annotation = {
  id: string;
  page: number;
  kind: "highlight" | "underline" | "bookmark" | "comment" | "drawing";
  text: string;
  comment: string;
  color: string;
  rects: Rect[];
  points: Point[];
};
export type Vocabulary = {
  id: string;
  word: string;
  meaning: string;
  example: string;
  pronunciation: string;
  source: string;
  card_id: string | null;
};
