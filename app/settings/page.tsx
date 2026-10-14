import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { SettingsForm } from "@/components/settings-form"
import { SETTINGS_COOKIE, parseSettings } from "@/lib/settings"

export const metadata: Metadata = {
  title: `Settings · ${process.env.NEXT_PUBLIC_SITE_NAME || "Image Processor"}`,
}

export default async function SettingsPage() {
  // Read on the server so the form renders with the saved values, without a flash of defaults
  const initial = parseSettings((await cookies()).get(SETTINGS_COOKIE)?.value)

  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the processor
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Tune how images are laid out. Settings are saved in a cookie on this device and apply to the next images you
        process.
      </p>
      <SettingsForm initial={initial} />
    </main>
  )
}
