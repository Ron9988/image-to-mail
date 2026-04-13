/**
 * Vercel Serverless Function - 图片打包并通过 Gmail 发送
 * POST /api/send
 *
 * 请求体：
 * {
 *   senderEmail: string,       // 发件人 Gmail
 *   appPassword: string,       // 16位应用授权码
 *   recipientEmail: string,    // 收件人邮箱
 *   subject: string,           // 邮件主题
 *   images: [{ name: string, data: string }]  // Base64 图片数组
 * }
 */

import archiver from 'archiver';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // 仅接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' });
  }

  try {
    const { senderEmail, appPassword, recipientEmail, subject, images } = req.body;

    // ===== 输入校验 =====
    if (!senderEmail || !appPassword || !recipientEmail) {
      return res.status(400).json({ success: false, error: '缺少发件人、授权码或收件人信息' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: '请填写邮件主题' });
    }
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: '请至少选择一张图片' });
    }

    // 简单邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(senderEmail) || !emailRegex.test(recipientEmail)) {
      return res.status(400).json({ success: false, error: '邮箱格式无效' });
    }

    // ===== 使用 archiver 在内存中打包 ZIP =====
    const zipBuffer = await new Promise((resolve, reject) => {
      const buffers = [];
      const archive = archiver('zip', { zlib: { level: 5 } });

      archive.on('data', (chunk) => buffers.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(buffers)));
      archive.on('error', (err) => reject(err));

      // 将 Base64 图片逐一添加到 ZIP
      images.forEach((img, index) => {
        // 从 data URL 中提取纯 Base64 数据
        const base64Data = img.data.includes(',')
          ? img.data.split(',')[1]
          : img.data;
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = img.name || `image_${index + 1}.jpg`;
        archive.append(buffer, { name: filename });
      });

      archive.finalize();
    });

    // ===== 使用 nodemailer 通过 Gmail SMTP 发送 =====
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    });

    await transporter.sendMail({
      from: senderEmail,
      to: recipientEmail,
      subject: subject.trim(),
      text: `请查收附件中的 ${images.length} 张图片。\n\n此邮件由「图片打包助手」自动发送。`,
      attachments: [
        {
          filename: 'bundle.zip',
          content: zipBuffer,
          contentType: 'application/zip',
        },
      ],
    });

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

    // 区分 SMTP 认证错误和其他错误
    let errorMessage = '发送失败，请重试';
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      errorMessage = 'Gmail 认证失败：请检查邮箱地址和应用授权码是否正确';
    } else if (error.code === 'ECONNECTION' || error.code === 'ESOCKET') {
      errorMessage = '网络连接失败，请稍后重试';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.status(500).json({ success: false, error: errorMessage });
  }
}
