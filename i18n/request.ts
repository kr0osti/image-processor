import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE, isLocale, negotiateLocale } from './config'

export default getRequestConfig(async () => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(saved) ? saved : negotiateLocale((await headers()).get('accept-language'))

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
