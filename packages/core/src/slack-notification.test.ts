import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSlackNotificationConfig,
  SLACK_NOTIFICATION_CONFIG_VERSION,
} from "./slack-notification.ts";

describe("normalizeSlackNotificationConfig", () => {
  test("normalizes webhook delivery config", () => {
    const config = normalizeSlackNotificationConfig({
      enabled: true,
      transport: {
        kind: "webhook",
        webhook_url_env: "CUSTOM_SLACK_WEBHOOK",
      },
      default_channel: "#ops-alerts",
      dm_routing: {
        enabled: true,
        resolver_fields: ["slack_user_id", "email"],
      },
      severity_routing: {
        minimum_level: "level_2",
        level_modes: {
          level_1: "suppressed",
          level_2: "immediate",
          level_3: "urgent",
        },
      },
      digest: {
        enabled: true,
        default_channel: "#ops-digest",
        cadence_minutes: 60,
        max_entries: 10,
        group_by: ["interruption_level", "age"],
      },
    });

    assert.equal(config.version, SLACK_NOTIFICATION_CONFIG_VERSION);
    assert.equal(config.transport.kind, "webhook");
    assert.equal(config.transport.webhook_url_env, "CUSTOM_SLACK_WEBHOOK");
    assert.equal(config.default_channel, "#ops-alerts");
    assert.deepEqual(config.dm_routing.resolver_fields, ["slack_user_id", "email"]);
    assert.equal(config.severity_routing.minimum_level, "level_2");
    assert.equal(config.severity_routing.level_modes.level_1, "suppressed");
    assert.equal(config.digest.default_channel, "#ops-digest");
    assert.deepEqual(config.digest.group_by, ["interruption_level", "age"]);
  });

  test("normalizes bot-token delivery config with defaults", () => {
    const config = normalizeSlackNotificationConfig({
      transport: {
        kind: "bot-token",
        bot_token_env: "DEVORY_SLACK_BOT_TOKEN",
      },
      dm_routing: {
        user_map: {
          "run-owner": "U12345",
          ignored: "",
        },
      },
    });

    assert.equal(config.transport.kind, "bot-token");
    assert.equal(config.transport.bot_token_env, "DEVORY_SLACK_BOT_TOKEN");
    assert.equal(config.default_channel, "#devory-alerts");
    assert.equal(config.dm_routing.enabled, false);
    assert.deepEqual(config.dm_routing.user_map, {
      "run-owner": "U12345",
    });
    assert.equal(config.severity_routing.level_modes.level_1, "digest");
    assert.equal(config.severity_routing.level_modes.level_2, "immediate");
    assert.equal(config.severity_routing.level_modes.level_3, "urgent");
    assert.equal(config.digest.cadence_minutes, 30);
  });

  test("rejects non-object config", () => {
    assert.throws(
      () => normalizeSlackNotificationConfig(null),
      /slack notification config must be a JSON object/
    );
  });
});
