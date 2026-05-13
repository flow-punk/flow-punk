import type { DashboardModule } from "../types.js";
import { Icon } from "@flowpunk-indie/dashboard-ui";
import { ApiKeysList } from "./list.js";

/**
 * API keys module. Lists, creates (one-time secret display per
 * ADR-012), rotates, and revokes the caller's `fpk_*` credentials via
 * auth-core's `/api/v1/auth/keys/*` surface.
 *
 * The same module is consumed by both editions — the active-key cap is
 * enforced server-side by the auth-core wrapper (`maxActiveKeys: 1` on
 * indie, `5` on managed), so no managed replacement is needed.
 */
export const apiKeysModule: DashboardModule = {
  id: "api-keys",
  nav: [
    {
      id: "workspace.api-keys",
      label: "Workspace",
      items: [
        {
          id: "api-keys",
          label: "API Keys",
          to: "/api-keys",
          icon: ({ className }) => <Icon name="link" className={className} />,
        },
      ],
    },
  ],
  routes: [
    {
      path: "/api-keys",
      component: ApiKeysList,
    },
  ],
};

export { ApiKeysList } from "./list.js";
export { CreateApiKeyDialog } from "./create-dialog.js";
export type { CreateApiKeyDialogProps } from "./create-dialog.js";
export {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useRotateApiKey,
  ApiKeysError,
  KEYS_QUERY_KEY,
  type ApiKey,
  type ApiKeyWithSecret,
  type CreateApiKeyInput,
} from "./hooks.js";
