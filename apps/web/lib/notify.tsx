"use client";

import { toast } from "sonner";

const SUCCESS_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;

export type NotifySuccessOptions = {
  description?: string;
  duration?: number;
};

export type NotifyErrorOptions = NotifySuccessOptions & {
  /** Mono caps text shown above the description. Defaults to "ERROR". */
  eyebrow?: string;
};

export const notify = {
  success(title: string, options?: NotifySuccessOptions): void {
    toast(title, {
      description: options?.description,
      duration: options?.duration ?? SUCCESS_DURATION_MS,
    });
  },

  error(title: string, options?: NotifyErrorOptions): void {
    const eyebrow = options?.eyebrow ?? "ERROR";
    toast(title, {
      description: (
        <span className="block">
          <span className="block font-mono text-xs uppercase tracking-[0.14em] text-ink-mute">
            {eyebrow}
          </span>
          {options?.description && (
            <span className="mt-1 block line-clamp-1">
              {options.description}
            </span>
          )}
        </span>
      ),
      duration: options?.duration ?? ERROR_DURATION_MS,
    });
  },
};
