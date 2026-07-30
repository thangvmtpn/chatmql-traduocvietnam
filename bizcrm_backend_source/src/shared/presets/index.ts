import type { PresetPackage } from './types.js'
import { commonPreset } from './common.js'
import { zaloOaPreset } from './zalo-oa.js'
import { zaloPersonalPreset } from './zalo-personal.js'
import { facebookPreset } from './facebook.js'
import { b2bPreset } from './b2b.js'
import { ecommercePreset } from './ecommerce.js'
import { miniappPreset } from './miniapp.js'
import { aiCdpPreset } from './ai-cdp.js'

export type { PresetPackage, PresetProperty, PresetEvent, PresetAutomation } from './types.js'
export { buildFlowConfigFromPreset } from './types.js'

export const ALL_PRESETS: PresetPackage[] = [
  commonPreset, zaloOaPreset, zaloPersonalPreset,
  facebookPreset, b2bPreset, ecommercePreset, miniappPreset,
  aiCdpPreset,
]

export const PRESET_MAP = new Map(ALL_PRESETS.map(p => [p.key, p]))
