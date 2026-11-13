import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestApp, resetDatabase, seedAdminUser, makeRequest } from "./helpers.js";
import { dbUtils } from "../lib/db.js";
import { _resetRateLimits } from "../routes/auth.js";

describe("invite links", () => {
  let app;
  let adminCookie;

  beforeAll(async () => {
    resetDatabase();
    app = createTestApp();
    ({ cookie: adminCookie } = await seedAdminUser(app));
  });

  beforeEach(() => _resetRateLimits());

  test("setup reports no setup needed once a user exists", async () => {
    const res = await makeRequest(app, "GET", "/api/auth/setup");
    expect((await res.json()).needsSetup).toBe(false);
  });

  test("registration without invite returns 403", async () => {
    const res = await makeRequest(app, "POST", "/api/auth/register", {
      body: { username: "intruder", password: "intruderpass123" },
    });
    expect(res.status).toBe(403);
  });

  test("registration with bogus invite returns 403", async () => {
    const res = await makeRequest(app, "POST", "/api/auth/register", {
      body: { username: "intruder", password: "intruderpass123", inviteToken: "nope" },
    });
    expect(res.status).toBe(403);
  });

  test("non-admin cannot create invites", async () => {
    const res = await makeRequest(app, "POST", "/api/admin/invites");
    expect(res.status).toBe(401);
  });

  test("admin creates invite, invitee registers as member, invite is single-use", async () => {
    const create = await makeRequest(app, "POST", "/api/admin/invites", { cookie: adminCookie });
    expect(create.status).toBe(201);
    const { invite } = await create.json();
    expect(invite.token).toBeTruthy();

    const check = await makeRequest(app, "GET", `/api/auth/invites/${invite.token}`);
    expect(check.status).toBe(200);
    expect((await check.json()).valid).toBe(true);

    const registration = {
      username: "invitee",
      password: "inviteepass123",
      inviteToken: invite.token,
    };
    for (const email of [undefined, "invalid"]) {
      const rejected = await makeRequest(app, "POST", "/api/auth/register", {
        body: { ...registration, email },
      });
      expect(rejected.status).toBe(400);
    }
    const register = await makeRequest(app, "POST", "/api/auth/register", {
      body: { ...registration, email: " invitee@example.com " },
    });
    expect(register.status).toBe(201);
    const data = await register.json();
    expect(data.user.role).toBe("member");
    expect(data.user.email).toBe("invitee@example.com");
    expect(register.headers.get("set-cookie")).toContain("session=");

    const memberCookie = register.headers.get("set-cookie").split(";")[0];
    const change = await makeRequest(app, "PUT", "/api/auth/email", {
      cookie: memberCookie,
      body: { id: 1, email: "updated@example.com" },
    });
    expect(change.status).toBe(200);
    expect((await change.json()).user.email).toBe("updated@example.com");

    const session = await makeRequest(app, "GET", "/api/auth/session", { cookie: memberCookie });
    expect((await session.json()).user.email).toBe("updated@example.com");
    const adminSession = await makeRequest(app, "GET", "/api/auth/session", {
      cookie: adminCookie,
    });
    expect((await adminSession.json()).user.email).toBeNull();

    const unauthorized = await makeRequest(app, "PUT", "/api/auth/email", {
      body: { email: "unauthorized@example.com" },
    });
    expect(unauthorized.status).toBe(401);

    const reuse = await makeRequest(app, "POST", "/api/auth/register", {
      body: { username: "invitee2", password: "inviteepass123", inviteToken: invite.token },
    });
    expect(reuse.status).toBe(403);

    const recheck = await makeRequest(app, "GET", `/api/auth/invites/${invite.token}`);
    expect(recheck.status).toBe(404);

    const list = await makeRequest(app, "GET", "/api/admin/invites", { cookie: adminCookie });
    const { invites } = await list.json();
    const used = invites.find((i) => i.id === invite.id);
    expect(used.used_by_username).toBe("invitee");
    expect(used.created_by_username).toBe("admin");
  });

  test("revoked invite cannot be used", async () => {
    const create = await makeRequest(app, "POST", "/api/admin/invites", { cookie: adminCookie });
    const { invite } = await create.json();

    const revoke = await makeRequest(app, "DELETE", `/api/admin/invites/${invite.id}`, {
      cookie: adminCookie,
    });
    expect(revoke.status).toBe(200);

    const register = await makeRequest(app, "POST", "/api/auth/register", {
      body: { username: "revoked", password: "revokedpass123", inviteToken: invite.token },
    });
    expect(register.status).toBe(403);
  });

  test("expired invite cannot be used", async () => {
    const { token } = dbUtils.createInvite(null, -1000);
    const register = await makeRequest(app, "POST", "/api/auth/register", {
      body: { username: "late", password: "latepass12345", inviteToken: token },
    });
    expect(register.status).toBe(403);
  });
});
