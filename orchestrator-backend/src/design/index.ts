// Design module exports
export { DesignerAgentManager } from './designer-agent-manager';
export { getDesignerSystemPrompt, getThemeTemplate, getComponentGenerationPrompt, getMockupGenerationPrompt } from './design-prompts';
export { designReferences } from './design-references';
export {
  BASE_ATOMIC_COMPONENTS,
  CATEGORY_ATOMIC_COMPONENTS,
  CATEGORY_PAGE_SECTIONS,
  CATEGORY_DESIGN_APPROACHES,
  getComponentsForCategory,
  getSectionsForCategory,
  getDesignApproachesForCategory,
  getComponentListForPrompt,
  getSectionListForPrompt,
  getDesignApproachesForPrompt,
} from './design-definitions';
