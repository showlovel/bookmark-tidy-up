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
  // 检查是否已有打开的窗口
  const windows = await chrome.windows.getAll();
  const currentWindow = await chrome.windows.getCurrent();
  
  const existingPopup = windows.find(window => 
    window.type === 'popup' && 
    window.id !== currentWindow.id
  );

  if (existingPopup) {
    // 如果已有窗口，则聚焦并关闭当前popup
    chrome.windows.update(existingPopup.id, { focused: true });
    window.close();
    return;
  }

  if (!isWindowCreated && currentWindow.type !== 'popup') {
    isWindowCreated = true;
    // 创建新窗口
    chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
    });
    // 关闭原始popup
    window.close();
  }

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
});

async function organizeBookmarks(bookmarkTree, categorizeBy) {
  // 重置计数器
  processedBookmarks = 0;
  totalBookmarks = 0;
  
  const categoryNameMap = {
    'domain': '按域名',
    'title': '按标题'
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
  const categoryFolder = await chrome.bookmarks.create({
    title: `${categoryNameMap[categorizeBy]}_${currentDate}_${currentTime}`
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
      
      // 使用 updateStatus 函数而不是直接操作 statusDiv
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

      let category;
      switch (categorizeBy) {
        case 'domain':
          const hostname = new URL(node.url).hostname;
          const domainParts = hostname.split('.');
          if (domainParts.length >= 2) {
            category = domainParts.slice(-2).join('.');
          } else {
            category = hostname;
          }
          break;
        case 'title':
          category = node.title.split(' ')[0];
          break;
      }
      
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