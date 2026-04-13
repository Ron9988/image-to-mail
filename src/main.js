/**
 * 图片打包助手 - 前端核心逻辑
 * 功能：视图切换、设置管理、图片选择/预览/压缩、邮件发送
 */
import './style.css';

// ===== 全局状态 =====
const state = {
  currentView: 'settings',   // 当前视图: settings | pack | gallery | success
  images: [],                 // 已选图片 [{ file, name, preview, compressedData, compressedSize }]
  settings: {
    senderEmail: '',
    appPassword: '',
    recipientEmail: '',
  },
  isSending: false,           // 发送中状态
};

// ===== DOM 元素缓存 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  // 视图容器
  viewSettings: $('#view-settings'),
  viewPack: $('#view-pack'),
  viewGallery: $('#view-gallery'),
  viewSuccess: $('#view-success'),

  // 顶部导航
  btnHeaderSettings: $('#btn-header-settings'),

  // 设置表单
  settingsForm: $('#settings-form'),
  inputSender: $('#input-sender'),
  inputPassword: $('#input-password'),
  inputRecipient: $('#input-recipient'),

  // 打包视图
  uploadArea: $('#upload-area'),
  fileInput: $('#file-input'),
  previewSection: $('#preview-section'),
  previewCount: $('#preview-count'),
  previewGrid: $('#preview-grid'),
  btnClearAll: $('#btn-clear-all'),
  sizeInfo: $('#size-info'),

  // 邮件配置
  emailSection: $('#email-section'),
  inputSubject: $('#input-subject'),
  previewRecipient: $('#preview-recipient'),
  previewBadge: $('#preview-badge'),

  // 发送按钮
  sendBar: $('#send-bar'),
  btnSend: $('#btn-send'),
  sendIcon: $('#send-icon'),
  sendText: $('#send-text'),

  // 成功视图
  successDesc: $('#success-desc'),
  successSize: $('#success-size'),
  successCount: $('#success-count'),
  successRecipient: $('#success-recipient'),
  btnSendMore: $('#btn-send-more'),

  // Toast
  successToast: $('#success-toast'),

  // PWA 提示
  pwaHint: $('#pwa-hint'),

  // 底部导航
  navTabs: $$('.nav-tab'),
};

// ===== 设置管理 =====

/** 从 localStorage 加载设置 */
function loadSettings() {
  try {
    const saved = localStorage.getItem('image-mailer-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
      els.inputSender.value = state.settings.senderEmail || '';
      els.inputPassword.value = state.settings.appPassword || '';
      els.inputRecipient.value = state.settings.recipientEmail || '';
    }
  } catch (e) {
    console.warn('加载设置失败:', e);
  }
}

/** 保存设置到 localStorage */
function saveSettings() {
  state.settings.senderEmail = els.inputSender.value.trim();
  state.settings.appPassword = els.inputPassword.value.trim();
  state.settings.recipientEmail = els.inputRecipient.value.trim();
  localStorage.setItem('image-mailer-settings', JSON.stringify(state.settings));
}

/** 检查设置是否完整 */
function isSettingsComplete() {
  return state.settings.senderEmail && state.settings.appPassword && state.settings.recipientEmail;
}

// ===== 视图切换 =====

/** 切换到指定视图 */
function switchView(viewName) {
  state.currentView = viewName;

  // 隐藏所有视图
  const views = [els.viewSettings, els.viewPack, els.viewGallery, els.viewSuccess];
  views.forEach((v) => v.classList.remove('active'));

  // 显示目标视图
  const targetView = {
    settings: els.viewSettings,
    pack: els.viewPack,
    gallery: els.viewGallery,
    success: els.viewSuccess,
  }[viewName];
  if (targetView) targetView.classList.add('active');

  // 更新底部导航激活状态
  els.navTabs.forEach((tab) => {
    const tabView = tab.dataset.view;
    if (tabView === viewName || (viewName === 'success' && tabView === 'pack')) {
      tab.classList.remove('text-zinc-400');
      tab.classList.add('bg-emerald-50', 'text-emerald-700', 'rounded-2xl');
      // 激活图标填充
      const icon = tab.querySelector('.material-symbols-outlined');
      if (icon) icon.style.fontVariationSettings = "'FILL' 1";
    } else {
      tab.classList.add('text-zinc-400');
      tab.classList.remove('bg-emerald-50', 'text-emerald-700', 'rounded-2xl');
      const icon = tab.querySelector('.material-symbols-outlined');
      if (icon) icon.style.fontVariationSettings = "'FILL' 0";
    }
  });

  // 发送按钮只在打包视图且有图片时显示
  const showSendBar = viewName === 'pack' && state.images.length > 0;
  els.sendBar.classList.toggle('hidden', !showSendBar);

  // 更新打包视图中的邮件预览信息
  if (viewName === 'pack') {
    updateEmailPreview();
  }
}

// ===== 图片管理 =====

/** 图片压缩 - 使用 Canvas 缩放 + 降低 JPEG 质量 */
function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // 等比缩放
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 导出为 JPEG
        const compressedData = canvas.toDataURL('image/jpeg', quality);
        // 估算压缩后大小（Base64 约为原始数据的 4/3）
        const compressedSize = Math.round(((compressedData.length - 23) * 3) / 4);

        resolve({
          name: file.name.replace(/\.[^.]+$/, '.jpg'),
          compressedData,
          compressedSize,
        });
      };
      img.onerror = () => reject(new Error(`加载图片失败: ${file.name}`));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** 处理图片选择事件 */
async function handleImageSelect(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    // 跳过非图片文件
    if (!file.type.startsWith('image/')) continue;

    try {
      // 创建预览 URL
      const preview = URL.createObjectURL(file);
      // 压缩图片
      const compressed = await compressImage(file);

      state.images.push({
        file,
        name: compressed.name,
        preview,
        compressedData: compressed.compressedData,
        compressedSize: compressed.compressedSize,
      });
    } catch (err) {
      console.error('处理图片出错:', err);
    }
  }

  // 清空 input 以允许重复选择相同文件
  event.target.value = '';
  updatePreviewUI();
}

/** 删除单张图片 */
function removeImage(index) {
  if (index >= 0 && index < state.images.length) {
    // 释放预览 URL
    URL.revokeObjectURL(state.images[index].preview);
    state.images.splice(index, 1);
    updatePreviewUI();
  }
}

/** 清空所有图片 */
function clearAllImages() {
  state.images.forEach((img) => URL.revokeObjectURL(img.preview));
  state.images = [];
  updatePreviewUI();
}

/** 更新预览区 UI */
function updatePreviewUI() {
  const count = state.images.length;
  const hasImages = count > 0;

  // 显示/隐藏预览相关区域
  els.previewSection.classList.toggle('hidden', !hasImages);
  els.emailSection.classList.toggle('hidden', !hasImages);
  els.sendBar.classList.toggle('hidden', !hasImages || state.currentView !== 'pack');

  // 更新计数
  els.previewCount.textContent = `已选择 ${count} 张图片`;
  els.previewBadge.textContent = `${count} 张图片`;

  // 计算总大小
  const totalSize = state.images.reduce((sum, img) => sum + img.compressedSize, 0);
  els.sizeInfo.textContent = `预计压缩后大小：${formatSize(totalSize)}`;

  // 更新默认邮件主题
  if (!els.inputSubject.value || els.inputSubject.dataset.autoFilled === 'true') {
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    els.inputSubject.value = `图片分享 - ${dateStr}`;
    els.inputSubject.dataset.autoFilled = 'true';
  }

  // 渲染图片网格
  renderPreviewGrid();
}

/** 渲染图片预览网格 */
function renderPreviewGrid() {
  const grid = els.previewGrid;
  grid.innerHTML = '';

  state.images.forEach((img, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item relative aspect-square overflow-hidden rounded-2xl bg-surface-container-high group';

    item.innerHTML = `
      <img src="${img.preview}" alt="${img.name}"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      <button data-index="${index}"
        class="btn-remove absolute top-2 right-2 w-7 h-7 bg-black/20 backdrop-blur-md rounded-full text-white flex items-center justify-center hover:bg-red-500 transition-colors">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-2">
        <p class="text-white text-[10px] truncate">${img.name}</p>
      </div>
    `;

    grid.appendChild(item);
  });
}

/** 更新邮件预览信息 */
function updateEmailPreview() {
  els.previewRecipient.textContent = state.settings.recipientEmail || '未配置';
}

// ===== 发送功能 =====

/** 执行发送 */
async function sendImages() {
  // 校验
  if (!isSettingsComplete()) {
    showError('请先完成发件设置');
    switchView('settings');
    return;
  }
  if (state.images.length === 0) {
    showError('请至少选择一张图片');
    return;
  }
  const subject = els.inputSubject.value.trim();
  if (!subject) {
    showError('请填写邮件主题');
    els.inputSubject.focus();
    return;
  }

  // 进入发送状态
  state.isSending = true;
  updateSendButton(true);

  try {
    // 构建请求数据
    const payload = {
      senderEmail: state.settings.senderEmail,
      appPassword: state.settings.appPassword,
      recipientEmail: state.settings.recipientEmail,
      subject: subject,
      images: state.images.map((img) => ({
        name: img.name,
        data: img.compressedData,
      })),
    };

    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || '发送失败，请重试');
    }

    // 发送成功
    showSuccessView();
  } catch (err) {
    console.error('发送失败:', err);
    showError(err.message || '网络错误，请检查连接后重试');
  } finally {
    state.isSending = false;
    updateSendButton(false);
  }
}

/** 更新发送按钮状态 */
function updateSendButton(loading) {
  els.btnSend.disabled = loading;
  if (loading) {
    els.sendIcon.textContent = 'progress_activity';
    els.sendIcon.classList.add('spinner');
    els.sendText.textContent = '正在发送...';
  } else {
    els.sendIcon.textContent = 'send';
    els.sendIcon.classList.remove('spinner');
    els.sendText.textContent = '一键打包并发送';
  }
}

/** 显示成功视图 */
function showSuccessView() {
  // 显示 Toast
  showToast();

  // 填充成功页面数据
  const totalSize = state.images.reduce((sum, img) => sum + img.compressedSize, 0);
  els.successDesc.textContent = `您的 ${state.images.length} 张图片已压缩并成功发送至预设邮箱。请查收。`;
  els.successSize.textContent = formatSize(totalSize);
  els.successCount.textContent = `${state.images.length} Pcs`;
  els.successRecipient.textContent = state.settings.recipientEmail;

  // 清空已选图片
  clearAllImages();
  // 重置邮件主题为自动填充
  els.inputSubject.dataset.autoFilled = 'true';

  // 切换到成功视图
  switchView('success');
}

/** 显示错误提示 */
function showError(message) {
  // 使用简单的 alert，后续可改为自定义 toast
  alert(message);
}

/** 显示成功 Toast */
function showToast() {
  const toast = els.successToast;
  toast.classList.remove('hidden');
  toast.firstElementChild.classList.remove('toast-exit');
  toast.firstElementChild.classList.add('toast-enter');

  setTimeout(() => {
    toast.firstElementChild.classList.remove('toast-enter');
    toast.firstElementChild.classList.add('toast-exit');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}

// ===== PWA 支持 =====

/** 注册 Service Worker */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker 注册失败:', err);
    });
  }
}

/** 监听"添加到主屏幕"事件 */
let deferredPrompt = null;
function setupPWAPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // 显示提示
    if (els.pwaHint) {
      els.pwaHint.classList.remove('hidden');
    }
  });
}

// ===== 工具函数 =====

/** 格式化文件大小 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ===== 事件绑定 =====

function bindEvents() {
  // 底部导航切换
  els.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (view) switchView(view);
    });
  });

  // 顶部设置按钮
  els.btnHeaderSettings.addEventListener('click', () => switchView('settings'));

  // 设置表单提交
  els.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
    // 切换到打包视图
    switchView('pack');
  });

  // 图片选择
  els.fileInput.addEventListener('change', handleImageSelect);

  // 拖拽上传（桌面端增强）
  const uploadDiv = els.uploadArea.querySelector('div');
  uploadDiv.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDiv.classList.add('drag-over');
  });
  uploadDiv.addEventListener('dragleave', () => {
    uploadDiv.classList.remove('drag-over');
  });
  uploadDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDiv.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length) {
      // 手动触发处理
      handleImageSelect({ target: { files }, preventDefault: () => {} });
    }
  });

  // 清空全部图片
  els.btnClearAll.addEventListener('click', clearAllImages);

  // 删除单张图片（事件委托）
  els.previewGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove');
    if (btn) {
      const index = parseInt(btn.dataset.index, 10);
      removeImage(index);
    }
  });

  // 邮件主题输入时取消自动填充标记
  els.inputSubject.addEventListener('input', () => {
    els.inputSubject.dataset.autoFilled = 'false';
  });

  // 发送按钮
  els.btnSend.addEventListener('click', sendImages);

  // 成功页-继续发送
  els.btnSendMore.addEventListener('click', () => switchView('pack'));
}

// ===== 初始化 =====

function init() {
  // 加载设置
  loadSettings();

  // 绑定事件
  bindEvents();

  // 注册 Service Worker
  registerServiceWorker();

  // PWA 提示
  setupPWAPrompt();

  // 根据设置状态决定初始视图
  if (isSettingsComplete()) {
    switchView('pack');
  } else {
    switchView('settings');
  }
}

// 启动应用
init();
