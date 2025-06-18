document.addEventListener('DOMContentLoaded', async function() {
  // 加载主题设置
  loadThemeSettings();
  
  // 获取DOM元素
  const emailInput = document.getElementById('email-address');
  const copyBtn = document.getElementById('copy-btn');
  const generateBtn = document.getElementById('generate-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const fillBtn = document.getElementById('fill-btn');
  const statusElement = document.getElementById('status');
  const emailsContainer = document.getElementById('emails-container');
  
  // 加载有效期设置
  const expirySelect = document.getElementById('expiry-time');
  const expiryInfo = document.getElementById('expiry-info');
  
  // 恢复上次的有效期设置
  chrome.storage.sync.get('expiryHours', function(data) {
    if (data.expiryHours !== undefined) {
      expirySelect.value = data.expiryHours;
      updateExpiryInfo(data.expiryHours);
    }
  });
  
  // 监听有效期选择变化
  expirySelect.addEventListener('change', function() {
    const hours = parseInt(this.value);
    chrome.storage.sync.set({expiryHours: hours});
    updateExpiryInfo(hours);
  });
  
  // 更新有效期信息文本
  function updateExpiryInfo(hours) {
    if (hours === 0) {
      expiryInfo.textContent = '邮箱永不过期';
    } else if (hours < 24) {
      expiryInfo.textContent = `邮箱将在生成后${hours}小时内有效`;
    } else if (hours === 24) {
      expiryInfo.textContent = '邮箱将在生成后1天内有效';
    } else if (hours === 48) {
      expiryInfo.textContent = '邮箱将在生成后2天内有效';
    } else if (hours === 72) {
      expiryInfo.textContent = '邮箱将在生成后3天内有效';
    } else if (hours === 168) {
      expiryInfo.textContent = '邮箱将在生成后7天内有效';
    } else {
      expiryInfo.textContent = `邮箱将在生成后${Math.floor(hours / 24)}天内有效`;
    }
  }
  
  let currentEmail = '';
  let checkEmailInterval;
  
  // 尝试从存储中恢复当前邮箱
  chrome.storage.sync.get('currentEmail', function(data) {
    if (data.currentEmail) {
      currentEmail = data.currentEmail;
      emailInput.value = currentEmail;
      copyBtn.disabled = false;
      fillBtn.disabled = false;
      refreshBtn.disabled = false;
      
      // 显示邮箱状态
      statusElement.textContent = '已生成临时邮箱';
      
      // 尝试加载邮件
      fetchEmails();
    }
  });
  
  // 生成临时邮箱按钮点击事件
  generateBtn.addEventListener('click', function() {
    statusElement.textContent = '正在生成临时邮箱...';
    generateBtn.disabled = true;
    
    // 获取当前的过期设置
    const expiryHours = parseInt(expirySelect.value);
    
    // 随机生成用户名部分
    const username = generateRandomString(10);
    
    // 目前使用mail.cx域名
    const domain = 'nqmo.com';
    const email = `${username}@${domain}`;
    
    // 将邮箱地址保存到存储中，并记录生成时间和过期时间
    const now = Date.now();
    const expiryTime = expiryHours > 0 ? now + (expiryHours * 60 * 60 * 1000) : 0;
    
    chrome.storage.sync.set({
      currentEmail: email,
      emailGeneratedTime: now,
      emailExpiryTime: expiryTime
    }, function() {
      // 更新UI
      emailInput.value = email;
      statusElement.textContent = '临时邮箱已生成';
      generateBtn.disabled = false;
      copyBtn.disabled = false;
      fillBtn.disabled = false;
      refreshBtn.disabled = false;
      
      // 清空邮件列表，显示等待消息
      emailsContainer.innerHTML = '<div class="loading">正在检查邮箱，请稍候...</div>';
      
      // 不再显示通知，减少干扰
      console.log('临时邮箱已生成:', email);
      
      // 立即抓取邮件列表
      fetchEmails();
      
      // 通知所有标签页更新邮箱
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
          try {
            chrome.tabs.sendMessage(tab.id, {
              action: 'fillEmail',
              email: email
            }).catch(error => {
              // 忽略无法发送消息的错误
              console.log(`无法发送消息到标签 ${tab.id}`);
            });
          } catch (error) {
            // 忽略错误
          }
        });
      });
    });
  });
  
  // 生成指定长度的随机字符串
  function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      result += chars.charAt(randomIndex);
    }
    
    return result;
  }
  
  // 复制邮箱地址
  copyBtn.addEventListener('click', function() {
    if (currentEmail) {
      navigator.clipboard.writeText(currentEmail).then(() => {
        statusElement.textContent = '邮箱地址已复制到剪贴板';
        setTimeout(() => {
          statusElement.textContent = '已生成临时邮箱';
        }, 2000);
      });
    }
  });
  
  // 刷新邮件列表
  refreshBtn.addEventListener('click', fetchEmails);
  
  // 填充邮箱到当前页面
  fillBtn.addEventListener('click', function() {
    if (!currentEmail) return;
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'fillEmail',
          email: currentEmail
        })
        .then(response => {
          if (response && response.success) {
            statusElement.textContent = '已填充到页面';
          } else {
            statusElement.textContent = response ? response.message : '未找到邮箱输入框';
          }
          
          // 2秒后关闭弹窗
          setTimeout(() => {
            window.close();
          }, 1000);
        })
        .catch(error => {
          console.error('填充失败:', error);
          statusElement.textContent = '填充失败: ' + error.message;
        });
      }
    });
  });
  
  // 从mail.cx获取邮件列表
  function fetchEmailMessages(username, domain) {
    return new Promise((resolve, reject) => {
      const mailboxName = `${username}@${domain}`;
      
      // 正确的API基础URL
      const baseUrl = 'https://api.mail.cx/api/v1';
      
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
        const token = authData.token || authData; // 可能直接返回token字符串或者包含token属性的对象
        
        // 获取邮件列表
        return fetch(`${baseUrl}/mailbox/${encodeURIComponent(mailboxName)}`, {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取邮件列表失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data && Array.isArray(data)) {
          const messages = data.map(msg => ({
            id: msg.id,
            subject: msg.subject || '(无主题)',
            from: msg.from || '未知',
            date: new Date(msg.date*1000 || Date.now()).toLocaleString(),
            timestamp: msg.date
          }));
          resolve(messages);
        } else {
          resolve([]);
        }
      })
      .catch(error => {
        console.error('抓取邮件失败:', error);
        reject(error);
      });
    });
  }
  
  // 格式化日期，避免Invalid Date
  function formatDate(timestamp) {
    if (!timestamp) return '未知时间';
    
    try {
      // 尝试使用原生Date对象解析
      const date = new Date(timestamp * 1000);
      
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        // 无效日期，返回默认字符串
        return '未知时间';
      }
      
      // 返回格式化的日期字符串
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      console.error('日期格式化错误:', e);
      return '未知时间';
    }
  }
  
  // 获取邮件内容
  function getEmailContent(username, domain, index, emailId) {
    statusElement.textContent = '正在加载邮件内容...';
    
    const mailboxName = `${username}@${domain}`;
    const baseUrl = 'https://api.mail.cx/api/v1';
    
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
      const token = authData.token || authData; // 可能直接返回token字符串或者包含token属性的对象
      
      // 获取邮件内容
      return fetch(`${baseUrl}/mailbox/${encodeURIComponent(mailboxName)}/${emailId}`, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取邮件内容失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        displayEmailContent(data);
        statusElement.textContent = '已显示邮件内容';
        return token; // 返回token以供可能的后续操作
      });
    })
    .catch(error => {
      console.error('获取邮件内容失败:', error);
      
      // 显示错误提示
      const modalOverlay = document.createElement('div');
      modalOverlay.style.position = 'fixed';
      modalOverlay.style.top = '0';
      modalOverlay.style.left = '0';
      modalOverlay.style.width = '100%';
      modalOverlay.style.height = '100%';
      modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      modalOverlay.style.zIndex = '1000';
      
      const modalContent = document.createElement('div');
      modalContent.style.position = 'absolute';
      modalContent.style.top = '50%';
      modalContent.style.left = '50%';
      modalContent.style.transform = 'translate(-50%, -50%)';
      modalContent.style.backgroundColor = 'white';
      modalContent.style.padding = '20px';
      modalContent.style.borderRadius = '5px';
      modalContent.style.width = '80%';
      modalContent.style.maxHeight = '80%';
      modalContent.style.overflow = 'auto';
      
      modalContent.innerHTML = `
        <h3>获取邮件失败</h3>
        <p>错误信息: ${error.message}</p>
        <p>请稍后再试。</p>
        <button id="close-modal" style="margin-top: 10px; padding: 5px 10px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">关闭</button>
      `;
      
      modalOverlay.appendChild(modalContent);
      document.body.appendChild(modalOverlay);
      
      document.getElementById('close-modal').addEventListener('click', function() {
        document.body.removeChild(modalOverlay);
      });
      
      statusElement.textContent = '获取邮件内容失败';
    });
  }
  
  // 显示邮件内容
  function displayEmailContent(data) {
    const modal = document.getElementById('email-modal');
    const modalSubject = document.getElementById('modal-subject');
    const modalFrom = document.getElementById('modal-from');
    const modalDate = document.getElementById('modal-date');
    const modalContent = document.getElementById('modal-content');
    const closeBtn = document.querySelector('.close');
    
    // 提取邮件信息
    const subject = data.subject || '(无主题)';
    let from = data.from || '未知发件人';
    
    // 使用格式化函数处理日期
    let date;
    if (data.timestamp) {
      date = formatDate(data.timestamp);
    } else if (data.date) {
      date = formatDate(data.date);
    } else {
      date = '未知时间';
    }
    
    // 保存数据到全局变量，用于导出
    window.currentEmailData = {
      subject: subject,
      from: from,
      date: date,
      content: data
    };
    
    // 设置模态框内容
    modalSubject.textContent = subject;
    modalFrom.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      发件人: ${from}`;
    modalDate.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      时间: ${date}`;
    
    // 处理邮件内容，可能有多种格式
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
      emailContent = '<p class="empty-content">(此邮件没有内容)</p>';
    }
    
    // 添加附件部分
    let attachmentsHtml = '';
    if (data.attachments && data.attachments.length > 0) {
      attachmentsHtml = `
        <div class="email-attachments">
          <h3>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
            附件 (${data.attachments.length})
          </h3>
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
            <button class="download-attachment-btn" data-id="${attachment.id}" data-filename="${fileName}" title="下载附件">
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
    
    // 添加样式修复和内容安全措施
    const safeContent = `
      <div class="email-content-wrapper">
        ${attachmentsHtml}
        ${emailContent}
      </div>
      <style>
        .email-content-wrapper {
          width: 100%;
          box-sizing: border-box;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .email-content-wrapper * {
          max-width: 100% !important;
          box-sizing: border-box !important;
          overflow-wrap: break-word !important;
        }
        .email-content-wrapper img {
          max-width: 100% !important;
          height: auto !important;
          border-radius: 6px;
          margin: 10px 0;
        }
        .empty-content {
          text-align: center;
          color: var(--text-secondary);
          font-style: italic;
          padding: 30px 0;
          font-size: 15px;
        }
        .email-attachments {
          margin-bottom: 25px;
          padding-bottom: 15px;
          border-bottom: 1px dashed var(--border-color);
        }
        .email-attachments h3 {
          font-size: 16px;
          font-weight: 500;
          color: var(--primary-color);
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 0;
        }
        .attachments-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 15px;
        }
        .attachment-item {
          display: flex;
          align-items: center;
          padding: 12px;
          background-color: var(--bg-light);
          border-radius: 8px;
          border: 1px solid var(--border-color);
          transition: all 0.2s;
        }
        .attachment-item:hover {
          border-color: var(--primary-color);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
        .attachment-icon {
          margin-right: 12px;
        }
        .attachment-icon svg {
          width: 32px;
          height: 32px;
          stroke: var(--primary-color);
        }
        .attachment-info {
          flex: 1;
        }
        .attachment-name {
          font-weight: 500;
          margin-bottom: 4px;
          word-break: break-all;
        }
        .attachment-size {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .download-attachment-btn {
          background-color: var(--primary-color);
          color: white;
          border: none;
          border-radius: 6px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0;
        }
        .download-attachment-btn:hover {
          background-color: var(--primary-dark);
          transform: scale(1.1);
        }
      </style>
    `;
    
    // 设置内容
    modalContent.innerHTML = safeContent;
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 添加下载附件事件监听器
    setTimeout(() => {
      const downloadButtons = document.querySelectorAll('.download-attachment-btn');
      downloadButtons.forEach(button => {
        button.addEventListener('click', function() {
          const attachmentId = this.getAttribute('data-id');
          const filename = this.getAttribute('data-filename');
          downloadAttachment(attachmentId, filename);
        });
      });
      
      // 添加导出功能事件监听器
      document.getElementById('export-pdf').addEventListener('click', exportEmailAsPDF);
      document.getElementById('export-html').addEventListener('click', exportEmailAsHTML);
    }, 100);
    
    // 点击关闭按钮关闭模态框
    closeBtn.onclick = function() {
      modal.style.display = 'none';
    };
    
    // 点击模态框外部关闭模态框
    modal.onclick = function(event) {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    };
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
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M22 4H2v4h20V4z"/><path d="M16 16h.01"/><path d="M8 16h.01"/><path d="M12 16h.01"/></svg>`;
    }
    
    // 默认文件图标
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>`;
  }
  
  // 下载附件
  function downloadAttachment(attachmentId, filename) {
    const emailElement = document.querySelector('.email-item.active');
    if (!emailElement) return;
    
    const emailId = emailElement.getAttribute('data-id');
    if (!emailId) return;
    
    const currentEmail = document.getElementById('email-address').value;
    if (!currentEmail) return;
    
    const [username, domain] = currentEmail.split('@');
    if (!username || !domain) return;
    
    const mailboxName = `${username}@${domain}`;
    const baseUrl = 'https://api.mail.cx/api/v1';
    
    statusElement.textContent = '正在下载附件...';
    
    // 获取授权令牌
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
      const token = authData.token || authData;
      
      // 获取附件数据
      return fetch(`${baseUrl}/mailbox/${encodeURIComponent(mailboxName)}/${emailId}/attachment/${attachmentId}`, {
        headers: {
          'accept': 'application/octet-stream',
          'Authorization': `Bearer ${token}`
        }
      });
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
      
      statusElement.textContent = '附件下载完成';
      
      // 不再显示下载成功通知
      console.log('附件下载成功:', filename);
    })
    .catch(error => {
      console.error('下载附件失败:', error);
      statusElement.textContent = '下载附件失败';
      
      // 不再显示错误通知
      console.error('附件下载失败:', error.message);
    });
  }
  
  // 抓取邮件列表
  function fetchEmails() {
    if (!emailInput.value) {
      return;
    }
    
    currentEmail = emailInput.value;
    const [username, domain] = currentEmail.split('@');
    
    statusElement.textContent = '正在检查新邮件...';
    emailsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div>正在加载邮件...</div>';
    
    fetchEmailMessages(username, domain)
      .then(messages => {
        if (messages.length === 0) {
          emailsContainer.innerHTML = '<div class="no-emails">还没有收到任何邮件</div>';
          statusElement.textContent = '没有收到任何邮件';
        } else {
          // 清空容器
          emailsContainer.innerHTML = '';
          
          // 添加邮件列表
          messages.forEach((message, index) => {
            const emailItem = document.createElement('div');
            emailItem.className = 'email-item';
            emailItem.setAttribute('data-id', message.id);
            emailItem.innerHTML = `
              <div class="email-subject">${message.subject}</div>
              <div class="email-from">发件人: ${message.from}</div>
              <div class="email-date">时间: ${message.date}</div>
            `;
            
            // 点击查看邮件详情
            emailItem.addEventListener('click', function() {
              // 移除所有活动项的高亮
              document.querySelectorAll('.email-item').forEach(item => {
                item.classList.remove('active');
              });
              
              // 添加当前项的高亮
              this.classList.add('active');
              
              // 获取邮件内容
              getEmailContent(username, domain, index, message.id);
            });
            
            emailsContainer.appendChild(emailItem);
          });
          
          statusElement.textContent = `已收到 ${messages.length} 封邮件`;
          
          // 保存邮件数量到存储
          chrome.storage.sync.set({
            lastEmailCount: messages.length,
            lastCheckTime: Date.now()
          });
        }
      })
      .catch(error => {
        console.error('获取邮件失败:', error);
        emailsContainer.innerHTML = `
          <div class="no-emails">获取邮件失败: ${error.message}</div>
          <div style="text-align: center; margin-top: 15px;">
            <button id="retry-btn" style="padding: 8px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
              重试
            </button>
          </div>
        `;
        
        document.getElementById('retry-btn').addEventListener('click', fetchEmails);
        
        statusElement.textContent = '获取邮件失败';
      });
  }
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
  // 保存主题设置到存储
  chrome.storage.sync.set({theme: theme});
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

// 导出邮件为HTML
function exportEmailAsHTML() {
  if (!window.currentEmailData) {
    statusElement.textContent = '无法导出：邮件数据不可用';
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
  statusElement.textContent = '邮件已导出为HTML文件';
}

// 导出邮件为PDF
function exportEmailAsPDF() {
  if (!window.currentEmailData) {
    statusElement.textContent = '无法导出：邮件数据不可用';
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
  
  // 当iframe加载完成后，触发打印
  iframe.onload = function() {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      statusElement.textContent = '邮件已发送到打印机（可另存为PDF）';
    } catch (e) {
      console.error('打印失败', e);
      statusElement.textContent = '打印失败，请尝试导出HTML后手动打印';
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

// 检查邮箱是否过期，如果过期则提示重新生成
function checkEmailExpiry() {
  chrome.storage.sync.get(['currentEmail', 'emailExpiryTime'], function(data) {
    if (data.currentEmail && data.emailExpiryTime && data.emailExpiryTime !== 0) {
      const now = Date.now();
      
      // 如果当前时间超过了过期时间，邮箱已过期
      if (now > data.emailExpiryTime) {
        const emailInput = document.getElementById('email-address');
        const statusElement = document.getElementById('status');
        const refreshBtn = document.getElementById('refresh-btn');
        const copyBtn = document.getElementById('copy-btn');
        const fillBtn = document.getElementById('fill-btn');
        const emailsContainer = document.getElementById('emails-container');
        
        // 清空邮箱和UI
        emailInput.value = '';
        statusElement.textContent = '邮箱已过期，请重新生成';
        refreshBtn.disabled = true;
        copyBtn.disabled = true;
        fillBtn.disabled = true;
        emailsContainer.innerHTML = '<div class="no-emails">邮箱已过期，请重新生成临时邮箱</div>';
        
        // 清除存储
        chrome.storage.sync.remove(['currentEmail', 'emailGeneratedTime', 'emailExpiryTime']);
        
        // 不再显示过期通知
        console.log('临时邮箱已过期');
      } else {
        // 如果邮箱即将过期（小于30分钟），显示警告
        const timeLeft = data.emailExpiryTime - now;
        if (timeLeft < 30 * 60 * 1000) { // 小于30分钟
          const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
          document.getElementById('status').textContent = `警告：邮箱将在${minutesLeft}分钟后过期`;
        }
      }
    }
  });
}

// 在加载页面时和定期检查邮箱是否过期
document.addEventListener('DOMContentLoaded', function() {
  checkEmailExpiry();
  
  // 每分钟检查一次
  setInterval(checkEmailExpiry, 60 * 1000);
}); 