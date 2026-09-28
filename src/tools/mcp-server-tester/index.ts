import { Server } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.mcp-server-tester.title'),
  path: '/mcp-server-tester',
  description: translate('tools.mcp-server-tester.description'),
  keywords: ['mcp', 'model', 'context', 'protocol', 'agent', 'server', 'tester', 'jsonrpc', 'claude', 'gemini', 'connector', 'tools'],
  component: () => import('./mcp-server-tester.vue'),
  icon: Server,
  createdAt: new Date('2026-09-28'),
});
