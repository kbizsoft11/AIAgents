"""
Flask API Server — Instagram Lead Finder
"""

from main import (
    scrape_instagram_posts,
    scrape_comments,
    extract_leads,
    push_to_sheets,
    DEFAULT_QUERIES,
)
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import json
import queue
import threading
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))


app = Flask(__name__)
CORS(app)

agent_running = False
last_results = []


def send_event(q, event, data):
    q.put(f"event: {event}\ndata: {json.dumps(data)}\n\n")


def run_agent_task(q, queries):
    global agent_running, last_results
    agent_running = True
    last_results = []

    try:
        # ── Step 1: Scrape posts ─────────────────────────────────
        send_event(q, "progress", {
                   "step": 1, "label": f"Scraping Instagram for {len(queries)} queries...", "status": "running"})
        posts = scrape_instagram_posts(queries)
        send_event(q, "progress", {
                   "step": 1, "label": f"Scraped {len(posts)} posts", "status": "done"})

        if not posts:
            send_event(q, "error_event", {
                       "message": "No posts found. Try different queries."})
            return

        # Send posts to UI
        send_event(q, "scraped_posts", {
            "posts": [
                {
                    "username": p.get("owner_username", ""),
                    "caption": p.get("caption", "")[:200],
                    "likes": p.get("likes", 0),
                    "comments": p.get("comments_count", 0),
                    "query": p.get("query", ""),
                    "post_url": p.get("post_url", ""),
                }
                for p in posts[:20]
            ]
        })

        # ── Step 2: Scrape comments ──────────────────────────────
        send_event(q, "progress", {
                   "step": 2, "label": "Scraping comments from top posts...", "status": "running"})
        comments = scrape_comments(posts, max_posts=5)
        send_event(q, "progress", {
                   "step": 2, "label": f"Scraped {len(comments)} comments", "status": "done"})

        send_event(q, "scraped_comments", {
            "comments": [
                {
                    "commenter": c.get("commenter", ""),
                    "text": c.get("comment_text", "")[:150],
                    "post_owner": c.get("post_owner", ""),
                }
                for c in comments[:30]
            ]
        })

        # ── Step 3: Extract leads ────────────────────────────────
        send_event(q, "progress", {
                   "step": 3, "label": "Extracting leads with Qwen AI...", "status": "running"})
        leads = extract_leads(posts, comments)
        send_event(q, "progress", {
                   "step": 3, "label": f"Found {len(leads)} leads", "status": "done"})

        send_event(q, "leads_found", {"leads": leads})

        # ── Step 4: Push to Google Sheets ────────────────────────
        send_event(q, "progress", {
                   "step": 4, "label": "Saving leads to Google Sheets...", "status": "running"})
        rows_added = push_to_sheets(leads)
        send_event(q, "progress", {
                   "step": 4, "label": f"Saved {rows_added} leads to Sheets ✓", "status": "done"})

        last_results = leads
        send_event(q, "complete", {
            "leads": leads,
            "total": len(leads),
            "rows_added": rows_added,
        })

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

    # Get queries from query param or use defaults
    queries_param = request.args.get("queries", "")
    queries = [q.strip() for q in queries_param.split(
        ",") if q.strip()] if queries_param else DEFAULT_QUERIES

    q = queue.Queue()

    def generate():
        thread = threading.Thread(target=run_agent_task, args=(q, queries))
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


@app.route("/api/status")
def status():
    return jsonify({"running": agent_running, "last_results": last_results})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
