import { SortDescendingNumbers } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.llm-recommender.title'),
  path: '/llm-recommender',
  description: translate('tools.llm-recommender.description'),
  keywords: ['llm', 'model', 'recommender', 'claude', 'gemini', 'anthropic', 'google', 'ai', 'agent', 'cost', 'pricing', 'context', 'choose'],
  component: () => import('./llm-recommender.vue'),
  icon: SortDescendingNumbers,
  createdAt: new Date('2026-09-28'),
});
