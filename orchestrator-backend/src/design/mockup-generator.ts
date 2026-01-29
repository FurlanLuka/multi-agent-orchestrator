import {
  DesignTokens,
  DesignTokensColors,
  DesignTokensTypography,
  DesignTokensEffects,
  DesignTokensComponents,
} from '@orchy/types';
import { getThemeTemplate, getComponentsTemplate, getTypographyTemplate } from './design-prompts';

/**
 * Replace template placeholders with actual values
 */
function replacePlaceholders(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, value);
  }
  return result;
}

/**
 * Generate theme preview HTML from colors and typography colors
 */
export function generateThemePreviewHtml(
  colors: DesignTokensColors,
  typographyColors: DesignTokensTypography['colors']
): string {
  const template = getThemeTemplate();

  const values: Record<string, string> = {
    // Primary scale
    primary0: colors.primary[0] || '#f0f9ff',
    primary1: colors.primary[1] || '#e0f2fe',
    primary2: colors.primary[2] || '#bae6fd',
    primary3: colors.primary[3] || '#7dd3fc',
    primary4: colors.primary[4] || '#38bdf8',
    primary5: colors.primary[5] || '#0ea5e9',
    primary6: colors.primary[6] || '#0284c7',
    primary7: colors.primary[7] || '#0369a1',
    primary8: colors.primary[8] || '#075985',
    primary9: colors.primary[9] || '#0c4a6e',
    // Neutral scale (grays)
    neutral0: colors.neutral[0] || '#fafafa',
    neutral1: colors.neutral[1] || '#f5f5f5',
    neutral2: colors.neutral[2] || '#e5e5e5',
    neutral3: colors.neutral[3] || '#d4d4d4',
    neutral4: colors.neutral[4] || '#a3a3a3',
    neutral5: colors.neutral[5] || '#737373',
    neutral6: colors.neutral[6] || '#525252',
    neutral7: colors.neutral[7] || '#404040',
    neutral8: colors.neutral[8] || '#262626',
    neutral9: colors.neutral[9] || '#171717',
    // Surface colors
    background: colors.background,
    surface: colors.surface,
    surfaceElevated: colors.surfaceElevated,
    border: colors.border,
    // Semantic colors
    success: colors.success,
    successBg: colors.successBg || hexToRgba(colors.success, 0.1),
    warning: colors.warning,
    warningBg: colors.warningBg || hexToRgba(colors.warning, 0.1),
    error: colors.error,
    errorBg: colors.errorBg || hexToRgba(colors.error, 0.1),
    info: colors.info,
    infoBg: colors.infoBg || hexToRgba(colors.info, 0.1),
    // Typography colors
    textHeading: typographyColors.heading,
    textBody: typographyColors.body,
    textMuted: typographyColors.muted,
    textLink: typographyColors.link,
    textLinkHover: typographyColors.linkHover,
    textOnPrimary: typographyColors.onPrimary,
    textOnSecondary: typographyColors.onSecondary,
    textDisabled: typographyColors.disabled,
  };

  return replacePlaceholders(template, values);
}

/**
 * @deprecated Use generateThemePreviewHtml instead
 */
export function generatePalettePreviewHtml(colors: DesignTokensColors): string {
  // Provide default typography colors for backwards compatibility
  const defaultTypographyColors: DesignTokensTypography['colors'] = {
    heading: '#0f172a',
    body: '#334155',
    muted: '#64748b',
    link: colors.primary[6] || '#0284c7',
    linkHover: colors.primary[7] || '#0369a1',
    onPrimary: '#ffffff',
    onSecondary: '#ffffff',
    disabled: '#94a3b8',
  };
  return generateThemePreviewHtml(colors, defaultTypographyColors);
}

/**
 * Generate component style preview HTML
 */
export function generateComponentPreviewHtml(
  colors: DesignTokensColors,
  typography: DesignTokensTypography,
  effects: DesignTokensEffects,
  components: DesignTokensComponents
): string {
  const template = getComponentsTemplate();

  // Get primary color (shade 600)
  const primaryColor = colors.primary[6] || '#525252';
  const primaryBadgeBg = hexToRgba(primaryColor, 0.1);

  // Generate semantic badge backgrounds
  const successBadgeBg = hexToRgba(colors.success, 0.1);
  const errorBadgeBg = hexToRgba(colors.error, 0.1);
  const warningBadgeBg = hexToRgba(colors.warning, 0.1);

  // Generate alert colors
  const successAlertBg = hexToRgba(colors.success, 0.1);
  const errorAlertBg = hexToRgba(colors.error, 0.1);
  const warningAlertBg = hexToRgba(colors.warning, 0.1);
  const infoAlertBg = hexToRgba(colors.info, 0.1);

  // Get text colors from typography
  const textColors = typography.colors || {
    heading: '#3a3230',
    body: '#4a4340',
    muted: '#9a8e86',
    link: primaryColor,
    linkHover: colors.primary[7] || '#404040',
    onPrimary: '#ffffff',
    onSecondary: '#ffffff',
    disabled: '#b8a8a0',
  };

  const values: Record<string, string> = {
    // Background and text
    backgroundColor: colors.background,
    textColor: textColors.body,
    textHeading: textColors.heading,
    textBody: textColors.body,
    textLabel: textColors.muted,
    textDimmed: textColors.muted,
    textPlaceholder: textColors.disabled,
    borderColor: colors.border,

    // Typography
    fontFamily: typography.fontFamilyBase,
    fontSizeXs: typography.fontSizes.xs,
    fontSizeSm: typography.fontSizes.sm,
    fontSizeBase: typography.fontSizes.base,
    fontSizeLg: typography.fontSizes.lg,
    fontSizeXl: typography.fontSizes.xl,
    fontSize2xl: typography.fontSizes['2xl'],
    fontWeightNormal: String(typography.fontWeights.normal),
    fontWeightMedium: String(typography.fontWeights.medium),
    fontWeightSemibold: String(typography.fontWeights.semibold),
    fontWeightBold: String(typography.fontWeights.bold),
    lineHeight: String(typography.lineHeights.normal),

    // Cards
    cardBackground: components.cards.background,
    cardBorder: components.cards.border,
    cardRadius: components.cards.borderRadius,
    cardShadow: components.cards.shadow,
    cardShadowHover: components.cards.shadowHover,
    cardPadding: components.cards.padding,

    // Buttons
    buttonPrimaryBg: components.buttons.primaryBackground,
    buttonPrimaryText: components.buttons.primaryText,
    buttonSecondaryBg: components.buttons.secondaryBackground,
    buttonSecondaryBorder: components.buttons.secondaryBorder,
    buttonRadius: components.buttons.borderRadius,
    buttonPadding: components.buttons.padding,

    // Inputs
    inputBackground: colors.surface,
    inputBorder: components.inputs.border,
    inputRadius: components.inputs.borderRadius,
    inputFocusBorder: components.inputs.focusBorder,
    inputFocusBackground: components.inputs.focusBackground,
    inputFocusRing: hexToRgba(primaryColor, 0.1),

    // Badges
    badgeRadius: components.badges.borderRadius,
    badgePadding: components.badges.padding,
    primaryColor,
    primaryBadgeBg,
    successColor: colors.success,
    successBadgeBg,
    errorColor: colors.error,
    errorBadgeBg,
    warningColor: colors.warning,
    warningBadgeBg,

    // Alerts
    alertRadius: effects.radii.md,
    successAlertBg,
    successAlertText: colors.success,
    errorAlertBg,
    errorAlertText: colors.error,
    warningAlertBg,
    warningAlertText: colors.warning,
    infoAlertBg,
    infoAlertText: colors.info,
  };

  return replacePlaceholders(template, values);
}

/**
 * Generate typography preview HTML
 */
export function generateTypographyPreviewHtml(
  colors: DesignTokensColors,
  typography: DesignTokensTypography
): string {
  const template = getTypographyTemplate();

  // Get text colors from typography
  const textColors = typography.colors || {
    heading: '#3a3230',
    body: '#4a4340',
    muted: '#9a8e86',
    link: colors.primary[6] || '#0284c7',
    linkHover: colors.primary[7] || '#0369a1',
    onPrimary: '#ffffff',
    onSecondary: '#ffffff',
    disabled: '#b8a8a0',
  };

  const values: Record<string, string> = {
    // Background and colors
    backgroundColor: colors.background,
    surfaceColor: colors.surface,
    borderColor: colors.border,
    textColor: textColors.body,
    textHeading: textColors.heading,
    textBody: textColors.body,
    textLabel: textColors.muted,
    textDimmed: textColors.muted,
    textPlaceholder: textColors.disabled,
    textLink: textColors.link,

    // Typography
    fontFamily: typography.fontFamilyBase,
    fontSizeXs: typography.fontSizes.xs,
    fontSizeSm: typography.fontSizes.sm,
    fontSizeBase: typography.fontSizes.base,
    fontSizeLg: typography.fontSizes.lg,
    fontSizeXl: typography.fontSizes.xl,
    fontSize2xl: typography.fontSizes['2xl'],
    fontSize3xl: typography.fontSizes['3xl'] || '36px',
    fontWeightNormal: String(typography.fontWeights.normal),
    fontWeightMedium: String(typography.fontWeights.medium),
    fontWeightSemibold: String(typography.fontWeights.semibold),
    fontWeightBold: String(typography.fontWeights.bold),
    lineHeightTight: String(typography.lineHeights.tight),
    lineHeightNormal: String(typography.lineHeights.normal),
    lineHeightRelaxed: String(typography.lineHeights.relaxed),
  };

  return replacePlaceholders(template, values);
}

/**
 * Convert hex color to rgba
 */
function hexToRgba(hex: string, alpha: number): string {
  // Handle rgba input
  if (hex.startsWith('rgba')) {
    return hex;
  }

  // Handle rgb input
  if (hex.startsWith('rgb(')) {
    const match = hex.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
  }

  // Handle hex input
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create default typography tokens
 */
export function createDefaultTypography(): DesignTokensTypography {
  return {
    fontFamilyBase: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSizes: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '24px',
      '2xl': '32px',
      '3xl': '40px',
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeights: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
    colors: {
      heading: '#0f172a',
      body: '#334155',
      muted: '#64748b',
      link: '#0284c7',
      linkHover: '#0369a1',
      onPrimary: '#ffffff',
      onSecondary: '#ffffff',
      disabled: '#94a3b8',
    },
  };
}

/**
 * Create default spacing tokens
 */
export function createDefaultSpacing(): DesignTokensSpacing {
  return {
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '6': '24px',
    '8': '32px',
    '12': '48px',
    '16': '64px',
  };
}

/**
 * Create default effects tokens
 */
export function createDefaultEffects(): DesignTokensEffects {
  return {
    radii: {
      sm: '8px',
      md: '12px',
      lg: '16px',
      full: '9999px',
    },
    shadows: {
      sm: '0 1px 3px rgba(0, 0, 0, 0.04)',
      md: '0 4px 16px rgba(0, 0, 0, 0.06)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.1)',
    },
  };
}

// Re-export types for convenience
import type { DesignTokensSpacing } from '@orchy/types';
