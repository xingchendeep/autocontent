/**
 * MV3 Service Worker
 * 处理插件安装事件，转发 content script 与 popup 之间的消息
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[AutoContent Pro] 插件已安装，请在设置中配置 API Key');
  } else if (details.reason === 'update') {
    console.log('[AutoContent Pro] 插件已更新至', chrome.runtime.getManifest().version);
  }
});

// 转发 content script 发送的消息到 popup
chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    const msg = message as { type: string };

    if (msg.type === 'CONTENT_EXTRACTED') {
      // 广播给所有扩展页面（popup）
      chrome.runtime.sendMessage(message).catch(() => {
        // popup 未打开时忽略错误
      });
    }

    sendResponse({ received: true });
    return true; // 保持消息通道开放
  },
);
