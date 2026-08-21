import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execute } from "./handler.mjs";

const fixtureUrl = new URL("./fixtures/execution.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const services = (secrets = ["test-key-1", "test-key-2"]) => ({
  signal: new AbortController().signal,
  getSecret: async (name) => (name === "YOUTUBE_DATA_API_KEYS" ? secrets.join("\n") : ""),
});
const projectServices = () => ({
  signal: new AbortController().signal,
  getSecret: async (name) => (name === "YOUTUBE_API_KEY_PROJECT_01" ? "project-test-key" : ""),
});

const originalFetch = globalThis.fetch;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

try {
  const realFixture = {
    ...fixture,
    configuration: {
      ...fixture.configuration,
      core_queries: "disciplina foco",
      simulate: false,
      region_code: "BR",
      preferred_language: "pt",
      minimum_views_per_day: 30,
      minimum_query_term_matches: 1,
      excluded_title_terms: "podcast",
      candidate_target: 50,
      deep_review_limit: 10,
      top_limit: 10,
      minimum_niche_bending_top: 0,
    },
  };
  const missingSecret = await execute(realFixture, services([]));
  assert.equal(missingSecret.status, "error");
  assert.equal(missingSecret.code, "MISSING_SECRET");

  const requests = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.pathname.endsWith("/search")) {
      if (parsed.searchParams.get("channelId")) {
        return json({ items: [{ id: { videoId: "video-1" } }] });
      }
      return json({ items: [{ id: { videoId: "video-1" } }, { id: { videoId: "video-curto" } }] });
    }
    if (parsed.pathname.endsWith("/channels")) {
      return json({ items: [{ id: "channel-1", statistics: { subscriberCount: "1000" } }] });
    }
    if (parsed.pathname.endsWith("/commentThreads")) {
      return json({ items: [{ snippet: { topLevelComment: { snippet: { textDisplay: "Eu comecei e funcionou" } } } }] });
    }
    if (parsed.pathname.endsWith("/videos")) {
      return json({
        items: [
          {
            id: "video-1",
            snippet: {
              channelId: "channel-1",
              channelTitle: "Canal referência",
              title: "Disciplina e foco",
              publishedAt: "2026-08-10T12:00:00.000Z",
              defaultAudioLanguage: "pt-BR",
            },
            statistics: { viewCount: "10000", likeCount: "300", commentCount: "80" },
            contentDetails: { duration: "PT6M12S" },
          },
          {
            id: "video-curto",
            snippet: {
              channelId: "channel-2",
              channelTitle: "Canal curto",
              title: "Curto",
              publishedAt: "2026-08-10T12:00:00.000Z",
            },
            statistics: { viewCount: "999", likeCount: "1", commentCount: "1" },
            contentDetails: { duration: "PT1M" },
          },
        ],
      });
    }
    throw new Error(`Rota inesperada: ${parsed.pathname}`);
  };
  const response = await execute(realFixture, projectServices());
  assert.equal(response.status, "success");
  assert.equal(response.values.market_snapshot.length, 1);
  assert.equal(response.values.market_snapshot[0].video_id, "video-1");
  assert.equal(response.values.market_snapshot[0].duration_seconds, 372);
  assert.equal(response.values.market_snapshot[0].subscriber_count, 1000);
  assert.ok(response.values.market_snapshot[0].market_score >= 0);
  assert.equal(requests.filter((item) => item.pathname.endsWith("/search")).length, 2);
  assert.equal(requests.filter((item) => item.pathname.endsWith("/videos")).length, 2);
  assert.equal(requests.filter((item) => item.pathname.endsWith("/channels")).length, 1);
  assert.equal(requests.filter((item) => item.pathname.endsWith("/commentThreads")).length, 1);

  let quotaCalls = 0;
  globalThis.fetch = async (url) => {
    quotaCalls += 1;
    const key = new URL(url).searchParams.get("key");
    if (quotaCalls === 1) {
      assert.equal(key, "test-key-1");
      return json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);
    }
    assert.equal(key, "test-key-2");
    return json({ items: [] });
  };
  const limited = await execute(realFixture, services());
  assert.equal(limited.status, "success");
  assert.match(limited.logs.join("\n"), /quota_rotations=1/);

  const simulated = await execute(fixture, services([]));
  assert.equal(simulated.status, "success");
  assert.equal(simulated.values.market_snapshot.length, 0);
  assert.match(simulated.values.research_summary, /nenhuma consulta externa/i);

  console.log("norte-magnata-market-radar: ok");
} finally {
  globalThis.fetch = originalFetch;
}
