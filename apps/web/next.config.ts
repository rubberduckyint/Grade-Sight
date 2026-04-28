import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // The org and project names are the Sentry-side identifiers. They are
  // hardcoded so a missing env var doesn't silently disable source-map
  // upload — when SENTRY_AUTH_TOKEN is unset, the wrapper logs a warning
  // and skips upload but the build still succeeds.
  org: process.env.SENTRY_ORG ?? "grade-sight",
  project: process.env.SENTRY_PROJECT ?? "grade-sight-web",
  silent: !process.env.CI,
  // Only upload source maps when the auth token is present (Railway/CI).
  // Local builds skip upload but still emit maps for in-browser debugging.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Delete source map files after upload so they aren't served to browsers.
  // `hideSourceMaps` was renamed to `sourcemaps.deleteSourcemapsAfterUpload`
  // in @sentry/nextjs v9 (SentryBuildOptions type no longer has the old key).
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  disableLogger: true,
});
