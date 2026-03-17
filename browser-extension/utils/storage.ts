const API_KEY_STORAGE_KEY = 'acp_api_key';

/** 从 chrome.storage.local 读取 API key，不上传到任何服务器 */
export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  return (result[API_KEY_STORAGE_KEY] as string) ?? null;
}

/** 将 API key 保存到 chrome.storage.local */
export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
}

/** 清除已保存的 API key */
export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
}
