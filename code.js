// Figma 字号统一修改工具
// 核心逻辑文件
// 全局变量
let allTextNodes = []; // 所有文本节点
let fontSizeStatistics = {}; // 字号统计信息
let fontStatistics = {}; // 字体统计信息

// 初始化插件UI
figma.showUI(__html__, {
  width: 320,
  height: 520
});

// 扫描文本节点并收集字号统计信息
function scanTextNodes() {
  // 重置统计数据
  allTextNodes = [];
  fontSizeStatistics = {};
  fontStatistics = {};
  let targetTextNodes = [];
  
  // 自动检测选择状态：如果有选中的图层，扫描选中的容器，否则扫描整个页面
  const selectedLayers = figma.currentPage.selection;
  
  if (selectedLayers.length > 0) {
    // 有选中的图层：扫描选中的容器及其子图层
    // 遍历所有选择的图层
    selectedLayers.forEach(layer => {
      // 使用findAll方法递归查找所有文本节点
      if (layer.findAll) {
        targetTextNodes.push(...layer.findAll(node => node.type === 'TEXT'));
      } else if (layer.type === 'TEXT') {
        // 如果图层本身就是文本节点，直接添加
        targetTextNodes.push(layer);
      }
    });
  } else {
    // 没有选中的图层：扫描当前页面所有文本节点
    targetTextNodes = figma.currentPage.findAll(node => node.type === 'TEXT');
  }
  
  // 处理每个文本节点，收集字号、字体和颜色信息
  targetTextNodes.forEach(node => {
    try {
      // 跳过锁定的节点
      if (node.locked) return;
      
      // 添加到全局文本节点列表
      allTextNodes.push(node);
      
      // 处理文本节点的字号和字体
      if (node.hasMixedFontSizes || node.hasMixedFontNames || node.hasMixedFills) {
        // 混合字号/字体/颜色：处理每个字符
        const characters = node.characters;
        for (let i = 0; i < characters.length; i++) {
          // 收集字号信息
          const size = Math.round(node.getRangeFontSize(i, i + 1));
          fontSizeStatistics[size] = (fontSizeStatistics[size] || 0) + 1;
          
          // 收集字体信息
          const fontName = node.getRangeFontName(i, i + 1);
          const fontKey = `${fontName.family} ${fontName.style}`;
          fontStatistics[fontKey] = (fontStatistics[fontKey] || 0) + 1;
          

        }
      } else {
        // 单一字号/字体/颜色：直接获取
        // 收集字号信息
        const size = Math.round(node.fontSize);
        fontSizeStatistics[size] = (fontSizeStatistics[size] || 0) + 1;
        
        // 收集字体信息
        const fontName = node.fontName;
        const fontKey = `${fontName.family} ${fontName.style}`;
        fontStatistics[fontKey] = (fontStatistics[fontKey] || 0) + 1;
        

      }
    } catch (error) {
      // 容错处理：跳过有问题的节点
      console.error('处理文本节点时出错:', error);
    }
  });
  
  // 发送扫描结果到UI
  sendScanResults();
}



// 发送扫描结果到UI
function sendScanResults() {
  if (Object.keys(fontSizeStatistics).length === 0) {
    // 没有找到文本节点
    figma.ui.postMessage({ type: 'noTextFound' });
  } else {
    // 发送扫描结果到UI
  figma.ui.postMessage({ 
    type: 'scanComplete', 
    fontSizeStats: fontSizeStatistics,
    fontStats: fontStatistics
  });
  }
}

// 统一修改字号
async function unifyFontSizes(sourceSize, targetSize) {
  let modifiedCount = 0;
  
  // 参数验证
  sourceSize = Number(sourceSize);
  targetSize = Number(targetSize);
  
  if (isNaN(sourceSize) || isNaN(targetSize) || targetSize < 1) {
    figma.ui.postMessage({ 
      type: 'unifyComplete', 
      count: 0 
    });
    return;
  }
  
  // 遍历所有文本节点，修改匹配的字号
  for (const node of allTextNodes) {
    try {
      // 跳过锁定的节点
      if (node.locked) continue;
      
      if (node.hasMixedFontSizes) {
        // 混合字号：处理每个字符
        const characters = node.characters;
        for (let i = 0; i < characters.length; i++) {
          const currentSize = Math.round(node.getRangeFontSize(i, i + 1));
          if (currentSize === sourceSize) {
            // 加载字体
            const fontName = node.getRangeFontName(i, i + 1);
            await figma.loadFontAsync(fontName);
            
            // 查找连续相同字号的范围，提高效率
            let end = i + 1;
            while (end < characters.length && 
                   Math.round(node.getRangeFontSize(end, end + 1)) === sourceSize) {
              end++;
            }
            
            // 修改字号
            node.setRangeFontSize(i, end, targetSize);
            modifiedCount++;
            
            // 更新索引
            i = end - 1;
          }
        }
      } else {
        // 单一字号：直接修改
        const currentSize = Math.round(node.fontSize);
        if (currentSize === sourceSize) {
          // 加载字体
          await figma.loadFontAsync(node.fontName);
          
          // 修改字号
          node.fontSize = targetSize;
          modifiedCount++;
        }
      }
    } catch (error) {
      // 容错处理：跳过有问题的节点
      console.error('修改文本节点时出错:', error);
    }
  }
  
  // 发送修改结果到UI
  figma.ui.postMessage({ 
    type: 'unifyComplete', 
    count: modifiedCount 
  });
  
  // 重新扫描以更新统计信息
  setTimeout(() => {
    scanTextNodes();
  }, 300);
}

// 统一修改字体
async function unifyFonts(sourceFont, targetFonts) {
  let modifiedCount = 0;
  
  // 解析目标字体列表（可能为多个，逗号分隔）
  const targetFontList = targetFonts.split(',').map(font => font.trim()).filter(font => font !== '');
  
  if (targetFontList.length === 0) {
    figma.ui.postMessage({ 
      type: 'error', 
      message: '请选择至少一个目标字体' 
    });
    return;
  }
  
  // 解析所有目标字体的家族和样式
  const parsedTargetFonts = targetFontList.map(font => {
    const [family, ...styleParts] = font.split(' ');
    return {
      family,
      style: styleParts.join(' ') || 'Regular'
    };
  });
  
  for (const node of allTextNodes) {
    try {
      if (node.locked) continue;
      
      if (node.hasMixedFontSizes || node.hasMixedFontNames) {
        // 处理混合字体的情况
        const characters = node.characters;
        for (let i = 0; i < characters.length; i++) {
          const currentFont = node.getRangeFontName(i, i + 1);
          const currentFontKey = `${currentFont.family} ${currentFont.style}`;
          
          if (currentFontKey === sourceFont) {
            // 加载字体
            await figma.loadFontAsync(currentFont);
            
            // 查找连续相同字体的范围
            let end = i + 1;
            while (end < characters.length) {
              const nextFont = node.getRangeFontName(end, end + 1);
              const nextFontKey = `${nextFont.family} ${nextFont.style}`;
              if (nextFontKey !== sourceFont) break;
              end++;
            }
            
            // 选择目标字体（使用第一个可用的目标字体）
            const targetFont = parsedTargetFonts[0];
            
            // 修改字体
            node.setRangeFontName(i, end, targetFont);
            modifiedCount++;
            
            i = end - 1;
          }
        }
      } else {
        // 处理单一字体的情况
        const currentFont = node.fontName;
        const currentFontKey = `${currentFont.family} ${currentFont.style}`;
        
        if (currentFontKey === sourceFont) {
          // 加载字体
          await figma.loadFontAsync(currentFont);
          
          // 选择目标字体（使用第一个可用的目标字体）
          const targetFont = parsedTargetFonts[0];
          
          // 修改字体
          node.fontName = targetFont;
          modifiedCount++;
        }
      }
    } catch (error) {
      console.error('修改字体时出错:', error);
      // 容错处理：继续处理下一个节点
    }
  }
  
  // 发送修改结果到UI
  figma.ui.postMessage({ 
    type: 'unifyFontComplete', 
    count: modifiedCount 
  });
  
  // 修改完成后重新扫描
  scanTextNodes();
}



// 监听来自UI的消息
figma.ui.onmessage = (msg) => {
  try {
    if (msg.type === 'scan') {
      // 自动扫描，无需指定scope
      scanTextNodes();
    } else if (msg.type === 'unify') {
      // 统一修改字号
      unifyFontSizes(msg.sourceSize, msg.targetSize);
    } else if (msg.type === 'unifyFont') {
      // 统一修改字体
      unifyFonts(msg.sourceFont, msg.targetFont);
  
    }
  } catch (error) {
    console.error('处理UI消息时出错:', error);
    figma.ui.postMessage({ type: 'error', message: '操作失败，请重试' });
  }
};

// 插件启动时自动扫描
scanTextNodes();

// 监听图层选择变化 - 自动重新扫描
figma.on('selectionchange', () => {
  scanTextNodes();
});

// 监听当前页面变化 - 自动重新扫描
figma.on('currentpagechange', () => {
  scanTextNodes();
});