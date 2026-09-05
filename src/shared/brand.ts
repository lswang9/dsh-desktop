/** User-facing product brand. Keep package/plugin IDs separate from display names. */

export const PRODUCT_NAME_EN = 'Pierhouse'
export const PRODUCT_NAME_ZH = '泊屋'
export const PRODUCT_NAME_DEV_EN = 'Pierhouse Dev'
export const PRODUCT_NAME_DEV_ZH = '泊屋 Dev'

export type BrandLocale = 'en' | 'zh'

export function productName(locale: BrandLocale = 'en', development = false): string {
  if (development) {
    return locale === 'zh' ? PRODUCT_NAME_DEV_ZH : PRODUCT_NAME_DEV_EN
  }
  return locale === 'zh' ? PRODUCT_NAME_ZH : PRODUCT_NAME_EN
}
