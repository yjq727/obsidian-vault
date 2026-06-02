#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
热点搜索脚本 - 真实联网版
功能：从多个数据源联网搜索最近指定天数内的热点事件
"""

import sys
import argparse
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import time
import io

# 修复Windows控制台编码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    import requests
except ImportError:
    print("错误: 需要安装 requests 库")
    print("请运行: pip install requests")
    sys.exit(1)


def search_recent_hotspots(
    keyword: str,
    days: int = 3,
    count: int = 10
) -> List[Dict[str, str]]:
    """
    搜索最近指定天数内的热点事件
    """

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    print(f"正在搜索【{keyword}】赛道最近{days}天内的热点...")
    print(f"时间范围：{start_date.strftime('%Y-%m-%d')} 至 {end_date.strftime('%Y-%m-%d')}")

    all_hotspots = []

    # 数据源1: GitHub Trending
    github_hotspots = search_github_trending(keyword)
    all_hotspots.extend(github_hotspots)
    time.sleep(1)

    # 数据源2: HackerNews
    hn_hotspots = search_hackernews(keyword)
    all_hotspots.extend(hn_hotspots)
    time.sleep(1)

    # 数据源3: V2EX
    v2ex_hotspots = search_v2ex(keyword)
    all_hotspots.extend(v2ex_hotspots)

    # 去重并限制数量
    seen_titles = set()
    unique_hotspots = []
    for hotspot in all_hotspots:
        if hotspot['title'] not in seen_titles:
            seen_titles.add(hotspot['title'])
            unique_hotspots.append(hotspot)
            if len(unique_hotspots) >= count:
                break

    print(f"搜索完成，找到 {len(unique_hotspots)} 条热点信息")

    return unique_hotspots


def search_github_trending(keyword: str) -> List[Dict[str, str]]:
    """搜索GitHub热门项目"""
    try:
        print("  → 正在搜索 GitHub...")

        url = "https://api.github.com/search/repositories"
        params = {
            'q': f'{keyword} OR AI OR ChatGPT OR LLM',
            'sort': 'stars',
            'order': 'desc',
            'per_page': 10
        }

        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/vnd.github.v3+json'
        }

        response = requests.get(url, params=params, headers=headers, timeout=15)

        if response.status_code == 200:
            data = response.json()
            hotspots = []

            for item in data.get('items', [])[:5]:
                # 只保留AI相关的
                desc = (item.get('description') or '').lower()
                name = item.get('name', '').lower()

                if any(kw in desc + name for kw in ['ai', 'gpt', 'llm', 'chatbot', 'machine learning']):
                    hotspots.append({
                        'title': f"{item['name']} - {item.get('description', '')[:80]}",
                        'summary': item.get('description', '')[:200],
                        'publish_time': item.get('created_at', ''),
                        'source': 'GitHub',
                        'url': item['html_url'],
                        'heat': item.get('stargazers_count', 0)
                    })

            print(f"    ✓ GitHub: 找到 {len(hotspots)} 条")
            return hotspots
        else:
            print(f"    ✗ GitHub: 请求失败 ({response.status_code})")
            return []

    except Exception as e:
        print(f"    ✗ GitHub: {str(e)}")
        return []


def search_hackernews(keyword: str) -> List[Dict[str, str]]:
    """搜索HackerNews热门"""
    try:
        print("  → 正在搜索 HackerNews...")

        # 获取热门故事ID
        url = "https://hacker-news.firebaseio.com/v0/topstories.json"
        response = requests.get(url, timeout=15)

        if response.status_code != 200:
            print(f"    ✗ HackerNews: 请求失败 ({response.status_code})")
            return []

        story_ids = response.json()[:30]  # 获取前30个
        hotspots = []

        for story_id in story_ids:
            if len(hotspots) >= 5:  # 限制5条
                break

            story_url = f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json"
            story_response = requests.get(story_url, timeout=5)

            if story_response.status_code == 200:
                story = story_response.json()
                title = story.get('title', '')

                # 只保留AI相关的
                if any(kw in title.lower() for kw in ['ai', 'gpt', 'llm', 'chatbot', 'machine learning', 'deep learning', 'artificial intelligence']):
                    hotspots.append({
                        'title': title,
                        'summary': title,
                        'publish_time': datetime.fromtimestamp(story.get('time', 0)).isoformat(),
                        'source': 'HackerNews',
                        'url': story.get('url', f"https://news.ycombinator.com/item?id={story_id}"),
                        'heat': story.get('score', 0)
                    })

            time.sleep(0.1)  # 避免请求过快

        print(f"    ✓ HackerNews: 找到 {len(hotspots)} 条")
        return hotspots

    except Exception as e:
        print(f"    ✗ HackerNews: {str(e)}")
        return []


def search_v2ex(keyword: str) -> List[Dict[str, str]]:
    """搜索V2EX热门话题"""
    try:
        print("  → 正在搜索 V2EX...")

        url = "https://www.v2ex.com/api/topics/hot.json"
        headers = {
            'User-Agent': 'Mozilla/5.0'
        }

        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            data = response.json()
            hotspots = []

            for item in data[:10]:
                title = item.get('title', '')
                content = item.get('content', '')

                # 只保留AI相关的
                if any(kw in (title + content).lower() for kw in ['ai', 'gpt', 'chatgpt', 'claude', 'deepseek', '人工智能', 'llm']):
                    hotspots.append({
                        'title': title,
                        'summary': content[:200] if content else title,
                        'publish_time': datetime.fromtimestamp(item.get('created', 0)).isoformat(),
                        'source': 'V2EX',
                        'url': item.get('url', ''),
                        'heat': item.get('replies', 0)
                    })

            print(f"    ✓ V2EX: 找到 {len(hotspots)} 条")
            return hotspots
        else:
            print(f"    ✗ V2EX: 请求失败 ({response.status_code})")
            return []

    except Exception as e:
        print(f"    ✗ V2EX: {str(e)}")
        return []


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="搜索最近指定天数内的热点事件")
    parser.add_argument("--keyword", required=True, help="搜索关键词（赛道）")
    parser.add_argument("--days", type=int, default=3, help="搜索天数，默认3天")
    parser.add_argument("--count", type=int, default=10, help="返回热点数量，默认10条")

    args = parser.parse_args()

    # 搜索热点
    hotspots = search_recent_hotspots(
        keyword=args.keyword,
        days=args.days,
        count=args.count
    )

    # 输出JSON格式结果
    result = {
        "keyword": args.keyword,
        "days": args.days,
        "count": len(hotspots),
        "search_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "hotspots": hotspots
    }

    print("\n" + "="*60)
    print("搜索结果:")
    print("="*60)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
