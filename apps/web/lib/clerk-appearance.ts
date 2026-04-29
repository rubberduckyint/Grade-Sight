// Values mirror @theme tokens in globals.css. Update both files together
// if the palette changes — Clerk's appearance.variables API requires
// literal CSS color values, not CSS custom property references, so we
// can't share the source of truth.
import type { Appearance } from "@clerk/types";

export const gradeSightClerk: Appearance = {
  variables: {
    colorPrimary:        "oklch(0.22 0.015 75)",   // ink
    colorText:           "oklch(0.22 0.015 75)",
    colorTextSecondary:  "oklch(0.42 0.015 75)",   // ink-soft
    colorBackground:     "oklch(0.985 0.006 82)",  // paper
    colorInputBackground:"oklch(0.985 0.006 82)",
    colorInputText:      "oklch(0.22 0.015 75)",
    colorDanger:         "oklch(0.56 0.15 28)",    // mark — validation only
    colorSuccess:        "oklch(0.42 0.09 252)",   // accent
    fontFamily:          "Inter, system-ui, sans-serif",
    fontFamilyButtons:   "Inter, system-ui, sans-serif",
    fontSize:            "1rem",
    borderRadius:        "3px",
  },
  elements: {
    card: "shadow-none border border-[oklch(0.88_0.012_82)] bg-[oklch(0.985_0.006_82)]",
    headerTitle: "font-[var(--font-serif)] text-[1.556rem] font-medium tracking-tight",
    headerSubtitle: "text-[oklch(0.42_0.015_75)]",
    formButtonPrimary:
      "bg-[oklch(0.22_0.015_75)] hover:bg-black text-[oklch(0.985_0.006_82)] rounded-[3px] font-medium text-base normal-case",
    formFieldInput:
      "border border-[oklch(0.88_0.012_82)] rounded-[3px] text-base focus-visible:outline-2 focus-visible:outline-[oklch(0.42_0.09_252)]",
    footerActionLink: "text-[oklch(0.42_0.09_252)] hover:underline",
    socialButtonsBlockButton:
      "border border-[oklch(0.88_0.012_82)] rounded-[3px] text-base hover:bg-[oklch(0.965_0.008_82)]",
    dividerLine: "bg-[oklch(0.92_0.010_82)]",
    dividerText: "text-[oklch(0.58_0.012_75)] uppercase tracking-[0.12em] text-xs font-[var(--font-mono)]",
  },
};
