document.addEventListener('DOMContentLoaded', function() {
  // 加载保存的 API key
  chrome.storage.sync.get(['openaiApiKey'], function(result) {
    document.getElementById('apiKey').value = result.openaiApiKey || '';
  });

  // 保存按钮点击事件
  document.getElementById('save').addEventListener('click', function() {
    const apiKey = document.getElementById('apiKey').value;
    chrome.storage.sync.set({
      openaiApiKey: apiKey
    }, function() {
      const status = document.getElementById('status');
      status.textContent = '设置已保存';
      status.className = 'alert alert-success mt-3';
      status.style.display = 'block';
      setTimeout(function() {
        status.style.display = 'none';
      }, 2000);
    });
  });

  const setApiKeyButton = document.getElementById('set-api-key');

  setApiKeyButton.addEventListener('click', async function() {
    const apiKey = prompt('请输入您的 OpenAI API Key:');
    if (apiKey) {
      try {
        await chrome.storage.sync.set({ openaiApiKey: apiKey });
        alert('API Key 设置成功！');
      } catch (error) {
        console.error('设置 API Key 失败:', error);
        alert('设置 API Key 失败，请重试。');
      }
    }
  });
}); 