// The display name of a measurement site (lib/measurements.js SITES) in the current language.
// Its own module so a screen can name a site without pulling in the sheets.
import { t } from './i18n.js'

export function measureName(site) {
  switch (site) {
    case 'neck': return t('Neck')
    case 'shoulders': return t('Shoulders')
    case 'chest': return t('Chest')
    case 'waist': return t('Waist')
    case 'hips': return t('Hips')
    case 'arm': return t('Arm')
    case 'forearm': return t('Forearm')
    case 'thigh': return t('Thigh')
    case 'calf': return t('Calf')
    default: return site
  }
}
