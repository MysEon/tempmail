// 全局变量存储临时邮箱
let currentTempEmail = '';
// 存储当前激活的输入框
let activeEmailField = null;
// 添加一个标志，记录当前页面是否已经通知过检测到了邮箱输入框
let hasNotifiedEmailFieldDetection = false;

// 检测邮箱输入框的标识符 - 更加精准的邮箱相关关键词
const EMAIL_IDENTIFIERS = [
  'email', 'e-mail', 'mail', 'gmail', '邮箱', '邮件', '电子邮件', 'emailaddress', 'mail-address'
];

// 初始化时检查是否有临时邮箱
function loadTempEmail() {
  chrome.storage.local.get(['tempEmail'], function(result) {
    if (result.tempEmail) {
      currentTempEmail = result.tempEmail;
      console.log('临时邮箱已加载:', currentTempEmail);
    }
  });
}

// 初始加载
loadTempEmail();

// 监听storage变化，确保实时更新临时邮箱
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'local' && changes.tempEmail) {
    currentTempEmail = changes.tempEmail.newValue;
    console.log('临时邮箱已更新:', currentTempEmail);
  }
});

// 页面获得焦点时重新加载临时邮箱，确保数据最新
window.addEventListener('focus', loadTempEmail);

// 监听来自background的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'fillEmail' && request.email) {
    // 填充临时邮箱
    currentTempEmail = request.email;
    
    // 如果有记录的输入框，优先填充它
    if (activeEmailField && document.body.contains(activeEmailField)) {
      activeEmailField.value = currentTempEmail;
      triggerInputEvents(activeEmailField);
      sendResponse({success: true});
      return true;
    }
    
    // 否则尝试填充当前激活的元素
    const activeElement = document.activeElement;
    if (isEmailField(activeElement)) {
      activeElement.value = currentTempEmail;
      triggerInputEvents(activeElement);
      sendResponse({success: true});
      return true;
    }
    
    // 如果上面都不行，尝试查找页面上的任何邮箱输入框
    const emailFields = findEmailFields();
    if (emailFields.length > 0) {
      emailFields[0].value = currentTempEmail;
      triggerInputEvents(emailFields[0]);
      sendResponse({success: true});
      return true;
    }
    
    sendResponse({success: false, message: '未找到邮箱输入框'});
  } else if (request.action === 'autoGenerateAndFill') {
    // 自动生成并填充的操作
    chrome.runtime.sendMessage({
      action: 'generateEmailForField'
    });
    sendResponse({success: true});
  } else if (request.action === 'resetNotificationFlag') {
    // 重置通知标志
    hasNotifiedEmailFieldDetection = false;
    sendResponse({success: true});
  } else if (request.action === 'updateTempEmail') {
    // 接收新的临时邮箱
    currentTempEmail = request.email;
    sendResponse({success: true});
  }
  return true;
});

// 页面加载完成后开始检测邮箱输入框
window.addEventListener('load', startDetection);
document.addEventListener('DOMContentLoaded', startDetection);

// 主函数：开始检测邮箱输入框
function startDetection() {
  // 重置通知标志
  hasNotifiedEmailFieldDetection = false;
  
  // 首次运行检测所有已存在的邮箱输入框
  detectEmailFields();
  
  // 监听焦点变化
  document.addEventListener('focusin', function(event) {
    if (isEmailField(event.target)) {
      // 记录当前激活的邮箱输入框
      activeEmailField = event.target;
      
      showTempEmailAssistant(event.target);
      
      // 通知background检测到邮箱输入框，但每个页面只通知一次
      if (!hasNotifiedEmailFieldDetection) {
        chrome.runtime.sendMessage({
          action: 'emailFieldDetected'
        });
        hasNotifiedEmailFieldDetection = true;
      }
    }
  });
  
  // 使用MutationObserver监听DOM变化
  const observer = new MutationObserver(function(mutations) {
    // 延迟执行以减少性能影响
    setTimeout(detectEmailFields, 500);
  });
  
  // 配置observer观察整个文档的子节点添加
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 找到所有可能的邮箱输入框
function findEmailFields() {
  const inputFields = document.querySelectorAll('input');
  return Array.from(inputFields).filter(field => isEmailField(field));
}

// 检测网页中所有可能的邮箱输入框
function detectEmailFields() {
  // 查找所有输入框
  const inputFields = document.querySelectorAll('input');
  
  inputFields.forEach(function(field) {
    if (isEmailField(field) && !field.dataset.tempEmailDetected) {
      // 标记已检测过的输入框
      field.dataset.tempEmailDetected = 'true';
      
      // 显示临时邮箱助手
      showTempEmailAssistant(field);
      
      // 通知background检测到邮箱输入框，但每个页面只通知一次
      if (!hasNotifiedEmailFieldDetection) {
        chrome.runtime.sendMessage({
          action: 'emailFieldDetected'
        });
        hasNotifiedEmailFieldDetection = true;
      }
    }
  });
}

// 判断一个元素是否为邮箱输入框
function isEmailField(element) {
  if (!element || element.tagName !== 'INPUT') {
    return false;
  }
  
  // 类型为email - 这是最明确的标识
  if (element.type === 'email') {
    return true;
  }
  
  // 获取属性值
  const nameAttr = (element.name || '').toLowerCase();
  const idAttr = (element.id || '').toLowerCase();
  const classAttr = (element.className || '').toLowerCase();
  const placeholderAttr = (element.placeholder || '').toLowerCase();
  const labelText = getLabelTextForInput(element).toLowerCase();
  
  // 检查标签文本是否明确提到邮箱
  if (labelText && EMAIL_IDENTIFIERS.some(id => labelText.includes(id))) {
    return true;
  }
  
  // 检查各种属性是否包含邮箱相关关键词 - 使用更严格的匹配
  for (const identifier of EMAIL_IDENTIFIERS) {
    // 完整单词匹配或包含完整单词
    const pattern = new RegExp(`(^|\\s|_|-|\\.)${identifier}(\\s|_|-|\\.|$)`, 'i');
    
    if (
      pattern.test(nameAttr) ||
      pattern.test(idAttr) ||
      pattern.test(classAttr) ||
      placeholderAttr.includes(identifier)
    ) {
      return true;
    }
  }
  
  // 检查是否包含"@"符号的占位符或值 - 这通常表示邮箱
  if (placeholderAttr.includes('@') || 
      (element.value && element.value.includes('@') && element.value.includes('.'))) {
    return true;
  }
  
  return false;
}

// 获取输入框关联的标签文本
function getLabelTextForInput(input) {
  // 通过for属性查找标签
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent.trim();
  }
  
  // 查找包含该输入框的标签
  let parent = input.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      return parent.textContent.trim();
    }
    // 向上查找最多5层
    if (parent.tagName === 'BODY' || !parent.parentElement) break;
    parent = parent.parentElement;
  }
  
  // 查找同一表单项容器中的标签或文本
  const formGroup = findFormGroup(input);
  if (formGroup) {
    const labels = formGroup.querySelectorAll('label');
    if (labels.length > 0) return labels[0].textContent.trim();
    
    // 可能还有其他文本元素包含提示
    const textElements = formGroup.querySelectorAll('span, div, p');
    for (const el of textElements) {
      const text = el.textContent.trim();
      if (text && text.length < 50) { // 避免获取太长的文本
        return text;
      }
    }
  }
  
  return '';
}

// 查找输入框所在的表单组
function findFormGroup(input) {
  let element = input.parentElement;
  const maxLevels = 3; // 最多向上查找3层
  let level = 0;
  
  while (element && level < maxLevels) {
    // 常见的表单组类名
    if (element.className && (
        element.className.includes('form-group') || 
        element.className.includes('input-group') ||
        element.className.includes('field') ||
        element.className.includes('form-item')
      )) {
      return element;
    }
    element = element.parentElement;
    level++;
  }
  
  return null;
}

// 在邮箱输入框旁显示临时邮箱助手
function showTempEmailAssistant(inputField) {
  // 记录当前激活的邮箱输入框
  activeEmailField = inputField;
  
  // 生成唯一标识符
  const inputId = inputField.id || inputField.name || generateUniqueId(inputField);
  
  // 检查该输入框是否已经有助手
  const existingAssistant = document.querySelector(`[data-for-input="${inputId}"]`);
  if (existingAssistant) {
    // 如果已经存在助手，则更新其显示时间并返回
    existingAssistant.dataset.showTime = Date.now();
    return;
  }
  
  // 创建助手元素
  const assistant = document.createElement('div');
  assistant.className = 'temp-email-assistant';
  assistant.dataset.forInput = inputId;
  assistant.dataset.showTime = Date.now();
  
  // 设置助手样式
  Object.assign(assistant.style, {
    position: 'absolute',
    zIndex: '9999',
    backgroundColor: '#4285f4',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    maxWidth: '250px',
    fontFamily: 'Arial, sans-serif',
    transition: 'opacity 0.3s ease-in-out'
  });
  
  // 获取输入框位置
  const inputRect = inputField.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  // 设置助手位置 - 默认在输入框右侧
  assistant.style.top = (inputRect.top + scrollTop) + 'px';
  assistant.style.left = (inputRect.right + scrollLeft + 10) + 'px';
  
  // 如果右侧空间不足，则显示在输入框下方
  if (inputRect.right + 250 > window.innerWidth) {
    assistant.style.left = (inputRect.left + scrollLeft) + 'px';
    assistant.style.top = (inputRect.bottom + scrollTop + 10) + 'px';
  }
  
  // 根据是否已有临时邮箱设置内容
  if (currentTempEmail) {
    assistant.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span style="margin-right: 8px;">使用临时邮箱</span>
        <button style="background-color: white; color: #4285f4; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-weight: bold;">填充</button>
      </div>
    `;
    
    // 点击填充按钮
    assistant.querySelector('button').addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      
      inputField.value = currentTempEmail;
      triggerInputEvents(inputField);
      
      // 隐藏助手
      hideAssistant(assistant);
    });
  } else {
    assistant.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span style="margin-right: 8px;">生成临时邮箱</span>
        <button style="background-color: white; color: #4285f4; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-weight: bold;">生成</button>
      </div>
    `;
    
    // 点击生成按钮
    assistant.querySelector('button').addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      
      // 发送消息到background要求自动生成并填充邮箱
      chrome.runtime.sendMessage({
        action: 'generateEmailForField'
      });
      
      // 隐藏助手
      hideAssistant(assistant);
    });
  }
  
  // 添加关闭按钮
  const closeButton = document.createElement('div');
  closeButton.innerHTML = '&times;';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '2px';
  closeButton.style.right = '5px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '14px';
  
  closeButton.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    hideAssistant(assistant);
  });
  
  assistant.appendChild(closeButton);
  document.body.appendChild(assistant);
  
  // 设置自动消失定时器（5秒后）
  setTimeout(function() {
    hideAssistant(assistant);
  }, 5000);
  
  // 点击空白处隐藏助手
  document.addEventListener('click', function hideAssistant(event) {
    if (!assistant.contains(event.target) && !inputField.contains(event.target)) {
      if (assistant.parentNode) {
        assistant.parentNode.removeChild(assistant);
      }
      document.removeEventListener('click', hideAssistant);
    }
  });
}

// 隐藏助手函数
function hideAssistant(assistant) {
  if (!assistant || !assistant.parentNode) return;
  
  assistant.style.opacity = '0';
  setTimeout(function() {
    if (assistant.parentNode) {
      assistant.parentNode.removeChild(assistant);
    }
  }, 300);
}

// 为输入框生成唯一ID
function generateUniqueId(element) {
  // 使用元素在页面中的XPath作为唯一标识
  let path = '';
  let node = element;
  
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let sibling = node;
    let siblingCount = 1;
    
    while (sibling = sibling.previousElementSibling) {
      siblingCount++;
    }
    
    const tagName = node.tagName.toLowerCase();
    path = `/${tagName}[${siblingCount}]${path}`;
    node = node.parentNode;
  }
  
  return path || Math.random().toString(36).substring(2, 10);
}

// 触发input和change事件
function triggerInputEvents(inputElement) {
  // 创建并分发事件
  const inputEvent = new Event('input', { bubbles: true });
  const changeEvent = new Event('change', { bubbles: true });
  
  inputElement.dispatchEvent(inputEvent);
  inputElement.dispatchEvent(changeEvent);
} 