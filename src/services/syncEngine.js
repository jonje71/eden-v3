/**
 * EDEN v3 — Real-time Sync Engine
 * ---------------------------------
 * Bridges local IndexedDB (Dexie) with cloud Supabase Realtime.
 *
 * Flow:
 *  1. On login:  Pull latest cloud data → overwrite/merge local IndexedDB.
 *  2. On write:  Any local mutation also fires an async cloud mutation.
 *  3. On change: Supabase WebSocket broadcasts DB changes to all devices
 *               → the handler merges updates into local IndexedDB → triggers UI refresh.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { db } from '../db/edenDb.js';

let activeChannel = null;
let onChangeCallback = null; // Will be set to `renderApp` in main.js

// ─────────────────────────────────────────────
// PUBLIC: Register the UI refresh callback
// ─────────────────────────────────────────────
export function setOnChangeCallback(fn) {
  onChangeCallback = fn;
}

// Make the authenticated account's cloud profile the source of truth for its
// serial number. A fresh browser has its own IndexedDB profile and therefore
// its own generated serial until this step runs.
export async function resolveCloudProfile(localProfile) {
  if (!isSupabaseConfigured || !localProfile) return localProfile;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localProfile;

    const { data: cloudProfile, error: fetchError } = await supabase
      .from('teachers')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!cloudProfile) {
      await pushProfileUpdate(localProfile);
      return localProfile;
    }

    const resolvedProfile = {
      ...localProfile,
      serialNumber: cloudProfile.serial_number || localProfile.serialNumber,
      fullName: cloudProfile.full_name || localProfile.fullName,
      schoolName: cloudProfile.school_name || localProfile.schoolName,
      sex: cloudProfile.sex || localProfile.sex,
      position: cloudProfile.position || localProfile.position,
      degree: cloudProfile.degree || localProfile.degree,
      major: cloudProfile.major || localProfile.major,
      minor: cloudProfile.minor || localProfile.minor,
      avatarBase64: cloudProfile.avatar_base64 || localProfile.avatarBase64,
    };

    await db.teacherProfile.put(resolvedProfile);
    await pushProfileUpdate(resolvedProfile);
    return resolvedProfile;
  } catch (err) {
    console.warn('[EDEN Sync] Profile resolution error:', err.message);
    return localProfile;
  }
}

// Sync any local offline students (created before login) up to cloud
export async function syncUnsyncedLocalStudents(teacherSerial) {
  if (!isSupabaseConfigured) return;
  try {
    const unSynced = await db.students
      .filter(s => !s.cloud_id)
      .toArray();

    for (const student of unSynced) {
      const cloudRecord = await pushStudentAdd({
        ...student,
        addedBySerial: teacherSerial
      });
      if (cloudRecord) {
        await db.students.update(student.id, { 
          cloud_id: String(cloudRecord.id),
          addedBySerial: teacherSerial 
        });
      }
    }
  } catch (err) {
    console.warn('[EDEN Sync] Unsynced students push error:', err.message);
  }
}

// ─────────────────────────────────────────────
// STEP 1: Initial data hydration from cloud
// Pull all cloud records and store into local IndexedDB
// ─────────────────────────────────────────────
export async function hydrateFromCloud(teacherSerial) {
  if (!isSupabaseConfigured) return;

  try {
    // 1. Push any local offline students created before login to cloud
    await syncUnsyncedLocalStudents(teacherSerial);

    // 2. Pull all cloud students belonging to this teacher
    const { data: cloudStudents, error: studErr } = await supabase
      .from('students')
      .select('*')
      .eq('added_by_serial', teacherSerial);

    if (!studErr && cloudStudents && cloudStudents.length > 0) {
      // Map snake_case cloud fields → camelCase local fields
      const mapped = cloudStudents.map(mapStudentFromCloud);
      // Bulk put (upsert by cloud_id) into local DB
      await upsertStudentsLocally(mapped);
    }

    // Pull teacher's own profile
    const { data: cloudProfile, error: profErr } = await supabase
      .from('teachers')
      .select('*')
      .eq('serial_number', teacherSerial)
      .maybeSingle();

    if (!profErr && cloudProfile) {
      const localProfile = await db.teacherProfile.get('main');
      if (localProfile) {
        // Merge cloud data into local profile (cloud is source of truth for SF7 fields)
        await db.teacherProfile.put({
          ...localProfile,
          serialNumber: cloudProfile.serial_number || localProfile.serialNumber,
          fullName: cloudProfile.full_name || localProfile.fullName,
          schoolName: cloudProfile.school_name || localProfile.schoolName,
          sex: cloudProfile.sex || localProfile.sex,
          position: cloudProfile.position || localProfile.position,
          degree: cloudProfile.degree || localProfile.degree,
          major: cloudProfile.major || localProfile.major,
          minor: cloudProfile.minor || localProfile.minor,
          avatarBase64: cloudProfile.avatar_base64 || localProfile.avatarBase64,
        });
      }
    }

    // Pull departments
    const { data: cloudDepts, error: deptErr } = await supabase
      .from('departments')
      .select('*');

    if (!deptErr && cloudDepts && cloudDepts.length > 0) {
      const mappedDepts = cloudDepts.map(d => ({
        id: d.id,
        name: d.name,
        createdBySerial: d.created_by_serial,
        pairedSerials: d.paired_serials || [],
        createdDate: d.created_at
      }));
      await db.departments.bulkPut(mappedDepts);
    }

    console.log('[EDEN Sync] Initial hydration complete.');
  } catch (err) {
    console.warn('[EDEN Sync] Hydration error:', err.message);
  }
}

// ─────────────────────────────────────────────
// STEP 3: Start real-time WebSocket subscription
// ─────────────────────────────────────────────
export function startRealtimeSync(teacherSerial) {
  if (!isSupabaseConfigured) return;

  // Clean up any existing channel before creating a new one
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  activeChannel = supabase
    .channel(`eden-sync-${teacherSerial}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'students', filter: `added_by_serial=eq.${teacherSerial}` },
      async (payload) => {
        console.log('[EDEN Sync] Remote INSERT received:', payload.new);
        const mapped = mapStudentFromCloud(payload.new);
        // Only add if it doesn't already exist locally (avoid duplicate from self-push)
        const existing = await db.students.where('cloud_id').equals(mapped.cloud_id).first();
        if (!existing) {
          await db.students.add(mapped);
          if (onChangeCallback) onChangeCallback();
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'students', filter: `added_by_serial=eq.${teacherSerial}` },
      async (payload) => {
        console.log('[EDEN Sync] Remote UPDATE received:', payload.new);
        const mapped = mapStudentFromCloud(payload.new);
        const existing = await db.students.where('cloud_id').equals(mapped.cloud_id).first();
        if (existing) {
          await db.students.update(existing.id, mapped);
        } else {
          await db.students.add(mapped);
        }
        if (onChangeCallback) onChangeCallback();
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'students', filter: `added_by_serial=eq.${teacherSerial}` },
      async (payload) => {
        console.log('[EDEN Sync] Remote DELETE received:', payload.old);
        const cloudId = payload.old.id;
        const existing = await db.students.where('cloud_id').equals(String(cloudId)).first();
        if (existing) {
          await db.students.delete(existing.id);
          if (onChangeCallback) onChangeCallback();
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'teachers' },
      async (payload) => {
        console.log('[EDEN Sync] Teacher profile change received.');
        if (payload.new) {
          const localProfile = await db.teacherProfile.get('main');
          if (localProfile) {
            await db.teacherProfile.put({
              ...localProfile,
              fullName: payload.new.full_name || localProfile.fullName,
              schoolName: payload.new.school_name || localProfile.schoolName,
              sex: payload.new.sex || localProfile.sex,
              position: payload.new.position || localProfile.position,
              degree: payload.new.degree || localProfile.degree,
              major: payload.new.major || localProfile.major,
              minor: payload.new.minor || localProfile.minor,
              avatarBase64: payload.new.avatar_base64 || localProfile.avatarBase64,
            });
            if (onChangeCallback) onChangeCallback();
          }
        }
      }
    )
    .subscribe((status) => {
      console.log(`[EDEN Sync] WebSocket status: ${status}`);
    });
}

// ─────────────────────────────────────────────
// Stop sync (on logout)
// ─────────────────────────────────────────────
export function stopRealtimeSync() {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
    console.log('[EDEN Sync] WebSocket channel removed.');
  }
}

// ─────────────────────────────────────────────
// STEP 2: Upstream mutations — push local changes to cloud
// ─────────────────────────────────────────────

export async function pushStudentAdd(student) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from('students').insert({
      last_name: student.lastName,
      first_name: student.firstName,
      sex: student.sex,
      grade_section: student.gradeSection,
      lrn: student.lrn || null,
      is_enriched: student.isEnriched || false,
      added_by_serial: student.addedBySerial,
      department_id: student.departmentId || null,
    }).select().single();

    if (error) {
      console.warn('[EDEN Sync] Push student add error:', error.message);
      return null;
    }
    return data; // Return cloud record so we can store the cloud ID locally
  } catch (err) {
    console.warn('[EDEN Sync] Push student add exception:', err.message);
    return null;
  }
}

export async function pushStudentDelete(cloudId) {
  if (!isSupabaseConfigured || !cloudId) return;
  try {
    const { error } = await supabase.from('students').delete().eq('id', cloudId);
    if (error) console.warn('[EDEN Sync] Push student delete error:', error.message);
  } catch (err) {
    console.warn('[EDEN Sync] Push student delete exception:', err.message);
  }
}

export async function pushProfileUpdate(profile) {
  if (!isSupabaseConfigured) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const payload = {
      id: user.id,
      serial_number: profile.serialNumber,
      full_name: profile.fullName || 'Educator User',
      school_name: profile.schoolName || 'Unassigned School Hub',
      sex: profile.sex || '',
      position: profile.position || '',
      degree: profile.degree || '',
      major: profile.major || '',
      minor: profile.minor || '',
      avatar_base64: profile.avatarBase64 || null,
    };

    const { error } = await supabase.from('teachers').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('[EDEN Sync] Upsert profile error:', error.message);
      // Fallback: try update, if fails then insert
      const { error: updateErr } = await supabase.from('teachers').update(payload).eq('id', user.id);
      if (updateErr) {
        const { error: insertErr } = await supabase.from('teachers').insert(payload);
        if (insertErr) {
          console.warn('[EDEN Sync] Insert profile error:', insertErr.message);
        }
      }
    } else {
      console.log('[EDEN Sync] Teacher profile successfully pushed to cloud.');
    }
  } catch (err) {
    console.warn('[EDEN Sync] Push profile update exception:', err.message);
  }
}

export async function pushDepartmentAdd(dept) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from('departments').insert({
      name: dept.name,
      created_by_serial: dept.createdBySerial,
      paired_serials: dept.pairedSerials || [],
    }).select().single();

    if (error) {
      console.warn('[EDEN Sync] Push department add error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[EDEN Sync] Push department add exception:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Utility: Map cloud snake_case → local camelCase
// ─────────────────────────────────────────────
function mapStudentFromCloud(s) {
  return {
    cloud_id: String(s.id),
    lastName: s.last_name,
    firstName: s.first_name,
    sex: s.sex,
    gradeSection: s.grade_section,
    lrn: s.lrn || '',
    isEnriched: s.is_enriched || false,
    addedBySerial: s.added_by_serial,
    departmentId: s.department_id || null,
    syncedAt: s.updated_at || s.created_at
  };
}

async function upsertStudentsLocally(students) {
  await db.transaction('rw', db.students, async () => {
    for (const student of students) {
      const existing = await db.students.where('cloud_id').equals(student.cloud_id).first();
      if (existing) {
        await db.students.update(existing.id, student);
      } else {
        await db.students.add(student);
      }
    }
  });
}
