import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execute } from "./handler.mjs";

const fixtureUrl = new URL("./fixtures/execution.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const services = (secret = "test-key") => ({
  signal: new AbortController().signal,
  getSecret: async () => secret,
});

const originalFetch = globalThis.fetch;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

try {
  const realFixture = { ...fixture, configuration: { ...fixture.configuration, simulate: false } };
  const missingSecret = await execute(realFixture, services(""));
  assert.equal(missingSecret.status, "error");
  assert.equal(missingSecret.code, "MISSING_SECRET");

  const requests = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.pathname.endsWith("/search")) {
      return json({ items: [{ id: { videoId: "video-1" } }, { id: { videoId: "video-curto" } }] });
    }
    if (parsed.pathname.endsWith("/videos")) {
      return json({
        items: [
          {
            id: "video-1",
            snippet: { channelId: "channel-1", channelTitle: "Canal referência", title: "Título observado", publishedAt: "2026-08-10T12:00:00.000Z" },
            statistics: { viewCount: "10000", likeCount: "300", commentCount: "80" },
            contentDetails: { duration: "PT6M12S" }
          },
          {
            id: "video-curto",
            snippet: { channelId: "channel-2", channelTitle: "Canal curto", title: "Curto", publishedAt: "2026-08-10T12:00:00.000Z" },
            statistics: { viewCount: "999", likeCount: "1", commentCount: "1" },
            contentDetails: { duration: "PT1M" }
          }
        ]
      });
    }
    throw new Error(`Rota inesperada: ${parsed.pathname}`);
  };
  const response = await execute(realFixture, services());
  assert.equal(response.status, "success");
  assert.equal(response.values.market_snapshot.length, 1);
  assert.equal(response.values.market_snapshot[0].video_id, "video-1");
  assert.equal(response.values.market_snapshot[0].duration_seconds, 372);
  assert.equal(requests.filter((item) => item.pathname.endsWith("/search")).length, 2);
  assert.equal(requests.filter((item) => item.pathname.endsWith("/videos")).length, 1);

  globalThis.fetch = async () => json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);
  const limited = await execute(realFixture, services());
  assert.equal(limited.status, "error");
  assert.equal(limited.code, "RATE_LIMIT");
  assert.equal(limited.retryable, true);

  const simulated = await execute(fixture, services(""));
  assert.equal(simulated.status, "success");
  assert.equal(simulated.values.market_snapshot.length, 0);
  assert.match(simulated.values.research_summary, /nenhuma consulta externa/i);

  console.log("norte-magnata-market-radar: ok");
} finally {
  globalThis.fetch = originalFetch;
}
