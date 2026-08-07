import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gasSource = await readFile(
  new URL("../scripts/chatwork-daily-schedule.gs", import.meta.url),
  "utf8"
);

function loadGasWithMocks({ fetch, properties: propertyOverrides = {} }) {
  const properties = {
    FIREBASE_PROJECT_ID: "demo-project",
    ...propertyOverrides
  };
  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(key) {
          return properties[key] || "";
        }
      };
    }
  };
  const UrlFetchApp = { fetch };

  return new Function(
    "PropertiesService",
    "UrlFetchApp",
    `${gasSource}\nreturn { getFirebaseAccessContext_, getCompatibleOfficeIds_, fetchActiveUsers_, fetchMonthlySchedulesForOffice_ };`
  )(PropertiesService, UrlFetchApp);
}

test("Chatwork GAS parses and contains no copied production credentials", () => {
  assert.doesNotThrow(() => new Function(gasSource));
  assert.match(gasSource, /FIREBASE_API_KEY: "YOUR_FIREBASE_WEB_API_KEY"/);
  assert.match(gasSource, /CHATWORK_TOKEN: "YOUR_CHATWORK_API_TOKEN"/);
  assert.match(gasSource, /CHATWORK_ROOM_ID: "YOUR_CHATWORK_ROOM_ID"/);
  assert.match(gasSource, /if \(hasPlaceholder\) \{/);
});

test("Chatwork GAS reads only the office-scoped active-user cache", () => {
  const requestedUrls = [];
  const gas = loadGasWithMocks({
    fetch(url) {
      requestedUrls.push(url);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          fields: {
            officeId: { stringValue: "osaka_a" },
            groupId: { stringValue: "operator_a" },
            users: { arrayValue: { values: [] } }
          }
        })
      };
    }
  });

  assert.deepEqual(gas.fetchActiveUsers_("token", "osaka_a", "operator_a"), []);
  assert.equal(requestedUrls.length, 1);
  assert.match(requestedUrls[0], /\/system\/activeUsers_osaka_a$/);
  assert.doesNotMatch(requestedUrls[0], /\/system\/activeUsers$/);
});

test("legacy Chiba compatibility is not applied to other offices", () => {
  const gas = loadGasWithMocks({
    fetch() {
      throw new Error("fetch should not run");
    }
  });

  assert.deepEqual(gas.getCompatibleOfficeIds_("osaka_a"), ["osaka_a"]);
  assert.deepEqual(gas.getCompatibleOfficeIds_("enzine_chiba"), [
    "enzine_chiba",
    "engine_chiba"
  ]);
});

test("staff access context is fixed to the authenticated Firestore profile", () => {
  const gas = loadGasWithMocks({
    properties: {
      FIREBASE_API_KEY: "demo-api-key",
      FIREBASE_EMAIL: "staff@example.invalid",
      FIREBASE_PASSWORD: "demo-password"
    },
    fetch(url) {
      if (url.includes("accounts:signInWithPassword")) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            idToken: "demo-token",
            localId: "staff-uid"
          })
        };
      }

      assert.match(url, /\/users\/staff-uid$/);
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          fields: {
            active: { booleanValue: true },
            role: { stringValue: "staff" },
            accessScope: { stringValue: "office" },
            officeId: { stringValue: "osaka_a" },
            groupId: { stringValue: "operator_a" }
          }
        })
      };
    }
  });

  const context = gas.getFirebaseAccessContext_();
  assert.equal(context.uid, "staff-uid");
  assert.equal(context.officeId, "osaka_a");
  assert.equal(context.organizationId, "operator_a");
});

test("staff access context rejects a conflicting configured office", () => {
  const gas = loadGasWithMocks({
    properties: {
      FIREBASE_API_KEY: "demo-api-key",
      FIREBASE_EMAIL: "staff@example.invalid",
      FIREBASE_PASSWORD: "demo-password",
      OFFICE_ID: "another_office"
    },
    fetch(url) {
      if (url.includes("accounts:signInWithPassword")) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            idToken: "demo-token",
            localId: "staff-uid"
          })
        };
      }

      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          fields: {
            active: { booleanValue: true },
            role: { stringValue: "staff" },
            accessScope: { stringValue: "office" },
            officeId: { stringValue: "osaka_a" },
            groupId: { stringValue: "operator_a" }
          }
        })
      };
    }
  });

  assert.throws(
    () => gas.getFirebaseAccessContext_(),
    /OFFICE_ID がFirebaseログインアカウントの所属事業所と一致しません/
  );
});

test("monthly schedule query constrains organization, office, and month", () => {
  let queryPayload = null;
  const gas = loadGasWithMocks({
    fetch(url, options) {
      assert.match(url, /documents:runQuery$/);
      queryPayload = JSON.parse(options.payload);
      return {
        getResponseCode: () => 200,
        getContentText: () => "[]"
      };
    }
  });

  assert.deepEqual(
    gas.fetchMonthlySchedulesForOffice_(
      "token",
      "osaka_a",
      "operator_a",
      "2026-08"
    ),
    []
  );

  const filters = queryPayload.structuredQuery.where.compositeFilter.filters;
  assert.deepEqual(
    filters.map((filter) => filter.fieldFilter.field.fieldPath),
    ["groupId", "officeId", "month"]
  );
  assert.deepEqual(
    filters.map((filter) => filter.fieldFilter.value.stringValue),
    ["operator_a", "osaka_a", "2026-08"]
  );
});
