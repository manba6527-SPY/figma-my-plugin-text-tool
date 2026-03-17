// Figma 字号统一修改工具
// 核心逻辑文件
// 全局变量
let allTextNodes = []; // 所有文本节点
let fontSizeStatistics = {}; // 字号统计信息
let fontStatistics = {}; // 字体统计信息
let colorStatistics = {}; // 颜色统计信息

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
  colorStatistics = {};
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
          
          // 收集颜色信息
          const fills = node.getRangeFills(i, i + 1);
          if (fills.length > 0 && fills[0].type === 'SOLID') {
            const color = rgbaToHex(fills[0].color);
            colorStatistics[color] = (colorStatistics[color] || 0) + 1;
          } else if (fills.length > 0) {
            // 收集渐变颜色信息
            // 渐变的key使用其类型和位置信息生成
            const gradientKey = `${fills[0].type}_${fills[0].gradientTransform ? JSON.stringify(fills[0].gradientTransform) : 'unknown'}`;
            colorStatistics[gradientKey] = (colorStatistics[gradientKey] || 0) + 1;
          }
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
        
        // 收集颜色信息
        if (node.fills && node.fills.length > 0 && node.fills[0].type === 'SOLID') {
          const color = rgbaToHex(node.fills[0].color);
          colorStatistics[color] = (colorStatistics[color] || 0) + 1;
        } else if (node.fills && node.fills.length > 0) {
          // 收集渐变颜色信息
          // 渐变的key使用其类型和位置信息生成
          const gradientKey = `${node.fills[0].type}_${node.fills[0].gradientTransform ? JSON.stringify(node.fills[0].gradientTransform) : 'unknown'}`;
          colorStatistics[gradientKey] = (colorStatistics[gradientKey] || 0) + 1;
        }
      }
    } catch (error) {
      // 容错处理：跳过有问题的节点
      console.error('处理文本节点时出错:', error);
    }
  });
  
  // 发送扫描结果到UI
  sendScanResults();
}

// RGBA颜色转换为Hex格式（仅考虑RGB，忽略alpha通道）
function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  
  // 始终使用6位Hex格式
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Hex颜色转换为RGBA格式
function hexToRgba(hex) {
  // 移除#符号并转换为小写
  hex = hex.replace('#', '').toLowerCase();
  
  // 解析6位或8位Hex值
  let r, g, b, a;
  if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = 1;
  } else if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else {
    // 默认返回黑色
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  
  return { r, g, b, a };
}

// 发送扫描结果到UI
function sendScanResults() {
  if (Object.keys(fontSizeStatistics).length === 0) {
    // 没有找到文本节点
    figma.ui.postMessage({ type: 'noTextFound' });
  } else {
    // 发送字号、字体和颜色统计数据
    figma.ui.postMessage({ 
      type: 'scanComplete', 
      fontSizeStats: fontSizeStatistics,
      fontStats: fontStatistics,
      colorStats: colorStatistics
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

// 统一修改颜色
async function unifyColors(sourceColor, targetColor) {
  let modifiedCount = 0;
  console.log('Unifying colors:', sourceColor, '→', targetColor);
  
  // 解析目标颜色为RGBA格式
  const targetRgba = hexToRgba(targetColor);
  const targetFill = {
    type: 'SOLID',
    color: targetRgba
  };
  console.log('Target fill:', targetFill);
  
  // 判断源颜色是纯色还是渐变
  const isSourceGradient = !sourceColor.startsWith('#');
  
  for (const node of allTextNodes) {
    try {
      if (node.locked) continue;
      
      if (node.hasMixedFills) {
        // 处理混合颜色的情况
        const characters = node.characters;
        for (let i = 0; i < characters.length; i++) {
          const currentFills = node.getRangeFills(i, i + 1);
          if (currentFills.length > 0) {
            let shouldModify = false;
            
            if (isSourceGradient) {
              // 源颜色是渐变
              if (currentFills[0].type !== 'SOLID') {
                // 生成渐变的key
                const currentGradientKey = `${currentFills[0].type}_${currentFills[0].gradientTransform ? JSON.stringify(currentFills[0].gradientTransform) : 'unknown'}`;
                shouldModify = currentGradientKey === sourceColor;
              }
            } else {
              // 源颜色是纯色
              if (currentFills[0].type === 'SOLID') {
                const currentColor = rgbaToHex(currentFills[0].color);
                shouldModify = currentColor === sourceColor;
              }
            }
            
            if (shouldModify) {
              // 查找连续相同颜色的范围
              let end = i + 1;
              while (end < characters.length) {
                const nextFills = node.getRangeFills(end, end + 1);
                if (nextFills.length === 0) break;
                
                let isSameAsSource = false;
                if (isSourceGradient) {
                  // 源颜色是渐变
                  if (nextFills[0].type !== 'SOLID') {
                    const nextGradientKey = `${nextFills[0].type}_${nextFills[0].gradientTransform ? JSON.stringify(nextFills[0].gradientTransform) : 'unknown'}`;
                    isSameAsSource = nextGradientKey === sourceColor;
                  }
                } else {
                  // 源颜色是纯色
                  if (nextFills[0].type === 'SOLID') {
                    const nextColor = rgbaToHex(nextFills[0].color);
                    isSameAsSource = nextColor === sourceColor;
                  }
                }
                
                if (!isSameAsSource) break;
                end++;
              }
              
              // 修改颜色
              node.setRangeFills(i, end, [targetFill]);
              modifiedCount++;
              
              i = end - 1;
            }
          }
        }
      } else {
        // 处理单一颜色的情况
        if (node.fills && node.fills.length > 0) {
          let shouldModify = false;
          
          if (isSourceGradient) {
            // 源颜色是渐变
            if (node.fills[0].type !== 'SOLID') {
              const currentGradientKey = `${node.fills[0].type}_${node.fills[0].gradientTransform ? JSON.stringify(node.fills[0].gradientTransform) : 'unknown'}`;
              shouldModify = currentGradientKey === sourceColor;
            }
          } else {
            // 源颜色是纯色
            if (node.fills[0].type === 'SOLID') {
              const currentColor = rgbaToHex(node.fills[0].color);
              shouldModify = currentColor === sourceColor;
            }
          }
          
          if (shouldModify) {
            // 修改颜色
            node.fills = [targetFill];
            modifiedCount++;
          }
        }
      }
    } catch (error) {
      console.error('修改颜色时出错:', error);
      // 容错处理：继续处理下一个节点
    }
  }
  
  console.log('Modified', modifiedCount, 'nodes');
  // 发送修改结果到UI
  figma.ui.postMessage({ 
    type: 'unifyColorComplete', 
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
    } else if (msg.type === 'unifyColor') {
      // 统一修改颜色
      unifyColors(msg.sourceColor, msg.targetColor);
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