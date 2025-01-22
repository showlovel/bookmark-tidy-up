document.addEventListener('DOMContentLoaded', function() {
  const organizeBtn = document.getElementById('organize-chrome');
  const categorizeSelect = document.getElementById('categorize-by');
  const statusDiv = document.getElementById('status');

  // 处理Chrome书签整理
  organizeBtn.addEventListener('click', async () => {
    const categorizeBy = categorizeSelect.value;
    try {
      const bookmarks = await chrome.bookmarks.getTree();
      await organizeBookmarks(bookmarks[0], categorizeBy);
      statusDiv.textContent = '书签整理完成！';
    } catch (error) {
      statusDiv.textContent = '整理失败：' + error.message;
    }
  });
});

async function organizeBookmarks(bookmarkTree, categorizeBy) {
  // 获取分类方式的中文名称
  const categoryNameMap = {
    'domain': '按域名',
    'title': '按标题'
  };
  
  // 创建分类文件夹，使用新的命名格式
  const currentDate = new Date().toISOString().split('T')[0];
  const categoryFolder = await chrome.bookmarks.create({
    title: `${categoryNameMap[categorizeBy]}_${currentDate}`
  });

  const categories = {};
  // 用于存储已添加的URL，防止重复
  const addedUrls = new Set();
  
  function traverseBookmarks(node) {
    if (node.children) {
      node.children.forEach(traverseBookmarks);
    } else if (node.url) {
      if (addedUrls.has(node.url)) {
        return;
      }
      
      let category;
      switch (categorizeBy) {
        case 'domain':
          // 提取二级域名
          const hostname = new URL(node.url).hostname;
          const domainParts = hostname.split('.');
          // 处理二级域名
          if (domainParts.length >= 2) {
            // 获取最后两部分作为域名（例如：v2ex.com）
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
    }
  }

  traverseBookmarks(bookmarkTree);

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
} 