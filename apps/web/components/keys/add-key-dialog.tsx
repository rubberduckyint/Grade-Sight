"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnswerKeyUploadForm } from "@/components/answer-key-upload-form";

export function AddKeyDialog({
  open,
  onOpenChange,
  onAfterCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add answer key</DialogTitle>
        </DialogHeader>
        <AnswerKeyUploadForm
          onSuccess={() => {
            onOpenChange(false);
            onAfterCreate();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
