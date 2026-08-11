"""
LinkedIn AI Linkedin Agent
Scrapes competitor posts → Qwen rewrites → Qwen image → Publishes to LinkedIn
"""

import os
import json
import requests
from apify_client import ApifyClient
import base64
import re
from dotenv import load_dotenv
load_dotenv()
import os

# ============================================================
# CONFIG — Replace with your actual keys
# ============================================================
APIFY_API_KEY = os.getenv("APIFY_TOKEN")
QWEN_API_KEY = os.getenv("QWEN_API")
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_TOKEN")

QWEN_TEXT_URL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
QWEN_IMAGE_URL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
QWEN_TEXT_MODEL = "qwen-plus"  
QWEN_IMAGE_MODEL = "qwen-image-2.0"

# Your brand voice (customize this)
BRAND_VOICE = """
You are a thought leader in AI and technology.

Always format LinkedIn posts EXACTLY like this:

[One powerful hook line — bold statement or question]

[2-3 short paragraphs of insight, each 2-3 lines max]
Use 1-2 relevant emojis naturally within paragraphs, not forced.

[3-5 bullet points with key takeaways using →]

[Closing one-liner call to action or question]

#hashtag1 #hashtag2 ... #hashtag12

Rules:
- First line must be a strong hook (max 10 words)
- Use short paragraphs, never long blocks
- Always end with 10-12 relevant hashtags
- Use maximum 3-4 emojis total in the whole post, placed naturally
- No emoji overload — subtle and professional only
- Conversational but authoritative tone
- NEVER use markdown formatting like **bold**, *italic*, or ## headings
- Plain text only — no asterisks, no pound signs
"""

# ============================================================
# CLIENTS
# ============================================================
apify_client = ApifyClient(APIFY_API_KEY)


def qwen_headers():
    return {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json",
    }


# ============================================================
# STEP 1: Scrape competitor posts via Apify
# ============================================================
def scrape_competitor_posts():
    print("\n[1/4] Scraping competitor posts from LinkedIn...")

    run_input = {
        "searchQueries": [
            "OpenAI artificial intelligence",
            "Anthropic Claude AI",
            "Google DeepMind",
            "Microsoft AI",
            "Meta AI LLM",
        ],
        "maxPosts": 10,
        "scrapeComments": False,
        "scrapeReactions": False,
        "postNestedComments": False,
        "postNestedReactions": False,
    }

    run = apify_client.actor(
        "harvestapi/linkedin-post-search").call(run_input=run_input)
    items = list(apify_client.dataset(run.default_dataset_id).iterate_items())

    # DEBUG
    if items:
        print("DEBUG keys:", list(items[0].keys()))
        print("DEBUG sample:", json.dumps(
            items[0], indent=2, default=str)[:500])

    posts = []
    for item in items:
        posts.append({
            "company": item.get("authorName") or item.get("author", "Unknown"),
            "text": item.get("text") or item.get("content", ""),
            "likes": item.get("numLikes") or item.get("likes", 0),
            "comments": item.get("numComments") or item.get("comments", 0),
            "shares": item.get("numShares") or item.get("shares", 0),
        })

    print(f"   Found {len(posts)} posts total.")
    return posts


# ============================================================
# STEP 2: Pick top viral posts using Qwen
# ============================================================
def pick_viral_posts(posts):
    print(f"\n[2/4] Selecting top viral posts with {QWEN_TEXT_MODEL}...")

    posts_text = json.dumps(posts[:30], indent=2)

    payload = {
        "model": QWEN_TEXT_MODEL,
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": "You are a social media analyst. Pick the 3 most viral/engaging posts based on likes, comments, shares and content quality. Return ONLY a valid JSON array of 3 posts with keys: company, text, reason_viral."
                },
                {
                    "role": "user",
                    "content": f"Here are recent LinkedIn posts from top AI companies:\n\n{posts_text}\n\nPick the top 3 most viral posts."
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
    top_posts = json.loads(raw)
    print(f"   Selected {len(top_posts)} viral posts.")
    return top_posts


# ============================================================
# STEP 3: Rewrite post + generate image prompt
# ============================================================
def rewrite_post(post):
    print(f"\n[3/4] Rewriting post from {post['company']}...")

    payload = {
        "model": QWEN_TEXT_MODEL,
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": f"{BRAND_VOICE}\n\nYou rewrite LinkedIn posts in your brand voice. Return ONLY valid JSON with keys: new_post (string), image_prompt (string for image generation)."
                },
                {
                    "role": "user",
                    "content": f"Original post from {post['company']}:\n\n{post['text']}\n\nRewrite this in our brand voice and create an image prompt that matches the theme."
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
    result = json.loads(raw)
    return result


# ============================================================
# STEP 4: Generate image with Qwen Image
# ============================================================
def generate_image(image_prompt):
    print(f"   Generating image with {QWEN_IMAGE_MODEL}...")

    payload = {
        "model": QWEN_IMAGE_MODEL,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"text": image_prompt}
                    ]
                }
            ]
        },
        "parameters": {
            "size": "512*512"
        }
    }

    response = requests.post(
        QWEN_IMAGE_URL, headers=qwen_headers(), json=payload)
    response.raise_for_status()

    image_url = response.json(
    )["output"]["choices"][0]["message"]["content"][0]["image"]

    img_response = requests.get(image_url)
    img_bytes = img_response.content

    with open("generated_image.png", "wb") as f:
        f.write(img_bytes)

    return img_bytes, image_url


# ============================================================
# STEP 5: Get LinkedIn person URN
# ============================================================
def get_linkedin_urn():
    headers = {"Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}"}
    response = requests.get(
        "https://api.linkedin.com/v2/userinfo", headers=headers)
    data = response.json()
    sub = data.get("sub")
    urn = f"urn:li:person:{sub}"
    print(f"   LinkedIn URN: {urn}")
    return urn


# ============================================================
# STEP 6: Upload image to LinkedIn
# ============================================================
def upload_image_to_linkedin(image_bytes, person_urn):
    print("   Uploading image to LinkedIn...")
    headers = {
        "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }

    # Register upload
    register_payload = {
        "registerUploadRequest": {
            "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
            "owner": person_urn,
            "serviceRelationships": [{
                "relationshipType": "OWNER",
                "identifier": "urn:li:userGeneratedContent"
            }]
        }
    }

    reg_response = requests.post(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        headers=headers,
        json=register_payload
    )
    reg_data = reg_response.json()
    upload_url = reg_data["value"]["uploadMechanism"]["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]["uploadUrl"]
    asset = reg_data["value"]["asset"]

    # Upload image bytes
    requests.put(upload_url, headers={
                 "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}"}, data=image_bytes)

    return asset


# ============================================================
# STEP 7: Publish post to LinkedIn
# ============================================================
def publish_to_linkedin(post_text, image_asset, person_urn):
    print("   Publishing to LinkedIn...")
    headers = {
        "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }

    payload = {
        "author": person_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": post_text},
                "shareMediaCategory": "IMAGE",
                "media": [{
                    "status": "READY",
                    "description": {"text": "AI Generated Image"},
                    "media": image_asset,
                    "title": {"text": "Post Image"}
                }]
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }

    response = requests.post(
        "https://api.linkedin.com/v2/ugcPosts", headers=headers, json=payload)
    if response.status_code == 201:
        print("   ✅ Post published successfully!")
        return response.json()
    else:
        print(f"   ❌ Publish failed: {response.text}")
        return None


# ============================================================
# MAIN AGENT
# ============================================================
def run_agent():
    print("=" * 50)
    print("   LinkedIn AI Linkedin Agent Starting...")
    print("=" * 50)

    # Step 1: Scrape
    posts = scrape_competitor_posts()

    # Step 2: Pick viral
    top_posts = pick_viral_posts(posts)

    # Step 3: Get LinkedIn URN
    print("\n   Fetching LinkedIn profile URN...")
    person_urn = get_linkedin_urn()

    # Step 4: Process each viral post
    results = []
    for i, post in enumerate(top_posts[:1]):
        print(f"\n--- Processing Post {i+1}/{len(top_posts)} ---")

        # Rewrite
        rewritten = rewrite_post(post)
        new_post_text = rewritten["new_post"]
        new_post_text = re.sub(r'\*\*(.*?)\*\*', r'\1', new_post_text)
        new_post_text = re.sub(r'\*(.*?)\*', r'\1', new_post_text)
        new_post_text = re.sub(r'#{1,6}\s', '', new_post_text)
        new_post_text = new_post_text.strip()

        print(f"\n   New Post Preview:\n{new_post_text[:200]}...")

        # Generate image
        image_bytes = generate_image(rewritten["image_prompt"])
        image_asset = upload_image_to_linkedin(image_bytes, person_urn)

        # Publish with image
        result = publish_to_linkedin(new_post_text, image_asset, person_urn)

        results.append({
            "original_company": post["company"],
            "new_post": new_post_text,
            "image_saved": "generated_image.png",
            "published": result is not None
        })

    # Save results
    with open("output.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 50)
    print(f"   Done! {len(results)} post(s) published.")
    print("   Results saved to output.json")
    print("=" * 50)


if __name__ == "__main__":
    run_agent()
