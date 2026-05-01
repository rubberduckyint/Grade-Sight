import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));

describe("AppShell", () => {
  it("renders a skip-to-content link with href #main", () => {
    render(
      <AppShell userId="u-1" organizationId="o-1">
        <div>content</div>
      </AppShell>,
    );
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main");
  });

  it("wraps children in <main id='main'>", () => {
    render(
      <AppShell userId="u-1" organizationId="o-1">
        <div data-testid="child">content</div>
      </AppShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toContainElement(screen.getByTestId("child"));
  });
});
