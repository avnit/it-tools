<script setup lang="ts">
import { NCheckbox, NTag } from 'naive-ui';
import { CATALOG_UPDATED_AT, modalityOptions, priorities, taskProfiles } from './llm-recommender.constants';
import { formatCost, recommendModels } from './llm-recommender.service';
import type { Modality, PriorityId } from './llm-recommender.types';

const taskId = ref('agentic-coding');
const priority = ref<PriorityId>('balanced');
const requiredModalities = ref<Modality[]>([]);
const selectedProviders = ref<('Anthropic' | 'Google')[]>([]);
const minContextWindow = ref('0');
const inputTokensPerRequest = ref('10000');
const outputTokensPerRequest = ref('1000');
const requestsPerMonth = ref('10000');

const taskOptions = taskProfiles.map(({ id, label }) => ({ label, value: id }));
const priorityOptions = priorities.map(({ id, label }) => ({ label, value: id }));
const contextOptions = [
  { label: 'No minimum', value: '0' },
  { label: 'At least 200K tokens', value: '200000' },
  { label: 'At least 500K tokens', value: '500000' },
  { label: 'At least 1M tokens', value: '1000000' },
];

function toPositiveNumber(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toggleModality(modality: Modality) {
  requiredModalities.value = requiredModalities.value.includes(modality)
    ? requiredModalities.value.filter(item => item !== modality)
    : [...requiredModalities.value, modality];
}

function toggleProvider(provider: 'Anthropic' | 'Google') {
  selectedProviders.value = selectedProviders.value.includes(provider)
    ? selectedProviders.value.filter(item => item !== provider)
    : [...selectedProviders.value, provider];
}

const result = computed(() => recommendModels({
  taskId: taskId.value,
  priority: priority.value,
  requiredModalities: requiredModalities.value,
  minContextWindow: Number(minContextWindow.value),
  providers: selectedProviders.value,
  inputTokensPerRequest: toPositiveNumber(inputTokensPerRequest.value),
  outputTokensPerRequest: toPositiveNumber(outputTokensPerRequest.value),
  requestsPerMonth: toPositiveNumber(requestsPerMonth.value),
}));

const topScore = computed(() => result.value.recommendations[0]?.score ?? 1);
</script>

<template>
  <div>
    <c-card title="What are you building?" mb-3>
      <c-select
        v-model:value="taskId"
        label="Workload"
        :options="taskOptions"
        mb-3
      />

      <c-select
        v-model:value="priority"
        label="Optimise for"
        :options="priorityOptions"
        mb-3
      />

      <c-select
        v-model:value="minContextWindow"
        label="Minimum context window"
        :options="contextOptions"
        mb-3
      />

      <div mb-2 text-sm op-70>
        Required input types
      </div>
      <div mb-4 flex flex-wrap gap-4>
        <NCheckbox
          v-for="modality of modalityOptions"
          :key="modality.value"
          :checked="requiredModalities.includes(modality.value as Modality)"
          @update:checked="toggleModality(modality.value as Modality)"
        >
          {{ modality.label }}
        </NCheckbox>
      </div>

      <div mb-2 text-sm op-70>
        Restrict to providers (leave empty for all)
      </div>
      <div flex flex-wrap gap-4>
        <NCheckbox
          v-for="provider of ['Anthropic', 'Google'] as const"
          :key="provider"
          :checked="selectedProviders.includes(provider)"
          @update:checked="toggleProvider(provider)"
        >
          {{ provider }}
        </NCheckbox>
      </div>
    </c-card>

    <c-card title="Your expected volume" mb-3>
      <div flex flex-wrap gap-3>
        <c-input-text
          v-model:value="inputTokensPerRequest"
          label="Input tokens / request"
          raw-text
          flex-1
        />
        <c-input-text
          v-model:value="outputTokensPerRequest"
          label="Output tokens / request"
          raw-text
          flex-1
        />
        <c-input-text
          v-model:value="requestsPerMonth"
          label="Requests / month"
          raw-text
          flex-1
        />
      </div>
    </c-card>

    <c-alert v-if="result.recommendations.length === 0" title="No model matches those requirements" mb-3>
      Loosen the provider filter, the context window, or the required input types.
    </c-alert>

    <template v-else>
      <c-alert title="How to read this" mb-3>
        {{ result.guidance }}
      </c-alert>

      <c-card
        v-for="(recommendation, rank) of result.recommendations"
        :key="recommendation.model.id"
        mb-3
      >
        <div mb-2 flex flex-wrap items-center gap-2>
          <div text-lg font-bold>
            {{ rank + 1 }}. {{ recommendation.model.name }}
          </div>
          <NTag size="small">
            {{ recommendation.model.provider }}
          </NTag>
          <NTag v-if="rank === 0" type="success" size="small">
            Best match
          </NTag>
          <div ml-auto op-70>
            {{ Math.round((recommendation.score / topScore) * 100) }}% match
          </div>
        </div>

        <div mb-3 op-80>
          <code>{{ recommendation.model.id }}</code>
        </div>

        <ul mb-3 pl-5 op-80>
          <li v-for="reason of recommendation.reasons" :key="reason" mb-1>
            {{ reason }}
          </li>
        </ul>

        <div flex flex-wrap gap-6>
          <div>
            <div text-sm op-60>
              Cost per request
            </div>
            <div text-lg font-bold>
              {{ formatCost(recommendation.costPerRequest) }}
            </div>
          </div>
          <div>
            <div text-sm op-60>
              Estimated monthly cost
            </div>
            <div text-lg font-bold>
              {{ formatCost(recommendation.monthlyCost) }}
            </div>
          </div>
        </div>

        <div mt-3>
          <c-link :href="recommendation.model.docsUrl" target="_blank" rel="noopener noreferrer">
            Provider model documentation
          </c-link>
        </div>
      </c-card>
    </template>

    <c-card v-if="result.excluded.length > 0" title="Ruled out" mb-3>
      <div v-for="{ model, reason } of result.excluded" :key="model.id" mb-1 op-70>
        <strong>{{ model.name }}</strong> - {{ reason }}
      </div>
    </c-card>

    <c-alert title="Estimates only">
      Prices and capability ratings were last reviewed on {{ CATALOG_UPDATED_AT }} and change often. The cost figures
      ignore prompt caching and batch discounts, which routinely cut a real bill by far more than the gap between two
      neighbouring models. Confirm current pricing with the provider before committing to a model.
    </c-alert>
  </div>
</template>
