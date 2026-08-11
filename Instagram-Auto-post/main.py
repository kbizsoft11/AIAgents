"""
Instagram Lead Finder Agent
Search queries → Apify scrapes posts/reels → Qwen extracts leads → Google Sheets
"""

import json
import re
import requests
from apify_client import ApifyClient
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
load_dotenv()
import os
import json

# ============================================================
# CONFIG — Replace with your actual keys
# ============================================================
APIFY_API_KEY = os.getenv("APIFY_TOKEN")
QWEN_API_KEY = os.getenv("QWEN_API")

GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1lW9m681G_zMviwU1CnuBQrIttI6L40aMzism9fRiukQ/edit"
with open("Instagram-Auto-post/service-account.json") as f:
    GOOGLE_SERVICE_ACCOUNT = json.load(f)

# Search queries for Instagram scraping
DEFAULT_QUERIES = [
    "web design agency",
    "digital marketing agency",
    "software development company",
    "mobile app development",
    "SEO services",
]

QWEN_TEXT_URL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
QWEN_TEXT_MODEL = "qwen-plus"

# ============================================================
# CLIENTS
# ============================================================
apify_client = ApifyClient(APIFY_API_KEY)


def qwen_headers():
    return {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json",
    }


def get_sheets_client():
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_info(
        GOOGLE_SERVICE_ACCOUNT, scopes=scopes)
    return gspread.authorize(creds)


# ============================================================
# STEP 1: Scrape Instagram posts via Apify
# ============================================================
def scrape_instagram_posts(queries):
    print("\n[1/4] Scraping Instagram posts...")

    all_posts = []

    for query in queries:
        print(f"   Searching: {query}")
        try:
            # Convert query to hashtag URL — removes spaces, lowercases
            hashtag = query.replace(" ", "").lower()
            hashtag_url = f"https://www.instagram.com/explore/tags/{hashtag}/"

            run_input = {
                "directUrls": [hashtag_url],
                "resultsType": "posts",
                "resultsLimit": 10,
            }

            run = apify_client.actor(
                "apify/instagram-scraper").call(run_input=run_input)
            items = list(apify_client.dataset(
                run.default_dataset_id).iterate_items())

            if items:
                print("DEBUG keys:", list(items[0].keys()))
                print("DEBUG sample:", json.dumps(
                    items[0], indent=2, default=str)[:600])

            for item in items:
                post_url = item.get("url") or item.get("postUrl") or ""
                # Only keep actual post URLs, skip hashtag/profile pages
                if "/p/" in post_url or "/reel/" in post_url:
                    all_posts.append({
                        "query": query,
                        "post_url": post_url,
                        "caption": item.get("caption") or item.get("text", ""),
                        "owner_username": item.get("ownerUsername") or item.get("username", ""),
                        "owner_fullname": item.get("ownerFullName") or item.get("fullName", ""),
                        "likes": item.get("likesCount") or item.get("likes", 0),
                        "comments_count": item.get("commentsCount") or item.get("comments", 0),
                        "timestamp": item.get("timestamp") or item.get("date", ""),
                        "hashtags": item.get("hashtags", []),
                    })
        except Exception as e:
            print(f"   Error scraping '{query}': {e}")

    print(f"   Found {len(all_posts)} posts total.")
    return all_posts


# ============================================================
# STEP 2: Scrape comments for top posts
# ============================================================
def scrape_comments(posts, max_posts=5):
    print(f"\n[2/4] Scraping comments from top {max_posts} posts...")

    all_comments = []
    top_posts = [p for p in posts if p.get("post_url")][:max_posts]

    for post in top_posts:
        print(f"   Scraping comments: {post['post_url']}")
        try:
            run_input = {
                # this actor uses "url" not "directUrls"
                "url": post["post_url"],
                "maxComments": 50,
            }
            run = apify_client.actor(
                "pratikdani/instagram-comments-scraper").call(run_input=run_input)
            items = list(apify_client.dataset(
                run.default_dataset_id).iterate_items())

            if items:
                print("DEBUG comment keys:", list(items[0].keys()))

            for item in items:
                all_comments.append({
                    "post_url": post["post_url"],
                    "post_owner": post["owner_username"],
                    "commenter": item.get("ownerUsername") or item.get("username", ""),
                    "comment_text": item.get("text") or item.get("comment", ""),
                    "timestamp": item.get("timestamp", ""),
                })
        except Exception as e:
            print(f"   Error scraping comments: {e}")

    print(f"   Scraped {len(all_comments)} comments total.")
    return all_comments


# ============================================================
# STEP 3: Extract leads using Qwen
# ============================================================
def extract_leads(posts, comments):
    print("\n[3/4] Extracting leads with Qwen...")

    # Combine captions + comments into one text block per post
    post_texts = []
    for post in posts[:20]:
        text = f"Username: @{post['owner_username']}\nCaption: {post['caption'][:500]}"
        post_texts.append(text)

    comment_texts = []
    for c in comments[:100]:
        comment_texts.append(f"@{c['commenter']}: {c['comment_text']}")

    combined = "\n---\n".join(post_texts) + \
        "\n\nCOMMENTS:\n" + "\n".join(comment_texts)

    payload = {
        "model": QWEN_TEXT_MODEL,
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": """You are a lead extraction specialist. 
Extract business leads from Instagram post captions and comments.

Look for:
- Email addresses (explicit or written like "hello at company dot com")
- Phone numbers (any format, including WhatsApp mentions)
- Company/business names
- Website URLs
- Person names who seem to be business owners or decision makers
- Any mention of services offered

Return ONLY valid JSON array. Each item must have these keys:
{
  "source": "caption" or "comment",
  "username": "@username if visible",
  "name": "person or company name if found",
  "email": "email if found or null",
  "phone": "phone if found or null", 
  "website": "website/URL if found or null",
  "company": "company name if found or null",
  "notes": "brief note about what they offer or why they're a lead"
}

Only include items where at least one of email/phone/website/company is found.
No duplicates. No markdown. Return raw JSON array only."""
                },
                {
                    "role": "user",
                    "content": f"Extract leads from this Instagram data:\n\n{combined}"
                }
            ]
        },
        "parameters": {
            "result_format": "message"
        }
    }

    response = requests.post(
        QWEN_TEXT_URL, headers=qwen_headers(), json=payload)
    response.raise_for_status()
    raw = response.json()["output"]["choices"][0]["message"]["content"].strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        leads = json.loads(raw)
    except Exception:
        # Fallback: try regex extract emails/phones from raw text
        leads = []
        emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', combined)
        phones = re.findall(r'[\+]?[\d\s\-\(\)]{10,15}', combined)
        if emails or phones:
            leads.append({
                "source": "regex_fallback",
                "username": "",
                "name": "",
                "email": emails[0] if emails else None,
                "phone": phones[0] if phones else None,
                "website": None,
                "company": None,
                "notes": "Extracted via regex fallback"
            })

    print(f"   Found {len(leads)} leads.")
    return leads


# ============================================================
# STEP 4: Push leads to Google Sheets
# ============================================================
def push_to_sheets(leads):
    print("\n[4/4] Pushing leads to Google Sheets...")

    gc = get_sheets_client()
    sh = gc.open_by_url(GOOGLE_SHEET_URL)
    worksheet = sh.sheet1

    # Set headers if sheet is empty
    existing = worksheet.get_all_values()
    if not existing:
        headers = ["Username", "Name", "Email", "Phone",
                   "Website", "Company", "Source", "Notes"]
        worksheet.append_row(headers)

    # Push each lead
    rows_added = 0
    for lead in leads:
        row = [
            lead.get("username", ""),
            lead.get("name", ""),
            lead.get("email", "") or "",
            lead.get("phone", "") or "",
            lead.get("website", "") or "",
            lead.get("company", "") or "",
            lead.get("source", ""),
            lead.get("notes", ""),
        ]
        worksheet.append_row(row)
        rows_added += 1

    print(f"   Added {rows_added} leads to Google Sheets.")
    return rows_added


# ============================================================
# MAIN
# ============================================================
def run_agent(queries=None):
    if not queries:
        queries = DEFAULT_QUERIES

    print("=" * 50)
    print("   Instagram Lead Finder Starting...")
    print("=" * 50)

    posts = scrape_instagram_posts(queries)
    comments = scrape_comments(posts)
    leads = extract_leads(posts, comments)
    rows = push_to_sheets(leads)

    print("\n" + "=" * 50)
    print(f"   Done! {rows} leads saved to Google Sheets.")
    print("=" * 50)

    return leads


if __name__ == "__main__":
    run_agent()
