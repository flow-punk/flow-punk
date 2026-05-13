import type { DashboardModule } from "../types.js";
import { Icon } from "@flowpunk-indie/dashboard-ui";
import { PeopleList } from "./list.js";
import { PersonDetail } from "./detail.js";

/**
 * People module. Surfaces the contacts service `persons` collection.
 *
 * Naming note: the backend models the entity as `persons` (column,
 * route prefix, repo); only the dashboard label is "People". Hooks,
 * route paths, and query keys here follow the UI vocabulary; the
 * fetch URLs cross over to `/api/v1/persons/*`.
 *
 * Edition-agnostic per ADR-011 — no runtime edition branching. Managed
 * does not currently extend this module (no `people.detail.tabs` slot
 * in v1). Revisit when managed needs to add a tab.
 */
export const peopleModule: DashboardModule = {
  id: "people",
  nav: [
    {
      id: "workspace.people",
      label: "Workspace",
      items: [
        {
          id: "people",
          label: "People",
          to: "/people",
          icon: ({ className }) => (
            <Icon name="user" className={className} />
          ),
        },
      ],
    },
  ],
  routes: [
    { path: "/people", component: PeopleList },
    { path: "/people/$id", component: PersonDetail },
  ],
};

export { PeopleList } from "./list.js";
export { PersonDetail } from "./detail.js";
export {
  usePeople,
  usePerson,
  useUpdatePerson,
  useDeletePerson,
  PeopleError,
  PEOPLE_QUERY_KEY,
  personQueryKey,
  type Person,
  type UpdatePersonInput,
  type UsePeopleOptions,
  type PersonsListResponse,
} from "./hooks.js";
