# 📸 图片打包助手 (Image-to-Mail)

微信图片一键打包发送到邮箱。

从微信保存图片到手机相册 → 打开网页选图 → 自动打包为 ZIP → 通过 Gmail 发送给收件人。

## 🚀 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ron9988/image-to-mail)

点击上方按钮，使用你的 Vercel 账号登录后自动部署。

## 📋 使用流程

### 第一步：部署（仅需一次）
1. 点击上方 "Deploy with Vercel" 按钮
2. 登录你的 Vercel 账号
3. 等待自动部署完成，获得链接（如 `https://image-to-mail.vercel.app`）

### 第二步：配置（仅需一次）
1. 手机打开部署好的链接
2. 进入"设置"页，填入：
   - 你的 Gmail 邮箱地址
   - Gmail 16位应用授权码（[如何获取？](#获取-gmail-应用授权码)）
   - 收件人邮箱地址
3. 点击"保存并开始使用"

### 第三步：日常使用
1. 微信收到图片 → 保存到手机相册
2. 打开网页 → 选择图片
3. 填写邮件主题 → 点击"一键打包并发送"
4. 收件人收到 `bundle.zip` 附件

## 🔑 获取 Gmail 应用授权码

1. 登录 [Google 账号安全设置](https://myaccount.google.com/security)
2. 确保已开启 **两步验证**
3. 搜索 **应用专用密码** (App Passwords)
4. 选择应用类型 → **邮件**
5. 点击 **生成** → 复制 16 位授权码

> ⚠️ 这不是你的 Gmail 登录密码，而是专门为第三方应用生成的授权码。

## 🔒 安全说明

- Gmail 凭据**仅存储在你的手机浏览器**中（localStorage）
- 后端是无状态的 Serverless Function，**不存储任何凭据**
- 所有通信通过 **HTTPS** 加密传输
- 代码完全开源，可自行审查

## 🛠 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 📁 项目结构

```
├── index.html           # 前端 SPA 页面
├── src/
│   ├── main.js          # 前端逻辑
│   └── style.css        # 样式
├── api/
│   └── send.js          # Vercel Serverless API
├── public/
│   ├── manifest.json    # PWA 配置
│   └── sw.js            # Service Worker
├── package.json
├── vite.config.js
├── tailwind.config.js
└── vercel.json          # Vercel 部署配置
```

## 📝 技术栈

- **前端**: HTML5 + Tailwind CSS v3 + Vanilla JS
- **后端**: Node.js (Vercel Serverless)
- **打包**: archiver (内存中 ZIP)
- **邮件**: nodemailer (Gmail SMTP)
- **部署**: Vercel
