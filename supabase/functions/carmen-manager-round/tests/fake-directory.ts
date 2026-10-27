/** The people directory of the fake world: clients, assignments, staff, contacts. */
import type { PeopleDirectory } from "../recipients/directory.ts";
import type { World } from "./fake-world.ts";

/** A PeopleDirectory that answers from the world's clients, assignments, staff and contacts. */
export function fakeDirectory(w: World): PeopleDirectory {
  return {
    client: (_tenant, id) =>
      Promise.resolve(w.clients.find((c) => c.id === id) ?? null),
    campaigners: (_tenant, id) => Promise.resolve(w.assignments[id] ?? []),
    staff: () =>
      w.failOn === "staff"
        ? Promise.reject(new Error("db down"))
        : Promise.resolve(w.staff),
    names: (ids) => Promise.resolve(new Map(ids.map((id) => [id, `שם ${id}`]))),
    contacts: (_tenant, keys) =>
      Promise.resolve(
        new Map(
          keys.flatMap((key) => {
            const contact = w.contacts[key];
            return contact ? [[key, contact]] : [];
          }),
        ),
      ),
  };
}
