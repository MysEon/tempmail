document.addEventListener('DOMContentLoaded', function() {
  const emailAddressElement = document.getElementById('email-address');
  const emailStatusElement = document.getElementById('email-status');
  const emailsContainer = document.getElementById('emails-container');
  const refreshEmailsButton = document.getElementById('refresh-emails');
  const copyEmailButton = document.getElementById('copy-email');
  const closeSidebarButton = document.getElementById('close-sidebar');
  
  const emailContentElement = document.getElementById('email-content');
  const backToListButton = document.getElementById('back-to-list');
  const emailContentSubject = document.getElementById('email-content-subject');
  const emailContentFrom = document.getElementById('email-content-from');
  const emailContentDate = document.getElementById('email-content-date');
  const emailContentMessage = document.getElementById('email-content-message');
  
  let currentEmail = '';
  
  // 加载主题设置
  loadThemeSettings();
  
  // 初始化侧边栏
  function initialize() {
    // 从storage中获取保存的邮箱信息
    chrome.storage.local.get(['tempEmail'], function(result) {
      if (result.tempEmail) {
        currentEmail = result.tempEmail;
        emailAddressElement.textContent = currentEmail;
        loadEmails();
      } else {
        emailAddressElement.textContent = '未生成临时邮箱';
        emailStatusElement.textContent = '请先在插件中生成临时邮箱';
        emailsContainer.innerHTML = '<div class="no-emails">请先生成临时邮箱</div>';
      }
    });
    
    // 添加事件监听器
    refreshEmailsButton.addEventListener('click', loadEmails);
    copyEmailButton.addEventListener('click', copyEmailAddress);
    closeSidebarButton.addEventListener('click', closeSidebar);
    backToListButton.addEventListener('click', hideEmailContent);
  }
  
  // 加载邮件列表
  function loadEmails() {
    if (!currentEmail) {
      return;
    }
    
    const mailboxName = currentEmail;
    const baseUrl = 'https://api.mail.cx/api/v1';
    
    emailStatusElement.textContent = '正在检查新邮件...';
    emailsContainer.innerHTML = '<div class="loading">加载中...</div>';
    
    // 首先获取授权令牌
    fetch(`${baseUrl}/auth/authorize_token`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Authorization': 'Bearer undefined'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`授权失败: ${response.status}`);
      }
      return response.json();
    })
    .then(authData => {
      const token = authData.token || authData; // 可能直接返回token字符串或包含token属性的对象
      
      // 获取邮件列表
      return fetch(`${baseUrl}/mailbox/${encodeURIComponent(mailboxName)}`, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取邮件列表失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data) || data.length === 0) {
          emailsContainer.innerHTML = '<div class="no-emails">没有收到任何邮件</div>';
          emailStatusElement.textContent = '没有收到任何邮件';
          return;
        }
        
        // 保存token以便后续使用
        window.mailcxToken = token;
        
        // 清空容器
        emailsContainer.innerHTML = '';
        
        // 添加邮件列表
        data.forEach((email, index) => {
          const emailItem = document.createElement('div');
          emailItem.className = 'email-item';
          emailItem.innerHTML = `
            <div class="email-subject">${email.subject || '(无主题)'}</div>
            <div class="email-from">发件人: ${email.from || '未知'}</div>
            <div class="email-date">时间: ${email.date ? new Date(email.date * 1000).toLocaleString() : '未知时间'}</div>
          `;
          
          // 点击查看邮件详情
          emailItem.addEventListener('click', function() {
            showEmailContent(email.id, token);
          });
          
          emailsContainer.appendChild(emailItem);
        });
        
        emailStatusElement.textContent = `已收到 ${data.length} 封邮件 (${new Date().toLocaleString()})`;
      });
    })
    .catch(error => {
      console.error('加载邮件失败', error);
      emailsContainer.innerHTML = `
        <div class="no-emails">加载邮件失败: ${error.message}</div>
        <div style="text-align: center; margin-top: 15px;">
          <button id="retry-btn" style="padding: 8px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            重试加载
          </button>
        </div>
      `;
      
      document.getElementById('retry-btn').addEventListener('click', loadEmails);
      
      emailStatusElement.textContent = '加载邮件失败: ' + error.message;
    });
  }
  
  // 格式化文件大小
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // 根据文件类型获取图标
  function getFileIconByType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    
    // 图片文件
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg>`;
    }
    
    // 文档文件
    if (['doc', 'docx', 'pdf', 'txt', 'rtf', 'odt'].includes(extension)) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;
    }
    
    // 压缩文件
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M22 4H2v4h20V4z"/><path d="M16 16h.01"/><path d="M8 16h.01"/><path d="M12 16h.01"/></svg>`;
    }
    
    // 默认文件图标
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>`;
  }
  
  // 显示邮件内容
  function showEmailContent(emailId, token) {
    if (!emailId || !token) {
      emailContentMessage.innerHTML = '<div style="text-align: center; padding: 20px;">无法加载邮件内容</div>';
      return;
    }
    
    // 保存token到全局变量，以便其他函数使用
    window.mailcxToken = token;
    window.currentEmail = currentEmail;
    
    emailContentElement.style.display = 'flex';
    emailContentMessage.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div>正在加载邮件内容...</div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">请稍候，我们正在获取您的邮件内容</div>
      </div>
    `;
    
    // 从邮件列表中找到对应的邮件项并标记为已读
    const emailItem = document.querySelector(`[data-email-id="${emailId}"]`);
    if (emailItem) {
      emailItem.classList.remove('email-unread');
    }
    
    // 获取邮件内容
    fetch(`https://mail.cx/api/mailbox/${encodeURIComponent(currentEmail)}/${emailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`服务器响应错误: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      // 提取邮件信息
      const subject = data.subject || '(无主题)';
      const from = data.from || '未知发件人';
      
      // 尝试从时间戳获取日期
      let date;
      if (data.timestamp) {
        date = new Date(data.timestamp * 1000).toLocaleString();
      } else if (data.date) {
        date = new Date(data.date * 1000).toLocaleString();
      } else {
        date = '未知时间';
      }
      
      // 保存数据到全局变量，用于导出
      window.currentEmailData = {
        subject: subject,
        from: from,
        date: date,
        content: data,
        emailId: emailId
      };
      
      // 设置内容
      emailContentSubject.textContent = subject;
      emailContentFrom.textContent = `发件人: ${from}`;
      emailContentDate.textContent = `时间: ${date}`;
      
      // 处理邮件内容，可能是HTML或纯文本
      let emailContent = '';
      if (data.html) {
        emailContent = data.html;
      } else if (data.text) {
        emailContent = data.text.replace(/\n/g, '<br>');
      } else if (data.body && data.body.html) {
        emailContent = data.body.html;
      } else if (data.body && data.body.text) {
        emailContent = data.body.text.replace(/\n/g, '<br>');
      } else {
        emailContent = '<p>(此邮件没有内容)</p>';
      }
      
      // 添加附件部分
      let attachmentsHtml = '';
      if (data.attachments && data.attachments.length > 0) {
        attachmentsHtml = `
          <div class="email-attachments">
            <h3>附件 (${data.attachments.length})</h3>
            <div class="attachments-list">
        `;
        
        data.attachments.forEach(attachment => {
          const fileSize = formatFileSize(attachment.size || 0);
          const fileName = attachment.filename || '未知文件';
          
          // 保存附件数据到自定义属性
          attachmentsHtml += `
            <div class="attachment-item" data-id="${attachment.id}" data-filename="${fileName}">
              <div class="attachment-icon">
                ${getFileIconByType(fileName)}
              </div>
              <div class="attachment-info">
                <div class="attachment-name">${fileName}</div>
                <div class="attachment-size">${fileSize}</div>
              </div>
              <button class="download-attachment-btn" data-id="${attachment.id}" data-filename="${fileName}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
            </div>
          `;
        });
        
        attachmentsHtml += `
            </div>
          </div>
        `;
      }
      
      // 添加更全面的样式修复和安全包装
      const safeContent = `
        <div class="email-content-wrapper">
          ${attachmentsHtml}
          <div class="email-body-container">
            ${emailContent}
          </div>
        </div>
        <style>
          .email-content-wrapper {
            width: auto;
            max-width: 90%;
            box-sizing: border-box;
            word-break: break-word;
            overflow-wrap: break-word;
            margin: 25px auto;
            background-color: var(--bg-color);
            border-radius: 12px;
            line-height: 1.6;
            font-size: 14px;
            box-shadow: 0 3px 10px var(--shadow-color);
          }
          
          .email-body-container {
            padding: 30px 40px;
            border-radius: 8px;
            background-color: var(--bg-color);
            margin: 0;
          }
          
          .email-content-wrapper * {
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-wrap: break-word !important;
          }
          .email-content-wrapper img {
            max-width: 100% !important;
            height: auto !important;
            display: block;
            margin: 15px auto;
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          }
          .email-content-wrapper table {
            width: 100% !important;
            margin: 15px 0;
            border-collapse: collapse;
            overflow-x: auto;
            display: block;
          }
          .email-content-wrapper table th,
          .email-content-wrapper table td {
            border: 1px solid var(--border-color);
            padding: 10px;
            text-align: left;
          }
          .email-content-wrapper table th {
            background-color: var(--bg-light);
          }
          .email-content-wrapper div, 
          .email-content-wrapper span, 
          .email-content-wrapper td, 
          .email-content-wrapper th {
            width: auto !important;
            max-width: 100% !important;
          }
          .email-content-wrapper h1,
          .email-content-wrapper h2,
          .email-content-wrapper h3,
          .email-content-wrapper h4,
          .email-content-wrapper h5,
          .email-content-wrapper h6 {
            margin-top: 20px;
            margin-bottom: 10px;
            color: var(--text-color);
            font-weight: 600;
          }
          .email-content-wrapper p {
            margin: 12px 0;
            line-height: 1.8;
          }
          .email-content-wrapper a {
            color: var(--primary-color);
            text-decoration: none;
          }
          .email-content-wrapper a:hover {
            text-decoration: underline;
          }
          .email-content-wrapper pre {
            white-space: pre-wrap;
            word-break: break-word;
            max-width: 100%;
            overflow: auto;
            background-color: var(--bg-light);
            padding: 15px;
            border-radius: 6px;
            border: 1px solid var(--border-color);
            font-family: monospace;
            margin: 15px 0;
          }
          .email-content-wrapper blockquote {
            border-left: 4px solid var(--primary-color);
            padding: 10px 15px;
            margin: 15px 0 15px 15px;
            color: var(--text-secondary);
            background-color: var(--bg-light);
            border-radius: 0 6px 6px 0;
          }
          .email-content-wrapper ul,
          .email-content-wrapper ol {
            padding-left: 30px;
            margin: 12px 0;
          }
          .email-content-wrapper li {
            margin-bottom: 8px;
          }
          .email-attachments {
            margin: 0 0 15px 0;
            padding: 20px;
            background-color: var(--bg-light);
            border-radius: 8px 8px 0 0;
            border-bottom: 1px solid var(--border-color);
          }
          .email-attachments h3 {
            margin-top: 0;
            margin-bottom: 15px;
            font-size: 16px;
            color: var(--text-color);
          }
          .attachments-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .attachment-item {
            display: flex;
            align-items: center;
            padding: 10px 15px;
            background-color: var(--bg-color);
            border-radius: 6px;
            border: 1px solid var(--border-color);
            transition: all 0.2s;
          }
          .attachment-item:hover {
            box-shadow: 0 2px 8px var(--shadow-color);
          }
          .attachment-icon {
            margin-right: 12px;
            color: var(--primary-color);
          }
          .attachment-icon svg {
            width: 24px;
            height: 24px;
          }
          .attachment-info {
            flex: 1;
          }
          .attachment-name {
            font-weight: 500;
            margin-bottom: 3px;
          }
          .attachment-size {
            font-size: 12px;
            color: var(--text-secondary);
          }
          .download-attachment-btn {
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            padding: 0;
          }
          .download-attachment-btn:hover {
            background-color: var(--primary-dark);
            transform: translateY(-2px);
          }
        </style>
      `;
      
      // 设置内容
      emailContentMessage.innerHTML = safeContent;
      
      // 添加下载附件事件监听器
      setTimeout(() => {
        const downloadButtons = document.querySelectorAll('.download-attachment-btn');
        downloadButtons.forEach(button => {
          button.addEventListener('click', function() {
            const attachmentId = this.getAttribute('data-id');
            const filename = this.getAttribute('data-filename');
            downloadAttachment(emailId, attachmentId, filename);
          });
        });
        
        // 添加导出功能事件监听器
        const exportPdfBtn = document.getElementById('export-pdf-sidebar');
        const exportHtmlBtn = document.getElementById('export-html-sidebar');
        
        if (exportPdfBtn) {
          exportPdfBtn.addEventListener('click', exportEmailAsPDF);
        }
        
        if (exportHtmlBtn) {
          exportHtmlBtn.addEventListener('click', exportEmailAsHTML);
        }
      }, 100);
    })
    .catch(error => {
      console.error('获取邮件内容失败:', error);
      emailContentMessage.innerHTML = `
        <div class="loading-container" style="color: var(--text-color);">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style="margin: 15px 0 5px 0;">获取邮件内容失败</h3>
          <p style="margin: 5px 0 15px 0; color: var(--text-secondary);">${error.message}</p>
          <button id="retry-content-btn" style="padding: 8px 15px; background-color: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
            重试加载
          </button>
        </div>
      `;
      
      document.getElementById('retry-content-btn').addEventListener('click', function() {
        showEmailContent(emailId, token);
      });
    });
  }
  
  // 隐藏邮件内容，返回列表
  function hideEmailContent() {
    emailContentElement.style.display = 'none';
  }
  
  // 复制邮箱地址
  function copyEmailAddress() {
    if (currentEmail) {
      navigator.clipboard.writeText(currentEmail).then(() => {
        emailStatusElement.textContent = '邮箱地址已复制到剪贴板';
        setTimeout(() => {
          emailStatusElement.textContent = '最后更新: ' + new Date().toLocaleString();
        }, 2000);
      });
    }
  }
  
  // 关闭侧边栏
  function closeSidebar() {
    chrome.runtime.sendMessage({
      action: 'closeSidebar'
    });
  }
  
  // 初始化侧边栏
  initialize();
  
  // 监听来自background或popup的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'refreshEmails') {
      loadEmails();
      sendResponse({success: true});
    } else if (request.action === 'updateEmail') {
      currentEmail = request.email;
      emailAddressElement.textContent = currentEmail;
      loadEmails();
      sendResponse({success: true});
    }
    return true;
  });
});

// 主题切换相关函数
function loadThemeSettings() {
  // 获取主题设置
  chrome.storage.sync.get('theme', function(data) {
    const currentTheme = data.theme || 'light';
    applyTheme(currentTheme);
    
    // 添加主题切换按钮点击事件
    const themeSwitch = document.querySelector('.theme-switch');
    if (themeSwitch) {
      themeSwitch.addEventListener('click', toggleTheme);
    }
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // 不需要再次保存，因为它已经在popup.js中保存了，这里只是应用主题
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  // 保存主题设置，保持所有页面一致
  chrome.storage.sync.set({theme: newTheme});
}

// 下载附件
function downloadAttachment(emailId, attachmentId, filename) {
  const currentEmail = window.currentEmail;
  if (!emailId || !attachmentId || !currentEmail) {
    console.error('下载附件缺少必要参数');
    return;
  }
  
  const token = window.mailcxToken;
  if (!token) {
    console.error('授权令牌不可用');
    return;
  }
  
  // 创建下载状态提示
  const statusElement = document.createElement('div');
  statusElement.className = 'download-status';
  statusElement.innerHTML = `
    <div class="loading-spinner"></div>
    <span>正在下载附件: ${filename}...</span>
  `;
  document.body.appendChild(statusElement);
  
  // 获取附件数据
  fetch(`https://mail.cx/api/mailbox/${encodeURIComponent(currentEmail)}/${emailId}/attachment/${attachmentId}`, {
    headers: {
      'accept': 'application/octet-stream',
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`下载附件失败: ${response.status}`);
    }
    return response.blob();
  })
  .then(blob => {
    // 创建下载链接
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    // 释放URL对象
    window.URL.revokeObjectURL(url);
    
    // 更新下载状态
    statusElement.innerHTML = `
      <div class="download-success">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span>附件下载完成: ${filename}</span>
      </div>
    `;
    
    // 3秒后移除下载状态
    setTimeout(() => {
      document.body.removeChild(statusElement);
    }, 3000);
  })
  .catch(error => {
    console.error('下载附件失败:', error);
    
    // 更新下载状态为错误
    statusElement.innerHTML = `
      <div class="download-error">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <span>下载失败: ${error.message}</span>
      </div>
    `;
    
    // 5秒后移除下载状态
    setTimeout(() => {
      document.body.removeChild(statusElement);
    }, 5000);
  });
}

// 导出邮件为HTML
function exportEmailAsHTML() {
  if (!window.currentEmailData) {
    alert('无法导出：邮件数据不可用');
    return;
  }
  
  const { subject, from, date, content } = window.currentEmailData;
  
  // 创建完整的HTML文档
  let emailContent = '';
  if (content.html) {
    emailContent = content.html;
  } else if (content.text) {
    emailContent = content.text.replace(/\n/g, '<br>');
  } else if (content.body && content.body.html) {
    emailContent = content.body.html;
  } else if (content.body && content.body.text) {
    emailContent = content.body.text.replace(/\n/g, '<br>');
  } else {
    emailContent = '<p>(此邮件没有内容)</p>';
  }
  
  // 构建导出HTML文档
  const htmlTemplate = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${escapeHTML(subject)}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }
      .email-header {
        border-bottom: 1px solid #eee;
        padding-bottom: 15px;
        margin-bottom: 20px;
      }
      .email-subject {
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 10px;
      }
      .email-meta {
        color: #666;
        font-size: 14px;
        margin-bottom: 5px;
      }
      .email-content {
        padding: 10px 0;
      }
      .email-content img {
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <div class="email-header">
      <div class="email-subject">${escapeHTML(subject)}</div>
      <div class="email-meta">发件人: ${escapeHTML(from)}</div>
      <div class="email-meta">时间: ${escapeHTML(date)}</div>
    </div>
    <div class="email-content">
      ${emailContent}
    </div>
  </body>
  </html>
  `;
  
  // 创建下载
  const blob = new Blob([htmlTemplate], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(subject)}.html`;
  a.click();
  
  URL.revokeObjectURL(url);
  
  // 显示下载状态
  const statusElement = document.createElement('div');
  statusElement.className = 'download-status';
  statusElement.innerHTML = `
    <div class="download-success">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>邮件已导出为HTML文件</span>
    </div>
  `;
  document.body.appendChild(statusElement);
  
  // 3秒后移除下载状态
  setTimeout(() => {
    document.body.removeChild(statusElement);
  }, 3000);
}

// 导出邮件为PDF
function exportEmailAsPDF() {
  if (!window.currentEmailData) {
    alert('无法导出：邮件数据不可用');
    return;
  }
  
  const { subject, from, date, content } = window.currentEmailData;
  
  // 创建一个临时iframe用于打印
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  
  // 获取邮件内容
  let emailContent = '';
  if (content.html) {
    emailContent = content.html;
  } else if (content.text) {
    emailContent = content.text.replace(/\n/g, '<br>');
  } else if (content.body && content.body.html) {
    emailContent = content.body.html;
  } else if (content.body && content.body.text) {
    emailContent = content.body.text.replace(/\n/g, '<br>');
  } else {
    emailContent = '<p>(此邮件没有内容)</p>';
  }
  
  // 构建打印文档
  const printContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${escapeHTML(subject)}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 100%;
        margin: 0;
        padding: 15px;
      }
      .email-header {
        border-bottom: 1px solid #eee;
        padding-bottom: 15px;
        margin-bottom: 20px;
      }
      .email-subject {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 10px;
      }
      .email-meta {
        color: #666;
        font-size: 12px;
        margin-bottom: 5px;
      }
      .email-content {
        padding: 10px 0;
      }
      .email-content img {
        max-width: 100%;
        height: auto;
      }
      @media print {
        body {
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-header">
      <div class="email-subject">${escapeHTML(subject)}</div>
      <div class="email-meta">发件人: ${escapeHTML(from)}</div>
      <div class="email-meta">时间: ${escapeHTML(date)}</div>
    </div>
    <div class="email-content">
      ${emailContent}
    </div>
  </body>
  </html>
  `;
  
  // 写入内容到iframe
  iframe.srcdoc = printContent;
  
  // 显示下载状态
  const statusElement = document.createElement('div');
  statusElement.className = 'download-status';
  statusElement.innerHTML = `
    <div class="download-success">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>邮件已发送到打印机（可另存为PDF）</span>
    </div>
  `;
  document.body.appendChild(statusElement);
  
  // 当iframe加载完成后，触发打印
  iframe.onload = function() {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      
      // 3秒后移除下载状态
      setTimeout(() => {
        document.body.removeChild(statusElement);
      }, 3000);
    } catch (e) {
      console.error('打印失败', e);
      
      // 更新状态为错误
      statusElement.innerHTML = `
        <div class="download-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <span>打印失败，请尝试导出HTML后手动打印</span>
        </div>
      `;
      
      // 5秒后移除下载状态
      setTimeout(() => {
        document.body.removeChild(statusElement);
      }, 5000);
    }
  };
}

// 辅助函数：转义HTML特殊字符
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 辅助函数：净化文件名
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_') // 替换Windows文件名禁止的字符
    .replace(/\s+/g, '_')          // 替换空格
    .substring(0, 100);            // 限制长度
}

// 显示错误信息
function showError(message) {
  const errorModal = document.createElement('div');
  errorModal.className = 'error-modal';
  errorModal.innerHTML = `
    <div class="error-content">
      <h3>获取邮件失败</h3>
      <p>${message}</p>
      <button class="close-error-btn">关闭</button>
    </div>
  `;
  
  document.body.appendChild(errorModal);
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .error-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    .error-content {
      background-color: var(--bg-color);
      padding: 20px;
      border-radius: 8px;
      max-width: 80%;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .close-error-btn {
      background-color: var(--primary-color);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 15px;
    }
  `;
  document.head.appendChild(style);
  
  // 添加关闭按钮事件
  errorModal.querySelector('.close-error-btn').addEventListener('click', function() {
    document.body.removeChild(errorModal);
  });
  
  // 5秒后自动关闭
  setTimeout(() => {
    if (document.body.contains(errorModal)) {
      document.body.removeChild(errorModal);
    }
  }, 5000);
} 