// Design module exports
export { DesignerAgentManager } from './designer-agent-manager';
export { getDesignerSystemPrompt, loadDesignReferences, getThemeTemplate, getComponentGenerationPrompt, getMockupGenerationPrompt } from './design-prompts';
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
