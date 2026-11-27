<script setup lang="ts">
import { NSpin, NTag } from 'naive-ui';
import {
  type ConnectorTestResult,
  type ProviderId,
  getProvider,
  providers,
  redactKey,
  testConnector,
} from './llm-connector-tester.service';
import TextareaCopyable from '@/components/TextareaCopyable.vue';

const providerId = ref<ProviderId>('anthropic');
const provider = computed(() => getProvider(providerId.value));

const baseUrl = ref(getProvider('anthropic').defaultBaseUrl);
const model = ref(getProvider('anthropic').defaultModel);
const apiKey = ref('');
const systemPrompt = ref('');
const prompt = ref('Reply with the single word: pong');
const maxTokens = ref(256);

const isLoading = ref(false);
const result = ref<ConnectorTestResult>();

// Switching provider resets the endpoint-specific fields but deliberately keeps the key box empty.
watch(providerId, (id) => {
  const next = getProvider(id);
  baseUrl.value = next.defaultBaseUrl;
  model.value = next.defaultModel;
  apiKey.value = '';
  result.value = undefined;
});

const providerOptions = providers.map(({ id, label }) => ({ label, value: id }));

const canRun = computed(() =>
  !isLoading.value
  && apiKey.value.trim() !== ''
  && model.value.trim() !== ''
  && baseUrl.value.trim() !== ''
  && prompt.value.trim() !== '');

async function run() {
  isLoading.value = true;

  try {
    result.value = await testConnector({
      provider: providerId.value,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      model: model.value.trim(),
      prompt: prompt.value,
      systemPrompt: systemPrompt.value,
      maxTokens: Number(maxTokens.value) || 256,
    });
  }
  finally {
    isLoading.value = false;
  }
}

const rawResponse = computed(() =>
  result.value === undefined ? '' : JSON.stringify(result.value.rawResponse ?? {}, null, 2));

const usageSummary = computed(() => {
  const usage = result.value?.parsed?.usage;

  if (!usage) {
    return '';
  }

  return [
    usage.inputTokens === undefined ? undefined : `${usage.inputTokens} in`,
    usage.outputTokens === undefined ? undefined : `${usage.outputTokens} out`,
    usage.totalTokens === undefined ? undefined : `${usage.totalTokens} total`,
  ].filter(Boolean).join(' / ');
});
</script>

<template>
  <div>
    <c-card title="Connector" mb-3>
      <c-select
        v-model:value="providerId"
        label="Provider"
        :options="providerOptions"
        mb-3
      />

      <div mb-3 flex flex-wrap gap-3>
        <c-input-text
          v-model:value="baseUrl"
          label="Base URL"
          raw-text
          flex-1
        />
        <c-input-text
          v-model:value="model"
          label="Model"
          :placeholder="provider.modelSuggestions[0] ?? 'model id'"
          raw-text
          flex-1
        />
      </div>

      <c-input-text
        v-model:value="apiKey"
        :label="provider.keyLabel"
        :placeholder="provider.keyPlaceholder"
        type="password"
        raw-text
        mb-2
      />

      <div mb-3 text-sm op-70>
        {{ provider.notes }}
      </div>

      <div v-if="provider.modelSuggestions.length > 0" mb-3>
        <div mb-2 text-sm op-70>
          Known model ids:
        </div>
        <div flex flex-wrap gap-2>
          <NTag
            v-for="suggestion of provider.modelSuggestions"
            :key="suggestion"
            checkable
            @click="model = suggestion"
          >
            {{ suggestion }}
          </NTag>
        </div>
      </div>
    </c-card>

    <c-card title="Probe" mb-3>
      <c-input-text
        v-model:value="systemPrompt"
        label="System prompt (optional)"
        placeholder="You are a connectivity probe."
        multiline
        rows="2"
        raw-text
        mb-3
      />

      <c-input-text
        v-model:value="prompt"
        label="Prompt"
        multiline
        rows="3"
        raw-text
        mb-3
      />

      <c-input-text
        v-model:value="maxTokens"
        label="Max output tokens"
        raw-text
        mb-3
      />

      <c-button type="primary" :disabled="!canRun" @click="run">
        Send test request
      </c-button>
    </c-card>

    <div v-if="isLoading" my-4 flex justify-center>
      <NSpin size="small" />
    </div>

    <c-alert v-if="!result && !isLoading" title="Your key never leaves this tab">
      The request is sent straight from your browser to the provider. Keys are held in memory only, are never written to
      local storage, and are never sent to it-tools. Providers that do not allow browser origins will fail with a CORS
      error: point the base URL at your own gateway in that case.
    </c-alert>

    <c-card v-if="result" mb-3>
      <div mb-3 flex items-center justify-between>
        <div font-bold>
          {{ provider.label }} - {{ model }}
        </div>
        <NTag :type="result.ok ? 'success' : 'error'" size="small">
          {{ result.status === 0 ? 'failed' : result.status }} - {{ result.durationMs }} ms
        </NTag>
      </div>

      <div mb-3 text-sm op-70>
        POST {{ result.requestUrl }} - key {{ redactKey(apiKey) }}
      </div>

      <c-alert v-if="result.transportError" title="The request never reached the provider" mb-3>
        {{ result.transportError }} - usually a CORS restriction, a blocked host, or an offline endpoint.
      </c-alert>

      <c-alert v-else-if="!result.ok" :title="`The provider returned ${result.status}`" mb-3>
        {{ result.errorMessage ?? result.statusText }}
      </c-alert>

      <template v-if="result.parsed">
        <div mb-1 font-bold>
          Reply
        </div>
        <TextareaCopyable :value="result.parsed.text || '(empty response)'" mb-3 />

        <div mb-3 text-sm op-70>
          <span v-if="result.parsed.model">Served by {{ result.parsed.model }}.</span>
          <span v-if="result.parsed.stopReason"> Stop reason: {{ result.parsed.stopReason }}.</span>
          <span v-if="usageSummary"> Tokens: {{ usageSummary }}.</span>
        </div>
      </template>

      <div mb-1 font-bold>
        Raw response
      </div>
      <TextareaCopyable :value="rawResponse" language="json" />
    </c-card>
  </div>
</template>
