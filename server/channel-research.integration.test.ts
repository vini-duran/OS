import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createEmptyMethods } from "../src/lib/domain";

test(
  "preserves research snapshots, approval and channel cleanup without invoking a provider",
  { timeout: 30_000 },
  async () => {
    const probe = net.createServer().listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = (probe.address() as net.AddressInfo).port;
    probe.close();
    await once(probe, "close");
    const data = mkdtempSync(path.join(os.tmpdir(), "contentflow-research-"));
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, CONTENTFLOW_DATA_DIR: data, CONTENTFLOW_API_PORT: String(port) },
      stdio: "ignore",
    });
    const url = `http://127.0.0.1:${port}`;
    const api = (route: string, method = "GET", body?: unknown) =>
      fetch(url + route, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw new Error("Isolated API exited");
        try {
          if ((await api("/api/health")).ok) {
            ready = true;
            break;
          }
        } catch {
          /* starting */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready);
      const now = new Date().toISOString();
      const research = {
        pluginId: "missing.fixture",
        capabilityId: "collect",
        cadence: "manual",
        configuration: {},
        recordsKey: "records",
        summaryKey: "summary",
        minimumBriefRecords: 2,
      };
      const channel = {
        id: "research-fixture",
        createdAt: now,
        name: "Fixture",
        methods: createEmptyMethods(),
        research,
      };
      assert.equal((await api("/api/channels", "POST", channel)).status, 201);
      assert.equal((await api("/api/channels/research-fixture/research/runs", "POST")).status, 403);
      const db = new Database(path.join(data, "contentflow.sqlite"));
      const run = {
        id: "run-fixture",
        channelId: channel.id,
        status: "completed",
        startedAt: now,
        updatedAt: now,
        planSnapshot: research,
        records: [
          { title: "A", view_count: 4 },
          { title: "B", view_count: 2 },
        ],
      };
      try {
        db.prepare("INSERT INTO channel_research_runs VALUES (?, ?, ?, ?, ?, ?)").run(
          run.id,
          channel.id,
          run.status,
          JSON.stringify(run),
          now,
          now,
        );
      } finally {
        db.close();
      }
      const listed = await (await api("/api/channels/research-fixture/research/runs")).json();
      assert.equal(listed.runs[0].id, run.id);
      const created = await api("/api/channels/research-fixture/research/briefs", "POST");
      assert.equal(created.status, 201);
      const { brief } = await created.json();
      assert.equal(brief.sourceRecordCount, 2);
      assert.equal(
        (await api(`/api/channels/research-fixture/research/briefs/${brief.id}/approve`, "POST"))
          .status,
        200,
      );
      assert.equal(
        (await api(`/api/channels/research-fixture/research/briefs/${brief.id}/approve`, "POST"))
          .status,
        409,
      );
      assert.equal((await api("/api/channels/research-fixture", "DELETE")).status, 204);
      const after = new Database(path.join(data, "contentflow.sqlite"));
      try {
        for (const table of [
          "channel_research_runs",
          "channel_research_briefs",
          "library_items",
          "library_collections",
          "projects",
        ]) {
          assert.equal(
            (after.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
            0,
            table,
          );
        }
      } finally {
        after.close();
      }
    } finally {
      const exited = child.exitCode === null ? once(child, "exit") : Promise.resolve();
      child.kill();
      await exited;
      rmSync(data, { recursive: true, force: true });
    }
  },
);
