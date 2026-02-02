// Design module exports
export { DesignerAgentManager } from './designer-agent-manager';
export { getDesignerSystemPrompt, getThemeTemplate, getComponentGenerationPrompt, getMockupGenerationPrompt } from './design-prompts';
export { designReferences } from './design-references';
export {
  BASE_ATOMIC_COMPONENTS,
  CATEGORY_ATOMIC_COMPONENTS,
  CATEGORY_PAGE_SECTIONS,
  COMPONENT_STYLE_APPROACHES,
  getComponentsForCategory,
  getSectionsForCategory,
  getComponentListForPrompt,
  getSectionListForPrompt,
  getStyleApproachesForPrompt,
} from './design-definitions';
