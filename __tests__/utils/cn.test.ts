import { cn } from "../../lib/utils"

describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("bg-red-500", "text-white")).toBe("bg-red-500 text-white")
  })

  it("should handle conditional classes", () => {
    expect(cn("bg-red-500", true && "text-white", false && "p-4")).toBe(
      "bg-red-500 text-white"
    )
  })

  it("should handle object classes", () => {
    expect(cn({ "bg-red-500": true, "text-white": false })).toBe("bg-red-500")
  })

  it("should resolve tailwind conflicts", () => {
    // tailwind-merge should resolve px-2 and px-4 to px-4
    expect(cn("px-2 px-4")).toBe("px-4")
  })

  it("should handle complex merging with conflicts", () => {
    expect(cn("p-4 bg-red-500", "p-2")).toBe("bg-red-500 p-2")
  })

  it("should handle null and undefined", () => {
    expect(cn("bg-red-500", null, undefined)).toBe("bg-red-500")
  })

  it("should handle empty inputs", () => {
    expect(cn()).toBe("")
  })
})
