"use client";

import Image from "next/image";
import { ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import type { Task, User } from "@/lib/types";

export function ImageAttachmentUploader({
  task,
  currentUser,
  allowed,
  onTaskUpdated,
}: {
  task: Task;
  currentUser: User;
  allowed: boolean;
  onTaskUpdated: (task: Task) => void;
}) {
  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const updated = task.imageUrl
        ? await api.replaceTaskImage(currentUser, task.id, file)
        : await api.uploadTaskImage(currentUser, task.id, file);
      onTaskUpdated(updated);
      toast.success("Image attachment updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload image.");
    }
  }

  async function deleteImage() {
    try {
      const updated = await api.deleteTaskImage(currentUser, task.id);
      onTaskUpdated(updated);
      toast.success("Image attachment deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete image.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Attachment</h4>
        {allowed ? (
          <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted">
            <UploadCloud className="h-4 w-4" />
            {task.imageUrl ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        ) : null}
      </div>
      {task.imageUrl ? (
        <div className="overflow-hidden rounded-lg border bg-slate-50">
          <div className="relative h-48 w-full">
            <Image src={task.imageUrl} alt={task.title} fill className="object-cover" unoptimized />
          </div>
          {allowed ? (
            <div className="flex justify-end border-t bg-white p-2">
              <ConfirmDelete
                title="Delete image?"
                description="This removes the attachment from the task."
                onConfirm={() => void deleteImage()}
              >
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-4 w-4" />
                  Delete image
                </Button>
              </ConfirmDelete>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
          No image attachment
        </div>
      )}
    </div>
  );
}
