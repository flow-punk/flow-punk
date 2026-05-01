/**
 * Tenant user roles per SYSTEM.md §"Domain Model" and ADR-013.
 *
 * Indie deploys carry exactly one active `owner` (per ADR-011 §"Indie
 * multi-user foundation"); managed tenants may have multiple `owner` rows.
 * Both editions accept multiple `admin`/`member`/`readonly` rows.
 */

export const ROLE_VALUES = ['owner', 'admin', 'member', 'readonly'] as const;
export type Role = (typeof ROLE_VALUES)[number];

const ROLE_VALUE_SET = new Set<string>(ROLE_VALUES);
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLE_VALUE_SET.has(value);
}

export interface RolePrivileges {
  /** Manage other users in the tenant (CRUD on users; promote/demote). */
  manageUsers: boolean;
  /** Mint API keys for the actor's own user. */
  mintApiKeys: boolean;
  /** Soft-delete the tenant; rotate platform-level OAuth client. */
  manageTenantSettings: boolean;
  /** Read REST resources (persons, accounts, deals, etc.). */
  read: boolean;
  /** Write REST resources. */
  write: boolean;
}

export const ROLE_PRIVILEGES: Record<Role, RolePrivileges> = {
  owner: {
    manageUsers: true,
    mintApiKeys: true,
    manageTenantSettings: true,
    read: true,
    write: true,
  },
  admin: {
    manageUsers: true,
    mintApiKeys: true,
    manageTenantSettings: false,
    read: true,
    write: true,
  },
  member: {
    manageUsers: false,
    mintApiKeys: false,
    manageTenantSettings: false,
    read: true,
    write: true,
  },
  readonly: {
    manageUsers: false,
    mintApiKeys: false,
    manageTenantSettings: false,
    read: true,
    write: false,
  },
};

/** Admin-equivalent rights: any path that today reads `users.is_admin === true`. */
export function hasAdminRights(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManageUsers(role: Role): boolean {
  return ROLE_PRIVILEGES[role].manageUsers;
}

export function canMintApiKeys(role: Role): boolean {
  return ROLE_PRIVILEGES[role].mintApiKeys;
}

export function canManageTenantSettings(role: Role): boolean {
  return ROLE_PRIVILEGES[role].manageTenantSettings;
}

export function canRead(role: Role): boolean {
  return ROLE_PRIVILEGES[role].read;
}

export function canWrite(role: Role): boolean {
  return ROLE_PRIVILEGES[role].write;
}
