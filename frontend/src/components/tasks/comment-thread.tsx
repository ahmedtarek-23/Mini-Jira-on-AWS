"use client";

import { format } from "date-fns";
import { SendHorizonal } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/utils";
import type { TaskComment, User } from "@/lib/types";

export function CommentThread({
  taskId,
  currentUser,
  users,
}: {
  taskId: string;
  currentUser: User;
  users: User[];
}) {
  const [comments, setComments] = React.useState<TaskComment[]>([]);
  const [body, setBody] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api
      .listComments(currentUser, taskId)
      .then((items) => {
        if (isMounted) {
          setComments(items);
        }
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load comments."))
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [currentUser, taskId]);

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const comment = await api.createComment(currentUser, taskId, body.trim());
      setComments((items) => [...items, comment]);
      setBody("");
      toast.success("Comment added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add comment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Comments</h4>
      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : comments.length > 0 ? (
          comments.map((comment) => {
            const author = users.find((user) => user.id === comment.authorId);
            return (
              <article key={comment.id} className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-semibold">
                    {initials(author?.name ?? "U")}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{author?.name ?? "Unknown user"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(comment.createdAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
            No comments yet
          </div>
        )}
      </div>
      <form className="space-y-2" onSubmit={(event) => void submitComment(event)}>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment..."
          disabled={isSubmitting}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !body.trim()}>
            <SendHorizonal className="h-4 w-4" />
            {isSubmitting ? "Posting..." : "Comment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
