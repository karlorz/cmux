import { describe, expect, it } from "vitest";
import {
  TeamSchema,
  UserSchema,
  UserDeletedSchema,
  TeamDeletedSchema,
  TeamMembershipSchema,
  TeamPermissionSchema,
  StackWebhookPayloadSchema,
} from "./stack-webhook-schema";

describe("stack-webhook-schema", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";
  const validEmail = "user@example.com";

  describe("TeamSchema", () => {
    const validTeam = {
      id: validUuid,
      display_name: "My Team",
      profile_image_url: null,
      created_at_millis: Date.now(),
    };

    it("accepts valid team", () => {
      const result = TeamSchema.safeParse(validTeam);
      expect(result.success).toBe(true);
    });

    it("accepts team with all optional fields", () => {
      const result = TeamSchema.safeParse({
        ...validTeam,
        profile_image_url: "https://example.com/image.png",
        client_metadata: { key: "value" },
        client_read_only_metadata: { readonly: true },
        server_metadata: { server: "data" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects team with invalid UUID", () => {
      const result = TeamSchema.safeParse({
        ...validTeam,
        id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects team without display_name", () => {
      const { display_name, ...teamWithoutName } = validTeam;
      void display_name;
      const result = TeamSchema.safeParse(teamWithoutName);
      expect(result.success).toBe(false);
    });
  });

  describe("UserSchema", () => {
    const validUser = {
      id: validUuid,
      primary_email: validEmail,
      primary_email_verified: true,
      primary_email_auth_enabled: true,
      display_name: "Test User",
      selected_team: null,
      selected_team_id: null,
      profile_image_url: null,
      signed_up_at_millis: Date.now(),
      last_active_at_millis: Date.now(),
      has_password: true,
      otp_auth_enabled: false,
      passkey_auth_enabled: false,
      client_metadata: null,
      client_read_only_metadata: null,
      server_metadata: null,
      is_anonymous: false,
      oauth_providers: [],
    };

    it("accepts valid user", () => {
      const result = UserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it("accepts user with oauth providers", () => {
      const result = UserSchema.safeParse({
        ...validUser,
        oauth_providers: [
          { id: "github", account_id: "12345", email: "user@github.com" },
          { id: "google", account_id: "67890", email: null },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts user with selected team", () => {
      const result = UserSchema.safeParse({
        ...validUser,
        selected_team: {
          id: validUuid,
          display_name: "My Team",
          profile_image_url: null,
          created_at_millis: Date.now(),
        },
        selected_team_id: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it("accepts user with null primary email", () => {
      const result = UserSchema.safeParse({
        ...validUser,
        primary_email: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects user with invalid email", () => {
      const result = UserSchema.safeParse({
        ...validUser,
        primary_email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    it("rejects user without required boolean fields", () => {
      const { has_password, ...userWithoutPassword } = validUser;
      void has_password;
      const result = UserSchema.safeParse(userWithoutPassword);
      expect(result.success).toBe(false);
    });
  });

  describe("UserDeletedSchema", () => {
    it("accepts valid user deleted payload", () => {
      const result = UserDeletedSchema.safeParse({
        id: validUuid,
        teams: [{ id: validUuid }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts user with no teams", () => {
      const result = UserDeletedSchema.safeParse({
        id: validUuid,
        teams: [],
      });
      expect(result.success).toBe(true);
    });

    it("accepts user with multiple teams", () => {
      const result = UserDeletedSchema.safeParse({
        id: validUuid,
        teams: [
          { id: "550e8400-e29b-41d4-a716-446655440001" },
          { id: "550e8400-e29b-41d4-a716-446655440002" },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("TeamDeletedSchema", () => {
    it("accepts valid team deleted payload", () => {
      const result = TeamDeletedSchema.safeParse({
        id: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid UUID", () => {
      const result = TeamDeletedSchema.safeParse({
        id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("TeamMembershipSchema", () => {
    it("accepts valid team membership", () => {
      const result = TeamMembershipSchema.safeParse({
        team_id: validUuid,
        user_id: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it("rejects membership with missing team_id", () => {
      const result = TeamMembershipSchema.safeParse({
        user_id: validUuid,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("TeamPermissionSchema", () => {
    it("accepts system permission ID", () => {
      const result = TeamPermissionSchema.safeParse({
        id: "$update_team",
        user_id: validUuid,
        team_id: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it("accepts custom permission ID", () => {
      const result = TeamPermissionSchema.safeParse({
        id: "team_member",
        user_id: validUuid,
        team_id: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it("accepts permission ID with colon", () => {
      const result = TeamPermissionSchema.safeParse({
        id: "resource:read",
        user_id: validUuid,
        team_id: validUuid,
      });
      expect(result.success).toBe(true);
    });

    it("rejects permission ID with uppercase", () => {
      const result = TeamPermissionSchema.safeParse({
        id: "Team_Member",
        user_id: validUuid,
        team_id: validUuid,
      });
      expect(result.success).toBe(false);
    });

    it("rejects permission ID with spaces", () => {
      const result = TeamPermissionSchema.safeParse({
        id: "team member",
        user_id: validUuid,
        team_id: validUuid,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("StackWebhookPayloadSchema", () => {
    const validTeamData = {
      id: validUuid,
      display_name: "My Team",
      profile_image_url: null,
      created_at_millis: Date.now(),
    };

    const validUserData = {
      id: validUuid,
      primary_email: validEmail,
      primary_email_verified: true,
      primary_email_auth_enabled: true,
      display_name: "Test User",
      selected_team: null,
      selected_team_id: null,
      profile_image_url: null,
      signed_up_at_millis: Date.now(),
      last_active_at_millis: Date.now(),
      has_password: true,
      otp_auth_enabled: false,
      passkey_auth_enabled: false,
      client_metadata: null,
      client_read_only_metadata: null,
      server_metadata: null,
      is_anonymous: false,
      oauth_providers: [],
    };

    describe("user events", () => {
      it("accepts user.created", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "user.created",
          data: validUserData,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe("user.created");
        }
      });

      it("accepts user.updated", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "user.updated",
          data: validUserData,
        });
        expect(result.success).toBe(true);
      });

      it("accepts user.deleted", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "user.deleted",
          data: { id: validUuid, teams: [] },
        });
        expect(result.success).toBe(true);
      });
    });

    describe("team events", () => {
      it("accepts team.created", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team.created",
          data: validTeamData,
        });
        expect(result.success).toBe(true);
      });

      it("accepts team.updated", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team.updated",
          data: validTeamData,
        });
        expect(result.success).toBe(true);
      });

      it("accepts team.deleted", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team.deleted",
          data: { id: validUuid },
        });
        expect(result.success).toBe(true);
      });
    });

    describe("team_membership events", () => {
      it("accepts team_membership.created", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team_membership.created",
          data: { team_id: validUuid, user_id: validUuid },
        });
        expect(result.success).toBe(true);
      });

      it("accepts team_membership.deleted", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team_membership.deleted",
          data: { team_id: validUuid, user_id: validUuid },
        });
        expect(result.success).toBe(true);
      });
    });

    describe("team_permission events", () => {
      it("accepts team_permission.created", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team_permission.created",
          data: { id: "$admin", team_id: validUuid, user_id: validUuid },
        });
        expect(result.success).toBe(true);
      });

      it("accepts team_permission.deleted", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "team_permission.deleted",
          data: { id: "member", team_id: validUuid, user_id: validUuid },
        });
        expect(result.success).toBe(true);
      });
    });

    describe("invalid payloads", () => {
      it("rejects unknown event type", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "unknown.event",
          data: {},
        });
        expect(result.success).toBe(false);
      });

      it("rejects mismatched data for event type", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "user.created",
          data: { id: validUuid }, // Missing required user fields
        });
        expect(result.success).toBe(false);
      });

      it("rejects payload without type", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          data: validUserData,
        });
        expect(result.success).toBe(false);
      });

      it("rejects payload without data", () => {
        const result = StackWebhookPayloadSchema.safeParse({
          type: "user.created",
        });
        expect(result.success).toBe(false);
      });
    });
  });
});
