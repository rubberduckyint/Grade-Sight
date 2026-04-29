// TODO: move behind dev-only flag before production
"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Step 02 verification mount. Throwaway route — delete or gate behind a
// dev flag once the editorial system is fully shipped.
export default function PrimitivesPage() {
  return (
    <main className="min-h-screen bg-paper px-12 py-16 text-ink">
      <div className="mx-auto max-w-[1000px]">
        <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
          Step 02 · audit
        </div>
        <h1 className="mt-2 font-serif text-3xl tracking-tight">
          Primitives — paper/ink palette
        </h1>
        <p className="mt-3 max-w-[640px] text-ink-soft">
          One of each shadcn primitive after Step 02 cleanup. All radii are
          the radius-sm token, all chrome is hairline rule on paper, no drop
          shadows, no shadcn aliases.
        </p>

        <Section label="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section label="Card">
          <Card className="max-w-[480px]">
            <CardHeader>
              <CardTitle>Diagnostic insight</CardTitle>
              <CardDescription>
                Description renders in ink-soft.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Card body text renders at base size in ink. No shadow on the
                card, hairline border in rule.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="secondary">Action</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section label="Alert">
          <div className="space-y-3">
            <Alert>
              <AlertTitle>Default alert</AlertTitle>
              <AlertDescription>
                Paper-soft background, hairline rule border, ink text.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Destructive alert</AlertTitle>
              <AlertDescription>
                Same chrome — only the text renders in mark color.
              </AlertDescription>
            </Alert>
          </div>
        </Section>

        <Section label="Avatar">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" alt="" />
              <AvatarFallback>DJ</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>NS</AvatarFallback>
            </Avatar>
          </div>
        </Section>

        <Section label="Badge">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section label="Skeleton">
          <div className="space-y-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
        </Section>

        <Section label="Separator">
          <div>Above the separator.</div>
          <Separator className="my-3" />
          <div>Below the separator.</div>
        </Section>

        <Section label="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm intervention</DialogTitle>
                <DialogDescription>
                  Description in ink-soft. Backdrop is ink/40, not black/80.
                </DialogDescription>
              </DialogHeader>
              <p>Body content sits inside the dialog.</p>
              <DialogFooter>
                <Button variant="secondary">Cancel</Button>
                <Button>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section label="DropdownMenu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Open menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Menu label</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Item one</DropdownMenuItem>
              <DropdownMenuItem>Item two</DropdownMenuItem>
              <DropdownMenuItem>Item three</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section label="Sonner (toast)">
          <Button
            onClick={() =>
              toast("Toast triggered", {
                description: "Themed via app/layout.tsx toastOptions.",
              })
            }
          >
            Trigger toast
          </Button>
        </Section>
      </div>
    </main>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
