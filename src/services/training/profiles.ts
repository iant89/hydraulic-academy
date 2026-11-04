import { db } from '@/services/persistence/db';
import type { EquipmentProfile } from '@/equipment/shared/types';
import { BUILTIN_PROFILES } from '@/data/equipment/profiles';

/** Built-in (read-only) profiles plus user-created profiles in local storage. */
export const profilesRepo = {
  async all(): Promise<EquipmentProfile[]> {
    const user = await db.list<EquipmentProfile>('profiles');
    return [...BUILTIN_PROFILES, ...user.sort((a, b) => a.name.localeCompare(b.name))];
  },
  save: (p: EquipmentProfile) => db.put('profiles', p.id, { ...p, createdBy: 'user', updatedAt: new Date().toISOString() }),
  remove: (id: string) => db.delete('profiles', id),
  saveFile: (key: string, blob: Blob) => db.put('files', key, blob),
  getFile: (key: string) => db.get<Blob>('files', key),
};

/** A spec may only be "manufacturer-verified" if it references a manufacturer-verified document. */
export function specIssues(p: EquipmentProfile): string[] {
  const out: string[] = [];
  for (const [k, s] of Object.entries(p.specs)) {
    if (s.status !== 'manufacturer-verified') continue;
    const doc = p.documents.find((d) => d.id === s.documentId);
    if (!doc) out.push(`${k}: marked manufacturer-verified but no source document is linked.`);
    else if (doc.status !== 'manufacturer-verified') out.push(`${k}: source document "${doc.title}" is not itself manufacturer-verified.`);
    else if (!doc.revision || !doc.section || !doc.reference) out.push(`${k}: source document is missing revision, section/page or reference.`);
  }
  return out;
}
