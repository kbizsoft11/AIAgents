"""
Flask API Server — Linkedin Agent Dashboard
"""

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import json
import time
import queue
import threading
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import (
    scrape_competitor_posts,
    pick_viral_posts,
    rewrite_post,
    generate_image,
    upload_image_to_linkedin,
    publish_to_linkedin,
    get_linkedin_urn,
    LINKEDIN_ACCESS_TOKEN,
)
import requests as req

app = Flask(__name__)
CORS(app)

agent_running = False
last_results = []

def get_company_name(p):
    c = p.get("company", "Unknown")
    if isinstance(c, dict):
        return c.get("name") or c.get("universalName") or "Unknown"
    return str(c) if c else "Unknown"

def get_text(p):
    t = p.get("text", "")
    if isinstance(t, dict):
        return t.get("text") or t.get("content") or ""
    return str(t) if t else ""


def send_event(q, event, data):
    q.put(f"event: {event}\ndata: {json.dumps(data)}\n\n")


def run_agent_task(q):
    global agent_running, last_results
    agent_running = True
    results = []

    try:
        # ── Step 1: Scrape ──────────────────────────────────────
        send_event(q, "progress", {"step": 1, "label": "Scraping competitor posts...", "status": "running"})
        posts = scrape_competitor_posts()
        send_event(q, "progress", {"step": 1, "label": f"Scraped {len(posts)} posts", "status": "done"})

        if not posts:
            send_event(q, "error_event", {"message": "No posts found. Check Apify actor config."})
            return

        send_event(q, "scraped_posts", {
            "posts": [
                {
                    "company": (p.get("company") or {}).get("name", "") if isinstance(p.get("company"), dict) else str(p.get("company", "Unknown")),
                    "text": p.get("text", "")[:300],
                    "likes": p.get("likes", 0),
                    "comments": p.get("comments", 0),
                    "shares": p.get("shares", 0),
                }
                for p in posts
            ]
        })

        # ── Step 2: Pick viral ───────────────────────────────────
        send_event(q, "progress", {"step": 2, "label": "Analyzing viral posts", "status": "running"})
        top_posts = pick_viral_posts(posts)
        send_event(q, "progress", {"step": 2, "label": f"Selected {len(top_posts)} viral posts", "status": "done"})

        if not top_posts:
            send_event(q, "error_event", {"message": "Could not select posts."})
            return

        # ── Step 3: LinkedIn URN ─────────────────────────────────
        person_urn = get_linkedin_urn()

        # ── Step 4-6: Process each post ──────────────────────────
        for i, post in enumerate(top_posts[:1]):
            post_num = i + 1
            image_url = None

            # Rewrite
            send_event(q, "progress", {"step": 3 + (i * 3) + 1, "label": f"Rewriting post {post_num}...", "status": "running"})
            rewritten = rewrite_post(post)
            new_post_text = rewritten["new_post"]
            image_prompt = rewritten.get("image_prompt", "Professional AI technology abstract")
            send_event(q, "progress", {"step": 3 + (i * 3) + 1, "label": f"Post {post_num} rewritten", "status": "done"})

            # Generate image
            send_event(q, "progress", {"step": 3 + (i * 3) + 2, "label": f"Generating image {post_num}...", "status": "running"})
            published = False
            try:
                image_bytes, image_url = generate_image(image_prompt)
                image_asset = upload_image_to_linkedin(image_bytes, person_urn)
                send_event(q, "progress", {"step": 3 + (i * 3) + 2, "label": f"Image {post_num} ready", "status": "done"})

                # ✅ Send rewritten post AFTER image ready — includes image_url
                send_event(q, "rewritten_post", {
                    "company": post.get("company", "Unknown"),
                    "original": post.get("text", "")[:200],
                    "new_post": new_post_text,
                    "image_url": image_url,
                    "published": False,
                })

                # Publish with image
                send_event(q, "progress", {"step": 3 + (i * 3) + 3, "label": f"Publishing post {post_num}...", "status": "running"})
                publish_result = publish_to_linkedin(new_post_text, image_asset, person_urn)
                published = publish_result is not None

            except Exception:
                # Fallback: text only
                send_event(q, "progress", {"step": 3 + (i * 3) + 2, "label": "Image skipped, using text only", "status": "done"})

                # ✅ Send rewritten post without image
                send_event(q, "rewritten_post", {
                    "company": post.get("company", "Unknown"),
                    "original": post.get("text", "")[:200],
                    "new_post": new_post_text,
                    "image_url": None,
                    "published": False,
                })

                send_event(q, "progress", {"step": 3 + (i * 3) + 3, "label": f"Publishing post {post_num}...", "status": "running"})
                headers = {
                    "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                }
                payload = {
                    "author": person_urn,
                    "lifecycleState": "PUBLISHED",
                    "specificContent": {
                        "com.linkedin.ugc.ShareContent": {
                            "shareCommentary": {"text": new_post_text},
                            "shareMediaCategory": "NONE",
                        }
                    },
                    "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
                }
                r = req.post("https://api.linkedin.com/v2/ugcPosts", headers=headers, json=payload)
                published = r.status_code == 201

            send_event(q, "progress", {
                "step": 3 + (i * 3) + 3,
                "label": f"Post {post_num} {'published ✓' if published else 'failed ✗'}",
                "status": "done" if published else "error",
            })

            results.append({
                "company": post.get("company", "Unknown"),
                "preview": new_post_text[:200] + "...",
                "new_post": new_post_text,
                "image_url": image_url,
                "published": published,
            })

            time.sleep(1)

        last_results = results
        send_event(q, "complete", {"results": results})

    except Exception as e:
        send_event(q, "error_event", {"message": str(e)})
    finally:
        agent_running = False
        q.put(None)


@app.route("/api/run-agent")
def run_agent_stream():
    global agent_running
    if agent_running:
        return jsonify({"error": "Agent already running"}), 409

    q = queue.Queue()

    def generate():
        thread = threading.Thread(target=run_agent_task, args=(q,))
        thread.daemon = True
        thread.start()
        while True:
            item = q.get()
            if item is None:
                break
            yield item

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/proxy-image")
def proxy_image():
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "no url"}), 400
    r = req.get(url)
    return Response(r.content, content_type=r.headers.get("Content-Type", "image/png"))

@app.route("/api/status")
def status():
    return jsonify({"running": agent_running, "last_results": last_results})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)