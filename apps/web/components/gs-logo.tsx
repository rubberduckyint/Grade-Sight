// Grade Sight logo: green ring with checkmark breaking through.
// Matches the spec in docs/design/Grade Sight Logo.html. Stroke uses
// currentColor so the logo inherits whatever text color is set on its
// parent — set via `text-green` in the standard usage.
//
// Note: the SVG <mask> uses a static id ("gs-logo-mask"). Single logo
// per page is the realistic pattern; if a future surface mounts two
// logos (split-pane experiments), regenerate with React's useId().

export function GSLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0 text-green"
    >
      <defs>
        <mask id="gs-logo-mask">
          <rect width="32" height="32" fill="white" />
          <path
            d="M 7 17 Q 11 20 14 23 Q 18 17 26 5"
            stroke="black"
            strokeWidth="6.5"
            strokeLinecap="round"
            fill="none"
          />
        </mask>
      </defs>
      <g mask="url(#gs-logo-mask)">
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
        />
      </g>
      <path
        d="M 7 17 Q 11 20 14 23 Q 18 17 26 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
