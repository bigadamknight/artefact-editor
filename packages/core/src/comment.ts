export type CommentStatus = "pending" | "applied" | "dismissed";

export interface Comment {
  id: string;
  blockId: string;
  text: string;
  createdAt: string;
  status: CommentStatus;
}
