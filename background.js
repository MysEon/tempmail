// 存储侧边栏状态
let sidebarTabId = null;
// 存储最近显示通知的时间
let lastNotificationTimeByTab = {};

// 监听来自content scripts的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'emailFieldDetected') {
    // 邮箱输入框被检测到，更新图标状态
    showPageActionIcon(sender.tab.id);
  } else if (request.action === 'openPopup') {
    // 打开插件的弹出窗口
    chrome.action.openPopup();
  } else if (request.action === 'closeSidebar') {
    // 关闭侧边栏
    closeSidebar();
  } else if (request.action === 'generateEmailForField') {
    // 自动生成邮箱并通知content.js填充到表单
    generateEmailAndFill(sender.tab.id);
  }
  return true;
});

// 自动生成邮箱并通知content.js填充
function generateEmailAndFill(tabId) {
  // 生成随机邮箱地址
  const randomUsername = 'temp' + Math.random().toString(36).substring(2, 10);
  const email = `${randomUsername}@mail.cx`;
  
  // 保存到storage
  chrome.storage.local.set({
    tempEmail: email,
    lastEmailCount: 0,
    generateTime: Date.now() // 添加生成时间
  }, function() {
    // 保存成功后通知当前页面填充邮箱
    chrome.tabs.sendMessage(tabId, {
      action: 'fillEmail',
      email: email
    });
    
    // 通知所有其他打开的标签页更新邮箱
    notifyAllTabsToUpdateEmail(email, tabId);
    
    // 显示通知
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '临时邮箱已生成',
        message: `已生成临时邮箱: ${email}，并自动填充到表单`
      });
    } catch (error) {
      console.error('通知创建失败', error);
    }
  });
}

// 通知所有标签页更新临时邮箱
function notifyAllTabsToUpdateEmail(email, exceptTabId) {
  chrome.tabs.query({}, function(tabs) {
    for (const tab of tabs) {
      // 跳过触发生成的标签页，因为它已经通过fillEmail更新了
      if (tab.id === exceptTabId) continue;
      
      // 向其他所有标签页发送更新消息
      try {
        chrome.tabs.sendMessage(tab.id, {
          action: 'updateTempEmail',
          email: email
        });
      } catch (error) {
        // 忽略错误，有些标签页可能没有加载content脚本
        console.log('向标签页发送更新消息失败', tab.id, error);
      }
    }
  });
}

// 在显示邮箱输入框的页面上显示图标提示
function showPageActionIcon(tabId) {
  const now = Date.now();
  
  // 检查是否在短时间内已经显示过通知，防止频繁通知
  if (lastNotificationTimeByTab[tabId] && (now - lastNotificationTimeByTab[tabId] < 30000)) { // 30秒内不重复显示
    return;
  }
  
  // 更新最近通知时间
  lastNotificationTimeByTab[tabId] = now;
  
  // 获取已保存的邮箱
  chrome.storage.local.get(['tempEmail'], function(result) {
    // 如果已经有临时邮箱，显示通知
    if (result.tempEmail) {
      chrome.action.setBadgeText({
        text: '📧',
        tabId: tabId
      });
      
      // 尝试显示通知，如果没有通知权限则跳过
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '检测到邮箱输入框',
          message: '点击插件图标使用临时邮箱 ' + result.tempEmail
        });
      } catch (error) {
        console.error('通知创建失败', error);
        // 没有通知权限时静默失败
      }
    }
  });
}

// 在标签页关闭时清理通知记录
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  delete lastNotificationTimeByTab[tabId];
});

// 当用户导航到新页面时，重置该标签页的通知标记
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading') {
    delete lastNotificationTimeByTab[tabId];
    // 通知content脚本重置通知标记
    try {
      chrome.tabs.sendMessage(tabId, {
        action: 'resetNotificationFlag'
      });
    } catch (error) {
      // 忽略错误，可能是content脚本尚未加载
    }
  }
});

// 安装或更新插件时运行的逻辑
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('临时邮箱生成器已安装或更新', details.reason);
  
  // 只在首次安装时打开欢迎页面，而不是每次更新或启动时
  if (details.reason === 'install') {
    console.log('首次安装，打开欢迎页面');
    // 显示欢迎消息
    chrome.tabs.create({
      url: 'https://mail.cx/zh/'
    });
  }
});

// 处理每10分钟检查一次新邮件的逻辑
try {
  chrome.alarms.create('checkEmails', {
    periodInMinutes: 10
  });

  chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === 'checkEmails') {
      chrome.storage.local.get(['tempEmail'], function(result) {
        if (result.tempEmail) {
          checkNewEmails(result.tempEmail);
        }
      });
    }
  });
} catch (error) {
  console.error('创建定时任务失败', error);
  // 如果创建定时任务失败，则静默失败
}

// 检查是否有新邮件
async function checkNewEmails(email) {
  try {
    const mailboxName = email;
    const baseUrl = 'https://api.mail.cx/api/v1';
    
    // 获取授权令牌
    const authResponse = await fetch(`${baseUrl}/auth/authorize_token`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Authorization': 'Bearer undefined'
      }
    });
    
    if (!authResponse.ok) {
      throw new Error(`授权失败: ${authResponse.status}`);
    }
    
    const authData = await authResponse.json();
    const token = authData.token || authData; // 可能直接返回token字符串或包含token属性的对象
    
    // 获取邮件列表
    const response = await fetch(`${baseUrl}/mailbox/${encodeURIComponent(mailboxName)}`, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取邮件失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 获取上次检查时的邮件数量
    chrome.storage.local.get(['lastEmailCount'], function(result) {
      const lastCount = result.lastEmailCount || 0;
      const currentCount = Array.isArray(data) ? data.length : 0;
      
      if (currentCount > lastCount) {
        // 有新邮件，发送通知
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '新邮件提醒',
            message: `您的临时邮箱 ${email} 收到了 ${currentCount - lastCount} 封新邮件`,
            buttons: [
              { title: '查看邮件' }
            ]
          }, function(notificationId) {
            // 保存通知ID，以便之后处理点击事件
            chrome.storage.local.set({lastNotificationId: notificationId});
          });
        } catch (error) {
          console.error('通知创建失败', error);
        }
        
        // 如果侧边栏已经打开，刷新邮件列表
        if (sidebarTabId) {
          chrome.tabs.sendMessage(sidebarTabId, {
            action: 'refreshEmails'
          });
        }
      }
      
      // 更新邮件数量
      chrome.storage.local.set({lastEmailCount: currentCount});
    });
  } catch (error) {
    console.error('检查邮件失败:', error);
    // 出错时不显示错误通知，避免干扰用户
  }
}

// 监听通知点击事件
chrome.notifications.onButtonClicked.addListener(function(notificationId, buttonIndex) {
  chrome.storage.local.get(['lastNotificationId'], function(result) {
    if (notificationId === result.lastNotificationId && buttonIndex === 0) {
      // 用户点击了"查看邮件"按钮
      openSidebar();
    }
  });
});

// 打开侧边栏
function openSidebar() {
  // 如果侧边栏已经打开，就关闭它
  if (sidebarTabId) {
    closeSidebar();
    return;
  }
  
  // 获取当前活动窗口
  chrome.windows.getCurrent(function(currentWindow) {
    // 计算侧边栏的位置和大小
    const width = 350;
    const height = currentWindow.height;
    const left = currentWindow.left + currentWindow.width - width;
    const top = currentWindow.top;
    
    // 创建一个新窗口作为侧边栏
    chrome.windows.create({
      url: chrome.runtime.getURL('sidebar.html'),
      type: 'popup',
      width: width,
      height: height,
      left: left,
      top: top,
      focused: true
    }, function(window) {
      // 保存侧边栏的标签ID
      sidebarTabId = window.tabs[0].id;
    });
  });
}

// 关闭侧边栏
function closeSidebar() {
  if (sidebarTabId) {
    chrome.tabs.get(sidebarTabId, function(tab) {
      if (chrome.runtime.lastError) {
        // 标签可能已经被关闭
        sidebarTabId = null;
        return;
      }
      
      chrome.tabs.remove(sidebarTabId, function() {
        sidebarTabId = null;
      });
    });
  }
}

// 检测到新邮件时，显示查看按钮
chrome.action.onClicked.addListener(function(tab) {
  chrome.storage.local.get(['tempEmail'], function(result) {
    if (result.tempEmail) {
      // 切换侧边栏
      if (sidebarTabId) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }
  });
}); 