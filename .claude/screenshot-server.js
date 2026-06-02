#!/usr/bin/env node
/**
 * 本地 Playwright 截图服务
 * 供 Obsidian Web Clipper 插件调用
 *
 * 用法：
 *   node screenshot-server.js --url "https://example.com" --output "/path/to/output.png"
 *   node screenshot-server.js --url "https://example.com" --output "/path/to/output.png" --translate
 *   node screenshot-server.js --url "https://example.com" --output "/path/to/output.mp4" --record scroll
 *
 * 参数：
 *   --url          目标网页URL（必填）
 *   --output       输出文件路径（必填）
 *   --translate    启用英文翻译为中文
 *   --full-page    整页截图（默认16:9视口）
 *   --width        视口宽度（默认1280）
 *   --height       视口高度（默认720）
 *   --delay        等待秒数（默认3）
 *   --record       录屏模式：scroll（滚动录屏）或 still（静态录屏）
 *   --duration     录屏时长秒数（默认15）
 *   --scroll-to    截图前先滚动到指定像素位置（如 --scroll-to 800）
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        url: '',
        output: '',
        translate: false,
        fullPage: false,
        width: 1280,
        height: 720,
        delay: 3,
        record: null,     // null | 'scroll' | 'still'
        duration: 15,
        scrollTo: 0,      // 截图前滚动到指定像素位置
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--url': opts.url = args[++i]; break;
            case '--output': opts.output = args[++i]; break;
            case '--translate': opts.translate = true; break;
            case '--full-page': opts.fullPage = true; break;
            case '--width': opts.width = parseInt(args[++i]) || 1280; break;
            case '--height': opts.height = parseInt(args[++i]) || 720; break;
            case '--delay': opts.delay = parseInt(args[++i]) || 3; break;
            case '--record': opts.record = args[++i] || 'scroll'; break;
            case '--duration': opts.duration = parseInt(args[++i]) || 15; break;
            case '--scroll-to': opts.scrollTo = parseInt(args[++i]) || 0; break;
        }
    }

    if (!opts.url || !opts.output) {
        console.error(JSON.stringify({ success: false, error: '缺少 --url 或 --output 参数' }));
        process.exit(1);
    }

    return opts;
}

// 翻译页面英文内容为中文
async function translatePage(page) {
    console.error('[翻译] 提取英文文本节点...');

    // 1. 提取所有英文文本节点
    const textItems = await page.evaluate(() => {
        const walker = document.createTreeWalker(
            document.body, NodeFilter.SHOW_TEXT, null
        );
        const items = [];
        let index = 0;
        while (walker.nextNode()) {
            const text = walker.currentNode.textContent.trim();
            if (text && /[a-zA-Z]{3,}/.test(text) && text.length > 5) {
                walker.currentNode.parentElement?.setAttribute('data-tr-id', String(index));
                items.push({ index, text });
                index++;
            }
        }
        return items;
    });

    if (textItems.length === 0) {
        console.error('[翻译] 页面无需翻译');
        return;
    }

    console.error(`[翻译] 找到 ${textItems.length} 个文本节点，开始翻译...`);

    // 2. Node端批量翻译（优先Google，备选MyMemory）
    const BATCH_SIZE = 5;
    const translations = {};
    let count = 0;

    // 单段翻译函数：Google优先，MyMemory备选
    async function translateBatch(text) {
        // 方案1：Google Translate（国内可用）
        try {
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
            const gResp = await fetch(gUrl, { signal: AbortSignal.timeout(10000) });
            const gData = await gResp.json();
            if (gData && gData[0]) {
                const result = gData[0].map(item => item[0]).join('');
                if (result && result !== text) return result;
            }
        } catch (e) {
            console.error('[翻译] Google失败:', e.message);
        }
        // 方案2：MyMemory（备选）
        try {
            const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
            const mResp = await fetch(mUrl, { signal: AbortSignal.timeout(10000) });
            const mData = await mResp.json();
            if (mData?.responseData?.translatedText) {
                const result = mData.responseData.translatedText;
                if (result && !result.includes('MYMEMORY WARNING') && result !== text) return result;
            }
        } catch (e) {
            console.error('[翻译] MyMemory失败:', e.message);
        }
        return null;
    }

    for (let i = 0; i < textItems.length; i += BATCH_SIZE) {
        const batch = textItems.slice(i, i + BATCH_SIZE);
        const combined = batch.map(b => b.text).join('\n');

        const result = await translateBatch(combined);
        if (result) {
            const parts = result.split('\n');
            for (let j = 0; j < batch.length && j < parts.length; j++) {
                const translated = parts[j]?.trim();
                if (translated && translated !== batch[j].text) {
                    translations[batch[j].index] = translated;
                    count++;
                }
            }
        }

        // 限速
        if (i + BATCH_SIZE < textItems.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // 3. 注入翻译结果
    await page.evaluate((map) => {
        for (const [id, text] of Object.entries(map)) {
            const el = document.querySelector(`[data-tr-id="${id}"]`);
            if (el) {
                for (const child of el.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 5) {
                        child.textContent = text;
                        break;
                    }
                }
            }
        }
    }, translations);

    console.error(`[翻译] 完成，翻译了 ${count} 个节点`);
}

// 截图
async function captureScreenshot(opts) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    try {
        const context = await browser.newContext({
            viewport: { width: opts.width, height: opts.height },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        console.error(`[截图] 加载页面: ${opts.url}`);
        await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 等待额外延迟
        if (opts.delay > 0) {
            await new Promise(r => setTimeout(r, opts.delay * 1000));
        }

        // 翻译
        if (opts.translate) {
            await translatePage(page);
            // 翻译后等一下让页面重排
            await new Promise(r => setTimeout(r, 500));
        }

        // 确保输出目录存在
        const dir = path.dirname(opts.output);
        await fs.mkdir(dir, { recursive: true });

        // 滚动到指定位置
        if (opts.scrollTo > 0) {
            console.error(`[截图] 滚动到 ${opts.scrollTo}px...`);
            await page.evaluate((y) => window.scrollTo(0, y), opts.scrollTo);
            await new Promise(r => setTimeout(r, 500));
        }

        // 截图
        console.error(`[截图] 正在截图...`);
        await page.screenshot({
            path: opts.output,
            fullPage: opts.fullPage
        });

        console.error(`[截图] 保存到: ${opts.output}`);

        // 输出JSON结果到stdout（插件读取）
        console.log(JSON.stringify({
            success: true,
            path: opts.output,
            width: opts.width,
            height: opts.height
        }));
    } finally {
        await browser.close();
    }
}

// 录屏（输出为连续截图的gif，因为Playwright不直接支持mp4录制）
async function captureRecording(opts) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    try {
        const context = await browser.newContext({
            viewport: { width: opts.width, height: opts.height },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            recordVideo: {
                dir: path.dirname(opts.output),
                size: { width: opts.width, height: opts.height }
            }
        });
        const page = await context.newPage();

        console.error(`[录屏] 加载页面: ${opts.url}`);
        await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        if (opts.delay > 0) {
            await new Promise(r => setTimeout(r, opts.delay * 1000));
        }

        if (opts.translate) {
            await translatePage(page);
            await new Promise(r => setTimeout(r, 500));
        }

        if (opts.record === 'scroll') {
            // 滚动录屏
            console.error(`[录屏] 滚动中...`);
            const scrollStep = 300;
            const scrollInterval = 200;
            const totalTime = opts.duration * 1000;
            const steps = Math.floor(totalTime / scrollInterval);

            for (let i = 0; i < steps; i++) {
                await page.evaluate((step) => window.scrollBy(0, step), scrollStep);
                await new Promise(r => setTimeout(r, scrollInterval));
            }
        } else {
            // 静态录屏，等待指定时长
            console.error(`[录屏] 静态录制 ${opts.duration} 秒...`);
            await new Promise(r => setTimeout(r, opts.duration * 1000));
        }

        // 关闭page获取录制文件
        const videoPath = await page.video()?.path();
        await context.close();

        if (videoPath) {
            // 移动到目标路径
            await fs.rename(videoPath, opts.output);
            console.log(JSON.stringify({ success: true, path: opts.output, isVideo: true }));
        } else {
            console.log(JSON.stringify({ success: false, error: '录屏失败：未生成视频文件' }));
        }
    } finally {
        await browser.close();
    }
}

// 主入口
async function main() {
    const opts = parseArgs();

    try {
        if (opts.record) {
            await captureRecording(opts);
        } else {
            await captureScreenshot(opts);
        }
    } catch (err) {
        console.log(JSON.stringify({ success: false, error: err.message }));
        process.exit(1);
    }
}

main();
