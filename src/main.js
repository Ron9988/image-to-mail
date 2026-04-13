/**
 * 图片打包助手 - 前端核心逻辑
 * 功能：视图切换、设置管理、图片选择/预览/压缩、邮件发送
 */
import './style.css';

// ===== 全局状态 =====
const state = {
  currentView: 'settings',   // 当前视图: settings | pack | gallery | success
  images: [],
  settings: {
    provider: 'gmail',
    senderEmail: '',
    appPassword: '',
    recipientEmail: '',
  },
  defaults: { subject: '', body: '' }, // 用户保存的默认主题/正文
  history: [],
  sentFingerprints: new Set(),
  isSending: false,
};

// 常量
const MAX_IMAGES = 15;
const MAX_PAYLOAD_BYTES = 4.2 * 1024 * 1024; // 4.2MB安全上限（Vercel 硬限制 4.5MB，预留 multipart 开销）
const SENT_FP_KEY = 'image-mailer-sent-fps';

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
  inputProvider: $('#input-provider'),
  inputSender: $('#input-sender'),
  inputPassword: $('#input-password'),
  inputRecipient: $('#input-recipient'),
  labelPassword: $('#label-password'),
  btnAuthHelp: $('#btn-auth-help'),
  authHelpPanel: $('#auth-help-panel'),
  authHelpContent: $('#auth-help-content'),

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
  inputBody: $('#input-body'),
  previewRecipient: $('#preview-recipient'),
  previewBadge: $('#preview-badge'),
  previewBody: $('#preview-body'),

  // 设置增强
  btnTogglePassword: $('#btn-toggle-password'),
  btnClearSettings: $('#btn-clear-settings'),
  chkDefaultSubject: $('#chk-default-subject'),
  chkDefaultBody: $('#chk-default-body'),
  btnClearSent: $('#btn-clear-sent'),

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

  // 发送历史
  historyList: $('#history-list'),
  historyEmpty: $('#history-empty'),
  btnClearHistory: $('#btn-clear-history'),
};

// ===== 邮箱服务商配置 =====

const PROVIDERS = {
  gmail:   { label: 'Gmail',            host: 'smtp.gmail.com',       port: 587, needsAppPassword: true,  placeholder: 'abcd efgh ijkl mnop' },
  outlook: { label: 'Outlook / Hotmail', host: 'smtp.office365.com',   port: 587, needsAppPassword: false, placeholder: '您的登录密码' },
  yahoo:   { label: 'Yahoo Mail',        host: 'smtp.mail.yahoo.com',  port: 587, needsAppPassword: true,  placeholder: '应用专用密码' },
  icloud:  { label: 'iCloud Mail',       host: 'smtp.mail.me.com',     port: 587, needsAppPassword: true,  placeholder: '应用专用密码' },
  zoho:    { label: 'Zoho Mail',         host: 'smtp.zoho.com',        port: 587, needsAppPassword: false, placeholder: '您的登录密码' },
};

const AUTH_HELP = {
  gmail: `<p class="font-bold text-on-surface mb-1">📧 Gmail 授权码获取步骤：</p>
<ol class="list-decimal pl-4 space-y-1">
<li>打开 <a href="https://myaccount.google.com/security" target="_blank" class="text-primary underline">Google 账号安全性</a></li>
<li>确保已开启<strong>“两步验证”</strong></li>
<li>搜索“应用专用密码” → 点击生成</li>
<li>应用名称填“图片打包助手” → 点击创建</li>
<li>复制生成的 <strong>16 位密码</strong>粘贴到上方输入框</li>
</ol>`,
  outlook: `<p class="font-bold text-on-surface mb-1">📧 Outlook / Hotmail：</p>
<p class="text-emerald-700 font-semibold">✅ 无需授权码！直接输入您的登录密码即可。</p>
<p class="mt-1 text-on-surface-variant">如果开启了两步验证，请在 <a href="https://account.live.com/proofs/AppPassword" target="_blank" class="text-primary underline">Microsoft 账号</a> 中生成应用密码。</p>`,
  yahoo: `<p class="font-bold text-on-surface mb-1">📧 Yahoo Mail 授权码获取步骤：</p>
<ol class="list-decimal pl-4 space-y-1">
<li>登录 Yahoo → 点击头像 → “账号信息”</li>
<li>进入“账号安全” → “生成应用专用密码”</li>
<li>应用名称选“其他应用”，输入“图片打包助手”</li>
<li>复制密码粘贴到上方输入框</li>
</ol>`,
  icloud: `<p class="font-bold text-on-surface mb-1">📧 iCloud Mail 授权码获取步骤：</p>
<ol class="list-decimal pl-4 space-y-1">
<li>打开 <a href="https://appleid.apple.com/account/manage" target="_blank" class="text-primary underline">Apple ID 管理页面</a></li>
<li>登录后进入“安全”部分</li>
<li>点击“生成应用专用密码”</li>
<li>输入标签“图片打包助手” → 创建</li>
<li>复制密码粘贴到上方输入框</li>
</ol>`,
  zoho: `<p class="font-bold text-on-surface mb-1">📧 Zoho Mail：</p>
<p class="text-emerald-700 font-semibold">✅ 无需授权码！直接输入您的登录密码即可。</p>
<p class="mt-1 text-on-surface-variant">注意：需要先在 Zoho Mail 设置中开启 IMAP/SMTP 访问。</p>`,
};

// ===== 设置管理 =====

/** 从 localStorage 加载设置 */
function loadSettings() {
  try {
    const saved = localStorage.getItem('image-mailer-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
      els.inputProvider.value = state.settings.provider || 'gmail';
      els.inputSender.value = state.settings.senderEmail || '';
      els.inputPassword.value = state.settings.appPassword || '';
      els.inputRecipient.value = state.settings.recipientEmail || '';
      updateProviderUI();
    }
    // 加载默认主题/正文
    const defaults = localStorage.getItem('image-mailer-defaults');
    if (defaults) {
      state.defaults = JSON.parse(defaults);
    }
  } catch (e) {
    console.warn('加载设置失败:', e);
  }
}

/** 保存设置到 localStorage */
function saveSettings() {
  state.settings.provider = els.inputProvider.value;
  state.settings.senderEmail = els.inputSender.value.trim();
  state.settings.appPassword = els.inputPassword.value.trim();
  state.settings.recipientEmail = els.inputRecipient.value.trim();
  localStorage.setItem('image-mailer-settings', JSON.stringify(state.settings));
}

/** 检查设置是否完整 */
function isSettingsComplete() {
  return state.settings.senderEmail && state.settings.appPassword && state.settings.recipientEmail;
}

/** 清除所有设置 */
function clearSettings() {
  if (!confirm('确定清除所有设置？这将删除您保存的邮箱地址、授权码和收件人信息。')) return;
  state.settings = { provider: 'gmail', senderEmail: '', appPassword: '', recipientEmail: '' };
  localStorage.removeItem('image-mailer-settings');
  els.inputProvider.value = 'gmail';
  els.inputSender.value = '';
  els.inputPassword.value = '';
  els.inputRecipient.value = '';
  updateProviderUI();
  showToastMessage('设置已清除');
}

/** 更新邮箱服务商 UI（密码标签、帮助内容、占位符） */
function updateProviderUI() {
  const provider = els.inputProvider.value;
  const config = PROVIDERS[provider];
  if (!config) return;

  // 更新密码标签
  els.labelPassword.textContent = config.needsAppPassword ? '应用授权码' : '登录密码';
  els.inputPassword.placeholder = config.placeholder;

  // 更新帮助内容
  els.authHelpContent.innerHTML = AUTH_HELP[provider] || '';
}

/** 根据复选框状态保存默认内容（发送成功时调用） */
function saveDefaultsIfChecked() {
  let saved = false;
  if (els.chkDefaultSubject.checked) {
    state.defaults.subject = els.inputSubject.value.trim();
    saved = true;
  }
  if (els.chkDefaultBody.checked) {
    state.defaults.body = els.inputBody.value.trim();
    saved = true;
  }
  if (saved) {
    localStorage.setItem('image-mailer-defaults', JSON.stringify(state.defaults));
  }
}

/** 生成带日期时间的默认正文 */
function generateDefaultBody() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return state.defaults.body || `请查收附件中的图片。\n发送时间：${dateStr}`;
}

/** 切换授权码明文/密文 */
function togglePasswordVisibility() {
  const input = els.inputPassword;
  const icon = els.btnTogglePassword.querySelector('.material-symbols-outlined');
  if (input.type === 'password') {
    input.type = 'text';
    icon.textContent = 'visibility_off';
  } else {
    input.type = 'password';
    icon.textContent = 'visibility';
  }
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

  // 切换到历史视图时渲染历史列表
  if (viewName === 'gallery') {
    renderHistoryList();
  }
}

// ===== 图片管理 =====

/** 图片压缩 - 使用 Canvas 缩放 + 降低 JPEG 质量 */
function compressImage(file, maxWidth = 1280, quality = 0.6) {
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

/** 生成图片指纹（文件名 + 大小 + 修改时间） */
function getFileFingerprint(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/** 从 localStorage 加载已发送指纹 */
function loadSentFingerprints() {
  try {
    const saved = localStorage.getItem(SENT_FP_KEY);
    state.sentFingerprints = saved ? new Set(JSON.parse(saved)) : new Set();
  } catch (e) {
    state.sentFingerprints = new Set();
  }
}

/** 保存已发送指纹到 localStorage（最多保留 200 条） */
function saveSentFingerprints() {
  const arr = Array.from(state.sentFingerprints);
  // 限制总数，保留最新的
  if (arr.length > 200) {
    state.sentFingerprints = new Set(arr.slice(-200));
  }
  localStorage.setItem(SENT_FP_KEY, JSON.stringify(Array.from(state.sentFingerprints)));
}

/** 处理图片选择事件 */
async function handleImageSelect(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  // 检查数量上限
  const remaining = MAX_IMAGES - state.images.length;
  if (remaining <= 0) {
    showError(`最多只能选择 ${MAX_IMAGES} 张图片`);
    event.target.value = '';
    return;
  }

  // 按文件时间排序（最新的在前）
  const sortedFiles = files
    .filter((f) => f.type.startsWith('image/'))
    .sort((a, b) => b.lastModified - a.lastModified);

  let addedCount = 0;
  let skippedSent = 0;

  for (const file of sortedFiles) {
    if (state.images.length >= MAX_IMAGES) {
      break;
    }

    // 检查是否已发送过
    const fp = getFileFingerprint(file);
    const alreadySent = state.sentFingerprints.has(fp);

    try {
      const preview = URL.createObjectURL(file);
      const compressed = await compressImage(file);

      state.images.push({
        file,
        name: compressed.name,
        preview,
        compressedData: compressed.compressedData,
        compressedSize: compressed.compressedSize,
        fingerprint: fp,
        lastModified: file.lastModified,
        alreadySent: alreadySent,
      });
      addedCount++;
    } catch (err) {
      console.error('处理图片出错:', err);
    }
  }

  // 提示信息
  const totalSelected = sortedFiles.length;
  const sentCount = state.images.filter((img) => img.alreadySent).length;
  if (addedCount < totalSelected) {
    const skipped = totalSelected - addedCount;
    showError(`已添加 ${addedCount} 张，跳过 ${skipped} 张（最多 ${MAX_IMAGES} 张）`);
  }
  if (sentCount > 0) {
    showError(`检测到 ${sentCount} 张图片已发送过，发送时将自动跳过。可点击“清除已发送”移除它们。`);
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

/** 清除已发送的图片（保留未发送的） */
function clearSentImages() {
  const sentImages = state.images.filter((img) => img.alreadySent);
  sentImages.forEach((img) => URL.revokeObjectURL(img.preview));
  state.images = state.images.filter((img) => !img.alreadySent);
  updatePreviewUI();
  showToastMessage(`已清除 ${sentImages.length} 张已发送图片`);
}

/** 更新预览区 UI */
function updatePreviewUI() {
  const count = state.images.length;
  const hasImages = count > 0;

  // 显示/隐藏预览相关区域
  els.previewSection.classList.toggle('hidden', !hasImages);
  els.emailSection.classList.toggle('hidden', !hasImages);
  els.sendBar.classList.toggle('hidden', !hasImages || state.currentView !== 'pack');

  // 统计已发送和未发送数量
  const sentCount = state.images.filter((img) => img.alreadySent).length;
  const newCount = count - sentCount;

  // 更新计数
  els.previewCount.textContent = sentCount > 0
    ? `已选 ${count} 张（${newCount} 张未发送，${sentCount} 张已发送）`
    : `已选择 ${count} 张图片（上限 ${MAX_IMAGES} 张）`;
  els.previewBadge.textContent = `${newCount} 张图片`;

  // 显示/隐藏清除已发送按钮
  els.btnClearSent.classList.toggle('hidden', sentCount === 0);

  // 计算总大小（只计算未发送的）
  const totalSize = state.images.filter((img) => !img.alreadySent).reduce((sum, img) => sum + img.compressedSize, 0);
  els.sizeInfo.textContent = `预计压缩后大小：${formatSize(totalSize)}`;

  // 更新默认邮件主题
  if (!els.inputSubject.value || els.inputSubject.dataset.autoFilled === 'true') {
    if (state.defaults.subject) {
      els.inputSubject.value = state.defaults.subject;
    } else {
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      els.inputSubject.value = `图片分享 - ${dateStr}`;
    }
    els.inputSubject.dataset.autoFilled = 'true';
  }

  // 更新默认邮件正文（带日期时间）
  if (!els.inputBody.dataset.userEdited) {
    els.inputBody.value = generateDefaultBody();
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

    // 已发送标记
    const sentBadge = img.alreadySent
      ? `<div class="absolute top-2 left-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-10">已发送</div>`
      : '';

    // 文件时间
    const fileDate = new Date(img.lastModified);
    const timeStr = `${fileDate.getMonth() + 1}/${fileDate.getDate()} ${String(fileDate.getHours()).padStart(2, '0')}:${String(fileDate.getMinutes()).padStart(2, '0')}`;

    item.innerHTML = `
      <img src="${img.preview}" alt="${img.name}"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${img.alreadySent ? 'opacity-60' : ''}" />
      ${sentBadge}
      <button data-index="${index}"
        class="btn-remove absolute top-2 right-2 w-7 h-7 bg-black/20 backdrop-blur-md rounded-full text-white flex items-center justify-center hover:bg-red-500 transition-colors">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-2">
        <p class="text-white text-[10px] truncate">${img.name}</p>
        <p class="text-white/70 text-[9px]">${timeStr}</p>
      </div>
    `;

    grid.appendChild(item);
  });
}

/** 更新邮件预览信息 */
function updateEmailPreview() {
  els.previewRecipient.textContent = state.settings.recipientEmail || '未配置';
  els.previewBody.textContent = els.inputBody.value || '请查收附件中的图片。';
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

  // 过滤已发送图片（严格去重）
  const imagesToSend = state.images.filter((img) => !img.alreadySent);
  if (imagesToSend.length === 0) {
    showError('所有图片都已发送过，请清除已发送图片后重新选择');
    return;
  }

  const subject = els.inputSubject.value.trim();
  if (!subject) {
    showError('请填写邮件主题');
    els.inputSubject.focus();
    return;
  }

  // 发送前检查总大小（只计算未发送的）
  const totalSize = imagesToSend.reduce((sum, img) => sum + img.compressedSize, 0);
  if (totalSize > MAX_PAYLOAD_BYTES) {
    showError(`图片总大小 ${formatSize(totalSize)} 超过 4MB 限制，请减少图片数量后重试`);
    return;
  }

  // 进入发送状态
  state.isSending = true;
  updateSendButton(true);

  try {
    const emailBody = els.inputBody.value.trim() || generateDefaultBody();
    const formData = new FormData();
    formData.append('provider', state.settings.provider || 'gmail');
    formData.append('senderEmail', state.settings.senderEmail);
    formData.append('appPassword', state.settings.appPassword);
    formData.append('recipientEmail', state.settings.recipientEmail);
    formData.append('subject', subject);
    formData.append('body', emailBody);

    // 只打包未发送的图片
    for (const img of imagesToSend) {
      const resp = await fetch(img.compressedData);
      const blob = await resp.blob();
      formData.append('images', blob, img.name);
    }

    const response = await fetch('/api/send', {
      method: 'POST',
      body: formData,
    });

    // 安全解析响应（处理非 JSON 情况）
    let result;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text || `服务器返回错误 (${response.status})`);
    }

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
  showToast();

  // 只统计实际发送的图片（排除已发送的）
  const sentImages = state.images.filter((img) => !img.alreadySent);
  const totalSize = sentImages.reduce((sum, img) => sum + img.compressedSize, 0);

  addHistoryRecord({
    subject: els.inputSubject.value.trim(),
    body: els.inputBody.value.trim(),
    recipient: state.settings.recipientEmail,
    imageCount: sentImages.length,
    totalSize: totalSize,
    timestamp: Date.now(),
  });

  // 记录所有图片指纹（包含新发送的）
  state.images.forEach((img) => {
    if (img.fingerprint) {
      state.sentFingerprints.add(img.fingerprint);
    }
  });
  saveSentFingerprints();

  // 根据复选框保存默认内容
  saveDefaultsIfChecked();

  // 填充成功页面数据
  els.successDesc.textContent = `您的 ${sentImages.length} 张图片已压缩并成功发送至预设邮箱。请查收。`;
  els.successSize.textContent = formatSize(totalSize);
  els.successCount.textContent = `${sentImages.length} Pcs`;
  els.successRecipient.textContent = state.settings.recipientEmail;

  clearAllImages();
  els.inputSubject.dataset.autoFilled = 'true';
  els.inputBody.dataset.userEdited = '';

  switchView('success');
}

/** 显示错误提示 */
function showError(message) {
  // 使用简单的 alert，后续可改为自定义 toast
  alert(message);
}

/** 显示自定义消息 Toast */
function showToastMessage(message) {
  const toast = els.successToast;
  const msgSpan = toast.querySelector('span:last-child');
  const originalText = msgSpan.textContent;
  msgSpan.textContent = message;
  toast.classList.remove('hidden');
  toast.firstElementChild.classList.remove('toast-exit');
  toast.firstElementChild.classList.add('toast-enter');

  setTimeout(() => {
    toast.firstElementChild.classList.remove('toast-enter');
    toast.firstElementChild.classList.add('toast-exit');
    setTimeout(() => {
      toast.classList.add('hidden');
      msgSpan.textContent = originalText;
    }, 300);
  }, 2000);
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

// ===== 发送历史管理 =====

const HISTORY_KEY = 'image-mailer-history';
const MAX_HISTORY = 50;



/** 从 localStorage 加载历史记录 */
function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    state.history = saved ? JSON.parse(saved) : [];
  } catch (e) {
    state.history = [];
  }
}

/** 保存历史记录到 localStorage */
function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
}

/** 添加一条发送记录 */
function addHistoryRecord(record) {
  state.history.unshift(record);
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(0, MAX_HISTORY);
  }
  saveHistory();
}

/** 删除单条历史记录 */
function removeHistoryRecord(index) {
  if (index >= 0 && index < state.history.length) {
    state.history.splice(index, 1);
    saveHistory();
    renderHistoryList();
  }
}

/** 清除所有历史记录 */
function clearAllHistory() {
  if (!confirm('确定清除所有发送记录？此操作不可恢复。')) return;
  state.history = [];
  saveHistory();
  renderHistoryList();
}

/** 渲染历史列表 */
function renderHistoryList() {
  const list = els.historyList;
  const empty = els.historyEmpty;
  const clearBtn = els.btnClearHistory;

  list.innerHTML = '';

  if (state.history.length === 0) {
    empty.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  clearBtn.classList.remove('hidden');

  state.history.forEach((record, index) => {
    const date = new Date(record.timestamp);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl p-4 shadow-sm border border-emerald-100/50 transition-all hover:shadow-md';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-on-surface text-sm truncate">${escapeHtml(record.subject || '无主题')}</h4>
          <p class="text-xs text-on-surface-variant mt-1 truncate">收件人：${escapeHtml(record.recipient)}</p>
          <div class="flex items-center gap-3 mt-2 text-[11px] text-outline">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">image</span>
              ${record.imageCount} 张
            </span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">folder_zip</span>
              ${formatSize(record.totalSize)}
            </span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">schedule</span>
              ${dateStr}
            </span>
          </div>
        </div>
        <button data-history-index="${index}"
          class="btn-delete-history flex-shrink-0 w-8 h-8 flex items-center justify-center text-outline hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          title="删除记录">
          <span class="material-symbols-outlined text-lg">delete</span>
        </button>
      </div>
    `;

    list.appendChild(card);
  });
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
    if (els.pwaHint) {
      els.pwaHint.classList.remove('hidden');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (els.pwaHint) {
      els.pwaHint.classList.add('hidden');
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

/** HTML 转义防止 XSS */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  // 授权码明文切换
  els.btnTogglePassword.addEventListener('click', togglePasswordVisibility);

  // 一键清除设置
  els.btnClearSettings.addEventListener('click', clearSettings);

  // 邮箱类型切换
  els.inputProvider.addEventListener('change', updateProviderUI);

  // 授权码帮助折叠
  els.btnAuthHelp.addEventListener('click', () => {
    els.authHelpPanel.classList.toggle('hidden');
  });

  // 清除已发送图片
  els.btnClearSent.addEventListener('click', clearSentImages);

  // 发送历史 - 单条删除（事件委托）
  els.historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-delete-history');
    if (btn) {
      const index = parseInt(btn.dataset.historyIndex, 10);
      removeHistoryRecord(index);
    }
  });

  // 发送历史 - 清除全部
  els.btnClearHistory.addEventListener('click', clearAllHistory);

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

  // 邮件正文输入时标记为用户编辑并同步预览
  els.inputBody.addEventListener('input', () => {
    els.inputBody.dataset.userEdited = 'true';
    els.previewBody.textContent = els.inputBody.value || '请查收附件中的图片。';
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

  // 加载发送历史
  loadHistory();

  // 加载已发送指纹
  loadSentFingerprints();

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
