let isWindowCreated = false;
let processedBookmarks = 0;
let totalBookmarks = 0;

// 将辅助函数定义移到最前面
function updateProgress() {
  const percentage = Math.round((processedBookmarks / totalBookmarks) * 100);
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage);
  }
}

function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.className = `alert alert-${type} mb-3`;
  statusDiv.style.display = 'block';
  statusDiv.textContent = message;
}

document.addEventListener('DOMContentLoaded', async function() {
  // 原有的按钮和选择框事件监听保持不变
  const organizeBtn = document.getElementById('organize-chrome');
  const categorizeSelect = document.getElementById('categorize-by');
  const statusDiv = document.getElementById('status');

  organizeBtn?.addEventListener('click', async () => {
    const spinner = organizeBtn.querySelector('.spinner-border');
    organizeBtn.disabled = true;
    spinner.classList.remove('d-none');
    
    const categorizeBy = categorizeSelect.value;
    try {
      const bookmarks = await chrome.bookmarks.getTree();
      await organizeBookmarks(bookmarks[0], categorizeBy);
      updateStatus('书签整理完成！', 'success');
    } catch (error) {
      updateStatus('整理失败：' + error.message, 'danger');
    } finally {
      organizeBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  });

  // 添加分类方式切换监听
  const smartCategoriesDiv = document.getElementById('smart-categories');
  
  categorizeSelect.addEventListener('change', function() {
    smartCategoriesDiv.style.display = 
      this.value === 'smart' ? 'block' : 'none';
  });

  // 添加保存 API Key 的事件监听
  document.getElementById('save-api-key').addEventListener('click', async function() {
    const apiKey = document.getElementById('apiKey').value;
    if (apiKey) {
      try {
        await chrome.storage.sync.set({ openaiApiKey: apiKey });
        alert('API Key 设置成功！');
        // 关闭模态框
        const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
        modal.hide();
      } catch (error) {
        console.error('设置 API Key 失败:', error);
        alert('设置 API Key 失败，请重试。');
      }
    } else {
      alert('请输入有效的 API Key！');
    }
  });
});

async function organizeBookmarks(bookmarkTree, categorizeBy) {
  // 重置计数器
  processedBookmarks = 0;
  totalBookmarks = 0;
  
  const categoryNameMap = {
    'domain': '按域名',
    'title': '按标题',
    'smart': '智能分类'
  };
  
  // 获取用户是否选择检查失效链接
  const shouldCheckInvalid = document.getElementById('check-invalid').checked;
  
  function countBookmarks(node) {
    if (node.children) {
      node.children.forEach(countBookmarks);
    } else if (node.url) {
      totalBookmarks++;
    }
  }
  countBookmarks(bookmarkTree);
  
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  
  // 确保文件夹名称正确
  const folderPrefix = categoryNameMap[categorizeBy] || '未知分类';
  const categoryFolder = await chrome.bookmarks.create({
    title: `${folderPrefix}_${currentDate}_${currentTime}`
  });

  // 只在需要检查失效链接时创建失效链接文件夹
  let invalidFolder = null;
  if (shouldCheckInvalid) {
    invalidFolder = await chrome.bookmarks.create({
      parentId: categoryFolder.id,
      title: '失效链接'
    });
  }

  const categories = {};
  const addedUrls = new Set();

  async function getDeepSeekResponse(prompt, apiKey) {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: "你是一个智能助手，你的任务是根据用户提供的书签标题和URL来分类这些书签。你需要根据用户的指示对这些书签进行归类，并给出具体的类别名称。"
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 50,
          frequency_penalty: 0,
          presence_penalty: 0,
          response_format: {
            type: "text"
          },
          stream: false
        })
      });
  
      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      } else {
        console.error("Error:", response.status, await response.text());
        return null;
      }
    } catch (error) {
      console.error("Fetch error:", error);
      return null;
    }
  }

  async function getContentOfUrl(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, {
        signal: controller.signal
      })
      if (response.ok) {
        return response.text();
      } else {
        return "无法访问网页";
      }
    } catch (error) {
      return "无法访问网页"
    }
  }
  
  async function isValidUrl(url) {
    if (!shouldCheckInvalid) return true;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      return false;
    }
  }

  // 获取智能分类的类别
  let userCategories = [];
  if (categorizeBy === 'smart') {
    const categoryInput = document.getElementById('category-input').value;
    userCategories = categoryInput.split('\n')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0);
    
    if (userCategories.length === 0) {
      throw new Error('请至少输入一个分类类别！');
    }
  }

  // 修改获取分类的逻辑
  async function getCategory(bookmark) {
    if (categorizeBy === 'smart') {
      try {
        // 获取保存的 API key
        const storageResult = await chrome.storage.sync.get(['openaiApiKey']);
        // const apiKey = storageResult.openaiApiKey;
        const apiKey = "sk-9a9d01383a7d401db6def065c49c9cb2"
        
        if (!apiKey) {
          throw new Error('请先在扩展设置中配置 OpenAI API Key');
        }

        urlContent = await getContentOfUrl(bookmark.url)

        const prompt = `请将以下书签分类到这些类别中的一个：${userCategories.join('、')}
书签标题: ${bookmark.title}
书签URL: ${bookmark.url}
书签内容: ${urlContent}
如果书签内容为 无法访问网页 则不需要参考书签内容
请只返回一个最合适的类别名称，不需要任何解释`;

        const response = await getDeepSeekResponse(prompt, apiKey);

        console.log('AI分类结果:', response);

        return response;
      } catch (error) {
        console.error('AI分类失败:', error);
        updateStatus(`AI分类失败: ${error.message}`, 'warning');
        return '其他';
      }
    } else {
      // 原有的分类逻辑
      switch (categorizeBy) {
        case 'domain':
          const hostname = new URL(bookmark.url).hostname;
          const domainParts = hostname.split('.');
          if (domainParts.length >= 2) {
            return domainParts.slice(-2).join('.');
          }
          return hostname;
        case 'title':
          return bookmark.title.split(' ')[0];
      }
    }
  }

  async function traverseBookmarks(node) {
    if (node.title && node.title.includes(categoryNameMap[categorizeBy])) {
      return;
    }
    
    if (node.children) {
      for (const child of node.children) {
        await traverseBookmarks(child);
      }
    } else if (node.url) {
      if (addedUrls.has(node.url)) {
        processedBookmarks++;
        updateProgress();
        return;
      }
      
      updateStatus(`正在处理第 ${processedBookmarks + 1}/${totalBookmarks} 个书签: ${node.title}`);
      
      const isValid = await isValidUrl(node.url);
      
      if (!isValid && shouldCheckInvalid) {
        await chrome.bookmarks.create({
          parentId: invalidFolder.id,
          title: node.title,
          url: node.url
        });
        addedUrls.add(node.url);
        processedBookmarks++;
        updateProgress();
        return;
      }

      // 使用新的 getCategory 函数
      const category = await getCategory(node);
      
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push(node);
      addedUrls.add(node.url);
      processedBookmarks++;
      updateProgress();
    }
  }

  await traverseBookmarks(bookmarkTree);

  // 创建分类文件夹并移动书签
  for (const [category, bookmarks] of Object.entries(categories)) {
    const subFolder = await chrome.bookmarks.create({
      parentId: categoryFolder.id,
      title: category
    });

    for (const bookmark of bookmarks) {
      await chrome.bookmarks.create({
        parentId: subFolder.id,
        title: bookmark.title,
        url: bookmark.url
      });
    }
  }
  
  // 确保最后进度为100%
  processedBookmarks = totalBookmarks;
  updateProgress();
  
  // 完成后更新状态
  updateStatus('书签整理完成！', 'success');
} 