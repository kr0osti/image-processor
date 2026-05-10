import * as React from "react"
import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom"
import { Button } from "../../components/ui/button"

describe("Button component", () => {
  it("renders correctly with default props", () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole("button", { name: /click me/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass("bg-primary text-primary-foreground")
    expect(button).toHaveClass("h-10 px-4 py-2")
  })

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>)
    const button = screen.getByRole("button", { name: /delete/i })
    expect(button).toHaveClass("bg-destructive text-destructive-foreground")
  })

  it("renders with outline variant", () => {
    render(<Button variant="outline">Outline</Button>)
    const button = screen.getByRole("button", { name: /outline/i })
    expect(button).toHaveClass("border border-input bg-background")
  })

  it("renders with secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>)
    const button = screen.getByRole("button", { name: /secondary/i })
    expect(button).toHaveClass("bg-secondary text-secondary-foreground")
  })

  it("renders with ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>)
    const button = screen.getByRole("button", { name: /ghost/i })
    expect(button).toHaveClass("hover:bg-accent hover:text-accent-foreground")
  })

  it("renders with link variant", () => {
    render(<Button variant="link">Link</Button>)
    const button = screen.getByRole("button", { name: /link/i })
    expect(button).toHaveClass("text-primary underline-offset-4 hover:underline")
  })

  it("renders with small size", () => {
    render(<Button size="sm">Small</Button>)
    const button = screen.getByRole("button", { name: /small/i })
    expect(button).toHaveClass("h-9 rounded-md px-3")
  })

  it("renders with large size", () => {
    render(<Button size="lg">Large</Button>)
    const button = screen.getByRole("button", { name: /large/i })
    expect(button).toHaveClass("h-11 rounded-md px-8")
  })

  it("renders as an icon button", () => {
    render(<Button size="icon">Icon</Button>)
    const button = screen.getByRole("button", { name: /icon/i })
    expect(button).toHaveClass("h-10 w-10")
  })

  it("applies custom className", () => {
    render(<Button className="custom-class">Custom</Button>)
    const button = screen.getByRole("button", { name: /custom/i })
    expect(button).toHaveClass("custom-class")
  })

  it("is disabled when the disabled prop is passed", () => {
    render(<Button disabled>Disabled</Button>)
    const button = screen.getByRole("button", { name: /disabled/i })
    expect(button).toBeDisabled()
    expect(button).toHaveClass("disabled:pointer-events-none disabled:opacity-50")
  })

  it("renders as a different element when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    )
    const link = screen.getByRole("link", { name: /link button/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/test")
    expect(link).toHaveClass("bg-primary text-primary-foreground")
  })
})
