import Dexie from 'dexie';

export const db = new Dexie('EDEN_v3_Database');

// v1 – initial schema
db.version(1).stores({
  teacherProfile: 'id, serialNumber, fullName, schoolName, departmentId',
  students: '++id, lastName, firstName, sex, gradeSection, lrn, isEnriched, addedBySerial, departmentId, syncedAt',
  departments: 'id, name, createdBySerial, createdDate'
});

// v2 – added cloud_id index for Supabase real-time sync
db.version(2).stores({
  teacherProfile: 'id, serialNumber, fullName, schoolName, departmentId',
  students: '++id, cloud_id, lastName, firstName, sex, gradeSection, lrn, isEnriched, addedBySerial, departmentId, syncedAt',
  departments: 'id, name, createdBySerial, createdDate'
});

// Helper function to seed or get teacher profile
export async function getOrCreateTeacherProfile() {
  let profile = await db.teacherProfile.get('main');
  if (!profile) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const serial = `EDEN-T-2026-${randomHex}`;
    profile = {
      id: 'main',
      serialNumber: serial,
      fullName: 'Educator User',
      schoolName: 'Unassigned School Hub',
      departmentId: null,
      avatarBase64: null,
      sex: '',
      position: '',
      degree: '',
      major: '',
      minor: '',
      createdDate: new Date().toISOString()
    };
    await db.teacherProfile.put(profile);
  }
  return profile;
}

// Seed initial demo students if database is empty
export async function initDemoDataIfNeeded() {
  const count = await db.students.count();
  if (count === 0) {
    const teacher = await getOrCreateTeacherProfile();
    await db.students.bulkAdd([
      {
        lastName: 'Dela Cruz',
        firstName: 'Juan',
        sex: 'M',
        gradeSection: 'Grade 10 - Rizal',
        lrn: '109283746512',
        isEnriched: true,
        addedBySerial: teacher.serialNumber,
        departmentId: null,
        syncedAt: new Date().toISOString()
      },
      {
        lastName: 'Santos',
        firstName: 'Maria Clara',
        sex: 'F',
        gradeSection: 'Grade 10 - Rizal',
        lrn: '',
        isEnriched: false,
        addedBySerial: teacher.serialNumber,
        departmentId: null,
        syncedAt: null
      },
      {
        lastName: 'Reyes',
        firstName: 'Jose',
        sex: 'M',
        gradeSection: 'Grade 10 - Bonifacio',
        lrn: '109283746514',
        isEnriched: true,
        addedBySerial: teacher.serialNumber,
        departmentId: null,
        syncedAt: new Date().toISOString()
      }
    ]);
  }
}
