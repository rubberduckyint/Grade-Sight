"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddKeyDialog } from "./add-key-dialog";

export function AddKeyButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add answer key</Button>
      <AddKeyDialog
        open={open}
        onOpenChange={setOpen}
        onAfterCreate={() => router.refresh()}
      />
    </>
  );
}
