# Chrome Bookmark Organizer

一个简单的 Chrome 插件，用于自动整理和分类浏览器书签。

## 功能特点

- 支持两种分类方式：
  - 按域名分类：将相同域名的书签归类到同一文件夹
    - 自动合并二级域名（如 www.v2ex.com 和 v2ex.com 会归类到同一文件夹）
  - 按网页标题分类：使用书签标题的第一个词作为分类依据

- 自动去重：相同 URL 的书签只会保留一个
- 分类结果会创建新文件夹，格式为"分类方式_日期"（如：按域名_2024-03-20）
- 原有书签不会被删除或修改

## 安装方法

1. 下载本项目所有文件并解压到本地文件夹
2. 打开 Chrome 浏览器，进入扩展程序页面（chrome://extensions/）
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择包含插件文件的文件夹

## 使用方法

1. 点击 Chrome 工具栏中的插件图标
2. 在弹出窗口中选择分类方式（按域名/按标题）
3. 点击"整理 Chrome 书签"按钮
4. 等待提示"书签整理完成"

## 文件结构

- `manifest.json`: 插件配置文件
- `popup.html`: 插件弹出窗口的 HTML 界面
- `popup.js`: 主要功能逻辑
- `background.js`: 后台服务脚本

## 注意事项

- 建议在使用前备份重要书签
- 整理过程会创建新的书签文件夹，不会删除原有书签
- 整理完成后可以在书签管理器中查看分类结果 