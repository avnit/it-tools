import { Link } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.llm-connector-tester.title'),
  path: '/llm-connector-tester',
  description: translate('tools.llm-connector-tester.description'),
  keywords: ['llm', 'connector', 'claude', 'anthropic', 'gemini', 'google', 'openai', 'api', 'agent', 'tester', 'ai', 'key'],
  component: () => import('./llm-connector-tester.vue'),
  icon: Link,
  createdAt: new Date('2026-09-28'),
});
