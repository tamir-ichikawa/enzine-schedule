const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const DEFAULT_OFFICE_ID = "engine_chiba";
const DEFAULT_GROUP_ID = "enzine";
const ACTIVE_USERS_DOC_ID = "activeUsers";
const VALID_ROLES = new Set(["user", "staff", "admin"]);

function cleanText(value, fallback = "", maxLength = 120) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();

  if (!text) {
    return fallback;
  }

  return text.slice(0, maxLength);
}

function cleanEmail(value) {
  const email = cleanText(value, "", 254).toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  return email;
}

function cleanPassword(value) {
  if (typeof value !== "string" || value.length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }

  if (value.length > 128) {
    throw new HttpsError("invalid-argument", "Password is too long.");
  }

  return value;
}

function cleanRole(value) {
  const role = cleanText(value, "user", 20);

  if (!VALID_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "Role must be user, staff, or admin.");
  }

  return role;
}

async function assertCallerIsAdmin(request) {
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Login is required.");
  }

  const callerSnap = await db.collection("users").doc(callerUid).get();

  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile was not found.");
  }

  const callerData = callerSnap.data() || {};

  if (callerData.active !== true || callerData.role !== "admin") {
    throw new HttpsError("permission-denied", "Only active admins can create users.");
  }

  return {
    uid: callerUid,
    name: callerData.name || request.auth.token?.email || "",
    email: callerData.email || request.auth.token?.email || "",
    officeId: callerData.officeId || DEFAULT_OFFICE_ID,
    groupId: callerData.groupId || DEFAULT_GROUP_ID
  };
}

function normalizeActiveUser(docSnap, currentOfficeId, defaultGroupId) {
  const data = docSnap.data() || {};

  if (data.active !== true || data.role !== "user") {
    return null;
  }

  const officeId = data.officeId || currentOfficeId;

  if (officeId !== currentOfficeId) {
    return null;
  }

  return {
    id: docSnap.id,
    uid: docSnap.id,
    name: data.name || data.email || "名前未設定",
    email: data.email || "",
    officeId,
    groupId: data.groupId || defaultGroupId,
    active: true
  };
}

async function rebuildActiveUsers({ officeId, groupId, updatedByUid, updatedByName }) {
  const usersSnap = await db.collection("users").get();
  const users = [];

  usersSnap.forEach((docSnap) => {
    const user = normalizeActiveUser(docSnap, officeId, groupId);

    if (user) {
      users.push(user);
    }
  });

  users.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));

  await db.collection("system").doc(ACTIVE_USERS_DOC_ID).set({
    officeId,
    groupId,
    users,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid,
    updatedByName
  }, { merge: true });

  return users.length;
}

exports.createAuthUserAndProfile = onCall({
  region: "asia-northeast1",
  invoker: "public",
  maxInstances: 2,
  timeoutSeconds: 30
}, async (request) => {
  const caller = await assertCallerIsAdmin(request);
  const data = request.data || {};
  const email = cleanEmail(data.email);
  const password = cleanPassword(data.password);
  const name = cleanText(data.name, "", 80);
  const role = cleanRole(data.role);
  const active = data.active !== false;
  const officeId = cleanText(data.officeId, caller.officeId, 80);
  const groupId = cleanText(data.groupId, caller.groupId, 80);
  const updatedByName = caller.name || caller.email || "";

  if (!name) {
    throw new HttpsError("invalid-argument", "Name is required.");
  }

  let userRecord = null;

  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: active !== true,
      emailVerified: false
    });
  } catch (error) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email address is already registered.");
    }

    logger.error("Auth user creation failed", error);
    throw new HttpsError("internal", "Failed to create Auth user.");
  }

  const userDocRef = db.collection("users").doc(userRecord.uid);

  try {
    await userDocRef.set({
      name,
      email,
      role,
      active,
      officeId,
      groupId,
      authCreatedByAdmin: true,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: caller.uid,
      createdByName: updatedByName,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: caller.uid,
      updatedByName
    });

    await rebuildActiveUsers({
      officeId,
      groupId,
      updatedByUid: caller.uid,
      updatedByName
    });
  } catch (error) {
    logger.error("Firestore user profile creation failed", {
      uid: userRecord.uid,
      error
    });

    try {
      await userDocRef.delete();
    } catch (deleteProfileError) {
      logger.error("Failed to roll back Firestore profile", {
        uid: userRecord.uid,
        error: deleteProfileError
      });
    }

    try {
      await auth.deleteUser(userRecord.uid);
    } catch (deleteAuthError) {
      logger.error("Failed to roll back Auth user", {
        uid: userRecord.uid,
        error: deleteAuthError
      });
    }

    throw new HttpsError("internal", "Auth user was created, but profile creation failed.");
  }

  return {
    uid: userRecord.uid,
    email,
    created: true
  };
});
