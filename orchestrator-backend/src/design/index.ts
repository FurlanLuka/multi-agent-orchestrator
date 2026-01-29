// Design module exports
export { DesignerAgentManager } from './designer-agent-manager';
export { getDesignerSystemPrompt, loadDesignReferences, getPaletteTemplate, getComponentsTemplate, getTypographyTemplate } from './design-prompts';
export {
  generatePalettePreviewHtml,
  generateComponentPreviewHtml,
  generateTypographyPreviewHtml,
  createDefaultTypography,
  createDefaultSpacing,
  createDefaultEffects,
} from './mockup-generator';
