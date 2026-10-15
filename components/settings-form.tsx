'use client'

import * as React from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  contentSize,
  sanitizeSettings,
  writeSettingsCookie,
  type ProcessingSettings,
} from '@/lib/settings'
import { OUTPUT_SIZE } from '@/lib/image-layout'
import { LOSSLESS_QUALITY, paletteSizeForQuality } from '@/lib/png-compress'

interface FieldProps {
  id: string
  label: string
  description: React.ReactNode
  unit: string
  value: number
  limits: { min: number; max: number; step: number }
  onChange: (value: number) => void
}

// Slider plus number input bound to the same value
function RangeField({ id, label, description, unit, value, limits, onChange }: FieldProps) {
  const t = useTranslations('Settings')
  const descriptionId = `${id}-description`
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor={id} className="text-sm font-medium">{label}</label>
          <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={limits.min}
            max={limits.max}
            step={limits.step}
            value={value}
            aria-describedby={descriptionId}
            onChange={(e) => onChange(Number(e.target.value))}
            // Snap typed values into range when leaving the field
            onBlur={() => onChange(Math.min(limits.max, Math.max(limits.min, Math.round(value))))}
            className="h-9 w-20 text-right font-mono"
          />
          <span className="w-5 text-sm text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        aria-label={t('slider', { label })}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--primary))]"
      />
      <div className="flex justify-between font-mono text-xs text-muted-foreground">
        <span>{limits.min}{unit}</span>
        <span>{limits.max}{unit}</span>
      </div>
    </div>
  )
}

export function SettingsForm({ initial }: { initial: ProcessingSettings }) {
  const t = useTranslations('Settings')
  const [settings, setSettings] = React.useState(initial)
  const [saved, setSaved] = React.useState(initial)

  const update = (key: keyof ProcessingSettings) => (value: number) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof ProcessingSettings)[]
  const dirty = keys.some((key) => settings[key] !== saved[key])
  const isDefault = keys.every((key) => settings[key] === DEFAULT_SETTINGS[key])

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    // Number inputs can hold out-of-range values while typing; store the clamped ones
    const clean = sanitizeSettings(settings)
    writeSettingsCookie(clean)
    setSettings(clean)
    setSaved(clean)
    toast.success(t('saved'))
  }

  // Preview uses the clamped value so the diagram never inverts
  const preview = sanitizeSettings(settings)
  const inset = `${(preview.padding / OUTPUT_SIZE) * 100}%`

  return (
    <form onSubmit={save} className="mt-8 space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">{t('whiteBackgroundSection')}</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-[1fr_auto]">
          <RangeField
            id="padding"
            label={t('padding')}
            unit="px"
            value={settings.padding}
            limits={SETTINGS_LIMITS.padding}
            onChange={update('padding')}
            description={t.rich('paddingDescription', {
              size: OUTPUT_SIZE,
              content: contentSize(preview.padding),
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          />
          <figure className="mx-auto w-36 sm:w-40">
            <div
              aria-hidden="true"
              className="relative aspect-square w-full rounded-lg border bg-white shadow-inner"
            >
              <div
                className="absolute rounded-sm border-2 border-dashed border-primary/60 bg-primary/10 transition-all"
                style={{ inset }}
              />
            </div>
            <figcaption className="mt-2 text-center text-xs text-muted-foreground">{t('previewCaption')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">{t('detectionSection')}</h2>
        <div className="mt-6">
          <RangeField
            id="white-threshold"
            label={t('threshold')}
            unit="%"
            value={settings.whiteThreshold}
            limits={SETTINGS_LIMITS.whiteThreshold}
            onChange={update('whiteThreshold')}
            description={t('thresholdDescription')}
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">{t('outputSection')}</h2>
        <div className="mt-6">
          <RangeField
            id="png-quality"
            label={t('pngQuality')}
            unit=""
            value={settings.pngQuality}
            limits={SETTINGS_LIMITS.pngQuality}
            onChange={update('pngQuality')}
            description={
              preview.pngQuality >= LOSSLESS_QUALITY
                ? t('pngQualityLossless')
                : t('pngQualityDescription', { colors: paletteSizeForQuality(preview.pngQuality) })
            }
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled={isDefault}
          onClick={() => setSettings({ ...DEFAULT_SETTINGS })}
        >
          <RotateCcw className="h-4 w-4" />
          {t('reset')}
        </Button>
        <Button type="submit" disabled={!dirty} className="shadow-sm shadow-primary/25">
          <Save className="h-4 w-4" />
          {t('save')}
        </Button>
      </div>
    </form>
  )
}
