<script setup lang="ts">
import { NSpin, NTag } from 'naive-ui';
import JSON5 from 'json5';
import {
  MCP_PROTOCOL_VERSION,
  type McpCallResult,
  buildInitializeParams,
  extractToolList,
  isLikelyCorsFailure,
  resetRequestId,
  sendMcpRequest,
} from './mcp-server-tester.service';
import TextareaCopyable from '@/components/TextareaCopyable.vue';

const serverUrl = ref('');
const bearerToken = ref('');
const rawHeaders = ref('');
const protocolVersion = ref(MCP_PROTOCOL_VERSION);
const sessionId = ref('');

const toolName = ref('');
const toolArguments = ref('{}');

const isLoading = ref(false);
const results = ref<{ label: string; result: McpCallResult }[]>([]);
const discoveredTools = ref<{ name: string; description: string }[]>([]);

const canRun = computed(() => serverUrl.value.trim().length > 0 && !isLoading.value);

const toolArgumentsError = computed(() => {
  if (toolArguments.value.trim() === '') {
    return undefined;
  }

  try {
    JSON5.parse(toolArguments.value);
    return undefined;
  }
  catch (error) {
    return error instanceof Error ? error.message : 'Invalid JSON';
  }
});

function requestOptions() {
  return {
    url: serverUrl.value.trim(),
    rawHeaders: rawHeaders.value,
    bearerToken: bearerToken.value.trim(),
    sessionId: sessionId.value.trim(),
    protocolVersion: protocolVersion.value.trim() || MCP_PROTOCOL_VERSION,
  };
}

function record({ label, result }: { label: string; result: McpCallResult }) {
  // Newest call first so the latest attempt is always the one in view.
  results.value = [{ label, result }, ...results.value].slice(0, 20);

  if (result.sessionId) {
    sessionId.value = result.sessionId;
  }
}

async function run({ label, method, params, isNotification = false }: { label: string; method: string; params?: Record<string, unknown>; isNotification?: boolean }) {
  isLoading.value = true;

  try {
    const result = await sendMcpRequest({ ...requestOptions(), method, params, isNotification });
    record({ label, result });

    return result;
  }
  finally {
    isLoading.value = false;
  }
}

async function listTools() {
  const result = await run({ label: 'tools/list', method: 'tools/list', params: {} });
  discoveredTools.value = extractToolList(result.response);
}

async function handshake() {
  resetRequestId();
  sessionId.value = '';
  discoveredTools.value = [];

  const initialized = await run({
    label: 'initialize',
    method: 'initialize',
    params: buildInitializeParams({ protocolVersion: protocolVersion.value.trim() || MCP_PROTOCOL_VERSION }),
  });

  if (!initialized.ok) {
    return;
  }

  // The spec requires the client to confirm the handshake before issuing any other call.
  await run({ label: 'notifications/initialized', method: 'notifications/initialized', isNotification: true });
  await listTools();
}

async function callTool() {
  if (toolName.value.trim() === '' || toolArgumentsError.value) {
    return;
  }

  await run({
    label: `tools/call - ${toolName.value.trim()}`,
    method: 'tools/call',
    params: {
      name: toolName.value.trim(),
      arguments: toolArguments.value.trim() === '' ? {} : JSON5.parse(toolArguments.value),
    },
  });
}

function formatResult(result: McpCallResult) {
  return JSON.stringify(
    {
      request: result.request,
      status: `${result.status} ${result.statusText}`,
      durationMs: result.durationMs,
      ...(result.sessionId ? { sessionId: result.sessionId } : {}),
      ...(result.transportError ? { transportError: result.transportError } : {}),
      ...(result.response === undefined ? {} : { response: result.response }),
    },
    null,
    2,
  );
}
</script>

<template>
  <div>
    <c-card title="MCP server" mb-3>
      <c-input-text
        v-model:value="serverUrl"
        label="Server URL"
        placeholder="https://mcp.example.com/mcp"
        raw-text
        mb-3
      />

      <div mb-3 flex gap-3>
        <c-input-text
          v-model:value="bearerToken"
          label="Bearer token (optional)"
          placeholder="Sent in the Authorization header"
          type="password"
          raw-text
          flex-1
        />
        <c-input-text
          v-model:value="protocolVersion"
          label="Protocol version"
          :placeholder="MCP_PROTOCOL_VERSION"
          raw-text
          flex-1
        />
      </div>

      <c-input-text
        v-model:value="rawHeaders"
        label="Extra headers (one Name: value per line)"
        placeholder="X-Api-Key: ..."
        rows="3"
        raw-text multiline monospace mb-3
      />

      <div flex flex-wrap gap-3>
        <c-button type="primary" :disabled="!canRun" @click="handshake">
          Initialize + list tools
        </c-button>
        <c-button :disabled="!canRun" @click="listTools">
          tools/list
        </c-button>
        <c-button :disabled="!canRun" @click="run({ label: 'resources/list', method: 'resources/list', params: {} })">
          resources/list
        </c-button>
        <c-button :disabled="!canRun" @click="run({ label: 'prompts/list', method: 'prompts/list', params: {} })">
          prompts/list
        </c-button>
        <c-button :disabled="!canRun" @click="run({ label: 'ping', method: 'ping', params: {} })">
          ping
        </c-button>
      </div>

      <div v-if="sessionId" mt-3 text-sm op-70>
        Session id: <strong>{{ sessionId }}</strong>
      </div>
    </c-card>

    <c-card title="Call a tool" mb-3>
      <c-input-text
        v-model:value="toolName"
        label="Tool name"
        placeholder="search"
        raw-text
        mb-3
      />

      <c-input-text
        v-model:value="toolArguments"
        label="Arguments (JSON)"
        placeholder="{ &quot;query&quot;: &quot;hello&quot; }"
        multiline
        rows="4"
        raw-text
        monospace
        mb-2
      />

      <div v-if="toolArgumentsError" mb-3 text-sm text-red op-80>
        {{ toolArgumentsError }}
      </div>

      <c-button type="primary" :disabled="!canRun || toolName.trim() === '' || Boolean(toolArgumentsError)" @click="callTool">
        tools/call
      </c-button>

      <div v-if="discoveredTools.length > 0" mt-4>
        <div mb-2 text-sm op-70>
          Discovered tools, click one to fill the name above:
        </div>
        <div flex flex-wrap gap-2>
          <NTag
            v-for="discoveredTool of discoveredTools"
            :key="discoveredTool.name"
            checkable
            :title="discoveredTool.description"
            @click="toolName = discoveredTool.name"
          >
            {{ discoveredTool.name }}
          </NTag>
        </div>
      </div>
    </c-card>

    <div v-if="isLoading" my-4 flex justify-center>
      <NSpin size="small" />
    </div>

    <c-alert v-if="results.length === 0 && !isLoading" title="Everything runs in your browser">
      Requests go straight from this page to the MCP server, so the server must send permissive CORS headers, and the
      credentials you paste stay in this tab: they are never stored or sent anywhere else.
    </c-alert>

    <c-card v-for="({ label, result }, index) of results" :key="index" mb-3>
      <div mb-2 flex items-center justify-between>
        <div font-bold>
          {{ label }}
        </div>
        <NTag :type="result.ok ? 'success' : 'error'" size="small">
          {{ result.status === 0 ? 'failed' : result.status }} - {{ result.durationMs }} ms
        </NTag>
      </div>

      <c-alert v-if="isLikelyCorsFailure(result)" title="The request never reached the server" mb-3>
        {{ result.transportError }} - this is usually a CORS restriction, an unreachable host, or a mixed-content block.
        Check that the server allows this origin and exposes the Mcp-Session-Id header.
      </c-alert>

      <c-alert v-else-if="result.error" :title="`JSON-RPC error ${result.error.code}`" mb-3>
        {{ result.error.message }}
      </c-alert>

      <TextareaCopyable :value="formatResult(result)" language="json" />
    </c-card>
  </div>
</template>
