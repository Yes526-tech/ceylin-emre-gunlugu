const { getStore } = require("@netlify/blobs");

const SITE_ID = "378dd652-cf20-475b-97ff-74f42b7d8ba1";
const TOKEN = "nfc_8P5HjNxVkdUSk4DYMzFHjK1cQoC9SVPB792c";
const STORE_NAME = "ceylin-emre-live-data";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const ALL_KEYS = [
  "memories",
  "deleted_memory_ids",
  "face_id_profile",
  "bucket_list",
  "diary",
  "deleted_diary_ids",
  "notebook",
  "deleted_notebook_ids",
  "sipsak",
  "deleted_sipsak_ids",
  "hero_image",
  "drawing_canvas",
  "music_state",
  "playlist",
  "deleted_playlist_ids",
  "active_peer"
];

function getBlobStore() {
  return getStore({
    name: STORE_NAME,
    siteID: SITE_ID,
    token: TOKEN,
    consistency: "strong"
  });
}

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const store = getBlobStore();

  try {
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const key = body.key;
      const data = body.data;

      if (!key) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: false, error: "Key is required" })
        };
      }

      const payload = {
        data: data,
        updatedAt: Date.now()
      };

      await store.setJSON(key, payload);

      // Lightweight timestamps metadata tracking
      try {
        let meta = {};
        const metaRes = await store.get("_timestamps", { type: "json" });
        if (metaRes && metaRes.data) meta = metaRes.data;
        meta[key] = payload.updatedAt;
        await store.setJSON("_timestamps", { data: meta, updatedAt: payload.updatedAt });
      } catch (metaErr) {
        // Non-blocking
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, key: key, updatedAt: payload.updatedAt })
      };
    } else {
      const q = event.queryStringParameters || {};

      // 1. Lightweight Timestamps Poller (Only ~300 bytes response, ultra fast!)
      if (q.timestamps === "1" || q.meta === "1") {
        let timestamps = {};
        try {
          const metaRes = await store.get("_timestamps", { type: "json" });
          if (metaRes && metaRes.data) timestamps = metaRes.data;
        } catch (e) {}
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, timestamps })
        };
      }

      // 2. Multi-key fetch (Fetches only requested keys in a single batch)
      if (q.keys) {
        const reqKeys = q.keys.split(",").map(k => k.trim()).filter(Boolean);
        const results = {};
        await Promise.all(
          reqKeys.map(async (k) => {
            try {
              const res = await store.get(k, { type: "json" });
              if (res) results[k] = res;
            } catch (e) {}
          })
        );
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, data: results })
        };
      }

      // 3. All keys fetch (Legacy fallback)
      if (q.all === "1" || q.all === "true") {
        const results = {};
        await Promise.all(
          ALL_KEYS.map(async (k) => {
            try {
              const res = await store.get(k, { type: "json" });
              if (res) results[k] = res;
            } catch (e) {
              // Ignore single key error
            }
          })
        );
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, all: true, data: results })
        };
      }

      const key = q.key;
      if (!key) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: false, error: "Key or all=1 required" })
        };
      }

      const res = await store.get(key, { type: "json" });
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, key: key, data: res ? res.data : null, updatedAt: res ? res.updatedAt : null })
      };
    }
  } catch (err) {
    console.error("Sync error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
