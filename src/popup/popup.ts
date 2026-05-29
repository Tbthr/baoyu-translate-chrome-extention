import { MSG, type WorkerInbound } from '../shared/messages';
import { PRESET_PROVIDERS } from '../shared/constants';
import type { ProviderConfig, TranslationMode } from '../shared/types';

let currentMode: TranslationMode = 'normal';
let currentProvider: ProviderConfig | null = null;
let isTranslating = false;
let isTranslated = false;
let confirmRetranslate = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

document.addEventListener('DOMContentLoaded', async () => {
  setupSegmentedControl();
  setupProviderDropdown();
  setupMoreSettings();
  setupApiKeyToggle();
  setupTranslateButton();

  const mode = await sendMessage({ type: MSG.GET_LAST_MODE });
  if (mode) setMode(mode as TranslationMode);

  const config = await sendMessage({ type: MSG.GET_PROVIDER_CONFIG });
  if (config) applyProviderConfig(config as ProviderConfig);
  else renderProviderDropdown();

  const moreOpen = await chrome.storage.sync.get('more_settings_open');
  if (moreOpen.more_settings_open) toggleMoreSettings(true);

  // Check if page already has translation
  await checkExistingTranslation();
});

function sendMessage<T extends WorkerInbound>(message: T): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

function setupSegmentedControl(): void {
  const control = $<HTMLDivElement>('mode-control');
  control.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.seg-btn') as HTMLElement;
    if (!btn?.dataset.mode) return;
    setMode(btn.dataset.mode as TranslationMode);
  });

  control.addEventListener('mouseenter', (e) => {
    const btn = (e.target as HTMLElement).closest('.seg-btn') as HTMLElement;
    if (!btn) return;
    const tooltip = btn.querySelector('.tooltip') as HTMLElement;
    if (!tooltip) return;
    positionTooltip(btn, tooltip);
  }, true);
}

function positionTooltip(btn: HTMLElement, tooltip: HTMLElement): void {
  const POPUP_WIDTH = 320;
  const TOOLTIP_WIDTH = 240;
  const ARROW_WIDTH = 12;
  const PADDING = 8;

  const btnRect = btn.getBoundingClientRect();
  const btnCenter = btnRect.left + btnRect.width / 2;

  let tooltipLeft = btnCenter - TOOLTIP_WIDTH / 2;

  if (tooltipLeft < PADDING) tooltipLeft = PADDING;
  if (tooltipLeft + TOOLTIP_WIDTH > POPUP_WIDTH - PADDING) tooltipLeft = POPUP_WIDTH - PADDING - TOOLTIP_WIDTH;

  // Convert from viewport-relative to btn-relative
  const relativeLeft = tooltipLeft - btnRect.left;
  tooltip.style.left = `${relativeLeft}px`;

  const arrowLeft = btnCenter - tooltipLeft - ARROW_WIDTH / 2;
  tooltip.style.setProperty('--arrow-left', `${Math.max(ARROW_WIDTH, Math.min(TOOLTIP_WIDTH - ARROW_WIDTH, arrowLeft))}px`);
}

function setMode(mode: TranslationMode): void {
  currentMode = mode;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
  const target = document.querySelector(`.seg-btn[data-mode="${mode}"]`);
  if (target) target.classList.add('active');
  sendMessage({ type: MSG.SAVE_LAST_MODE, mode });
}

function setupProviderDropdown(): void {
  const trigger = $<HTMLDivElement>('select-trigger');
  const dropdown = $<HTMLDivElement>('provider-dropdown');

  trigger.addEventListener('click', () => {
    trigger.classList.toggle('open');
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.custom-select')) {
      trigger.classList.remove('open');
      dropdown.classList.remove('open');
    }
  });

  renderProviderDropdown();
}

function renderProviderDropdown(): void {
  const dropdown = $<HTMLDivElement>('provider-dropdown');
  dropdown.innerHTML = '';

  PRESET_PROVIDERS.forEach((p, i) => {
    if (i === PRESET_PROVIDERS.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'select-divider';
      dropdown.appendChild(divider);
    }

    const option = document.createElement('div');
    option.className = 'select-option' + (currentProvider?.id === p.id ? ' selected' : '');
    option.innerHTML = `
      <span class="option-dot" style="background:${p.color}"></span>
      <div class="option-info">
        <div class="option-name">${p.name}</div>
        <div class="option-url">${p.baseUrl ? new URL(p.baseUrl).hostname : '手动配置 Base URL 和 Model'}</div>
      </div>
      <svg class="option-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 8.5l3.5 3.5 6.5-7"/>
      </svg>
    `;
    option.addEventListener('click', () => selectProvider(p));
    dropdown.appendChild(option);
  });
}

function selectProvider(preset: typeof PRESET_PROVIDERS[number]): void {
  const trigger = $<HTMLDivElement>('select-trigger');
  const dropdown = $<HTMLDivElement>('provider-dropdown');

  // Save current provider's config before switching
  const prevProvider = currentProvider;
  if (prevProvider) {
    const currentBaseUrl = $<HTMLInputElement>('input-base-url').value.trim();
    const currentApiKey = $<HTMLInputElement>('input-api-key').value.trim();
    const currentModel = $<HTMLInputElement>('input-model').value.trim();
    if (currentBaseUrl || currentApiKey || currentModel) {
      const saveConfig: ProviderConfig = {
        id: prevProvider.id,
        name: prevProvider.name,
        baseUrl: currentBaseUrl,
        apiKey: currentApiKey,
        model: currentModel,
        color: prevProvider.color,
      };
      sendMessage({ type: MSG.SAVE_PROVIDER_CONFIG, config: saveConfig });
    }
  }

  // Try to load saved config for the new provider
  sendMessage({ type: MSG.GET_PROVIDER_CONFIG_BY_ID, providerId: preset.id }).then((saved) => {
    const config = saved as ProviderConfig | null;
    $<HTMLSpanElement>('trigger-dot').style.background = preset.color;
    $<HTMLSpanElement>('trigger-name').textContent = preset.name;
    $<HTMLSpanElement>('trigger-model').textContent = config?.model || preset.model;

    $<HTMLInputElement>('input-base-url').value = config?.baseUrl || preset.baseUrl;
    $<HTMLInputElement>('input-api-key').value = config?.apiKey || '';
    $<HTMLInputElement>('input-model').value = config?.model || preset.model;

    currentProvider = config || { id: preset.id, name: preset.name, baseUrl: preset.baseUrl, apiKey: '', model: preset.model, color: preset.color };

    if (preset.id === 'custom') {
      toggleMoreSettings(true);
    }

    renderProviderDropdown();
  });

  trigger.classList.remove('open');
  dropdown.classList.remove('open');
}

function applyProviderConfig(config: ProviderConfig): void {
  currentProvider = config;
  $<HTMLSpanElement>('trigger-dot').style.background = config.color;
  $<HTMLSpanElement>('trigger-name').textContent = config.name;
  $<HTMLSpanElement>('trigger-model').textContent = config.model;
  $<HTMLInputElement>('input-base-url').value = config.baseUrl;
  $<HTMLInputElement>('input-api-key').value = config.apiKey;
  $<HTMLInputElement>('input-model').value = config.model;
  renderProviderDropdown();
}

function setupMoreSettings(): void {
  $<HTMLButtonElement>('more-toggle').addEventListener('click', () => {
    const settings = $<HTMLDivElement>('more-settings');
    const isOpen = settings.classList.contains('open');
    toggleMoreSettings(!isOpen);
  });
}

function toggleMoreSettings(open: boolean): void {
  $<HTMLDivElement>('more-settings').classList.toggle('open', open);
  $<HTMLButtonElement>('more-toggle').classList.toggle('open', open);
  chrome.storage.sync.set({ more_settings_open: open });
}

function setupApiKeyToggle(): void {
  $<HTMLButtonElement>('eye-btn').addEventListener('click', () => {
    const input = $<HTMLInputElement>('input-api-key');
    const icon = document.getElementById('eye-icon')!;
    if (input.type === 'password') {
      input.type = 'text';
      icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    } else {
      input.type = 'password';
      icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  });

  // Save config on input change
  ['input-base-url', 'input-api-key', 'input-model'].forEach((id) => {
    $<HTMLInputElement>(id).addEventListener('change', saveCurrentConfig);
  });
}

function saveCurrentConfig(): void {
  const baseUrl = $<HTMLInputElement>('input-base-url').value.trim();
  const apiKey = $<HTMLInputElement>('input-api-key').value.trim();
  const model = $<HTMLInputElement>('input-model').value.trim();

  const selectedId = currentProvider?.id ?? 'custom';
  const preset = PRESET_PROVIDERS.find((p) => p.id === selectedId) ?? PRESET_PROVIDERS[PRESET_PROVIDERS.length - 1];

  const config: ProviderConfig = {
    id: preset.id,
    name: preset.name,
    baseUrl,
    apiKey,
    model,
    color: preset.color,
  };

  sendMessage({ type: MSG.SAVE_PROVIDER_CONFIG, config });
  currentProvider = config;
}

function setupTranslateButton(): void {
  const btn = $<HTMLButtonElement>('translate-btn');
  btn.addEventListener('click', async () => {
    if (isTranslating) return;

    if (isTranslated && !confirmRetranslate) {
      confirmRetranslate = true;
      btn.textContent = '确认重新翻译？';
      btn.classList.add('translated');
      setTimeout(() => {
        confirmRetranslate = false;
        btn.textContent = '重新翻译';
      }, 3000);
      return;
    }

    confirmRetranslate = false;

    const apiKey = $<HTMLInputElement>('input-api-key').value.trim();
    if (!apiKey) {
      toggleMoreSettings(true);
      $<HTMLInputElement>('input-api-key').focus();
      return;
    }

    saveCurrentConfig();
    setTranslating(true);
    btn.textContent = '翻译中...';

    const response = await sendMessage({ type: MSG.START_TRANSLATION, mode: currentMode });
    if (response && typeof response === 'object' && 'error' in response) {
      setStatus('error', (response as { error: string }).error);
      setTranslating(false);
      btn.textContent = '翻译';
    } else {
      // Translation started successfully
      isTranslated = false;
    }
  });
}

async function checkExistingTranslation(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const taskStatus = await sendMessage({ type: MSG.GET_TASK_STATUS, url: tab.url });
  if (taskStatus && typeof taskStatus === 'object' && taskStatus !== null) {
    const task = taskStatus as { status?: string };
    if (task.status === 'completed') {
      setTranslatedState();
    } else if (task.status === 'pending' || task.status === 'analyzing' || task.status === 'translating' || task.status === 'reviewing' || task.status === 'polishing') {
      setTranslating(true);
      $<HTMLButtonElement>('translate-btn').textContent = '翻译中...';
    }
  }
}

function setTranslatedState(): void {
  isTranslated = true;
  const btn = $<HTMLButtonElement>('translate-btn');
  btn.textContent = '重新翻译';
  btn.classList.add('translated');
  btn.disabled = false;
}

function setTranslating(val: boolean): void {
  isTranslating = val;
  const btn = $<HTMLButtonElement>('translate-btn');
  const dot = $<HTMLSpanElement>('status-dot');
  const text = $<HTMLSpanElement>('status-text');

  if (val) {
    btn.classList.add('translating');
    btn.disabled = true;
    dot.className = 'status-dot working';
    text.textContent = '翻译中...';
  } else {
    btn.classList.remove('translating');
    btn.disabled = false;
    dot.className = 'status-dot ready';
  }
}

function setStatus(type: string, message: string): void {
  const dot = $<HTMLSpanElement>('status-dot');
  const text = $<HTMLSpanElement>('status-text');
  text.textContent = message;
  if (type === 'error') {
    dot.className = 'status-dot';
    dot.style.background = '#ef4444';
  }
}

export {};