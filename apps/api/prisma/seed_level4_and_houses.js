const { PrismaClient, UserRole } = require('@prisma/client');
const argon2 = require('@node-rs/argon2');
require('dotenv').config();

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  memoryCost: 32768,
  timeCost: 2,
  parallelism: 1,
};

async function seed() {
  console.log('--- Setting up Level 4 Admin & Households ---');

  const passwordHash = await argon2.hash('Password@1234', ARGON2_OPTIONS);

  // Target team and GN division
  const gnId = '92e061d6-e016-4e20-879f-eea34f49478c';
  const teamId = '3ce28de0-9b8c-4ea9-a3b8-d0a7fda7f38d';
  const dsId = 'e88b37cd-6b90-4cf3-a3d3-9c33f2a4b4c2';
  const districtId = 'c5996479-631d-4b64-bf1f-a502f1b435c3';

  // 1. Update/Ensure GRS1000000001 (Team Member)
  const member = await prisma.profile.upsert({
    where: { userCode: 'GRS1000000001' },
    update: {
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      isActive: true,
      role: UserRole.team_member,
      teamId,
      gnId,
      dsId,
      districtId,
    },
    create: {
      userCode: 'GRS1000000001',
      fullName: 'Kamal Perera',
      email: 'agent.test@grs.gov.lk',
      phoneE164: '+94771234567',
      passwordHash,
      mustChangePassword: false,
      role: UserRole.team_member,
      teamId,
      gnId,
      dsId,
      districtId,
      isActive: true,
    },
  });
  console.log('✓ Team Member GRS1000000001 configured:', member.id);

  // 2. Create/Update Level 4 Admin (CDC Secretary / Team Leader)
  const level4 = await prisma.profile.upsert({
    where: { userCode: 'GRS4000000001' },
    update: {
      fullName: 'Nimal Jayawardena',
      role: UserRole.cdc_secretary,
      email: 'leader.test@grs.gov.lk',
      phoneE164: '+94772345678',
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      isActive: true,
      teamId,
      gnId,
      dsId,
      districtId,
    },
    create: {
      userCode: 'GRS4000000001',
      fullName: 'Nimal Jayawardena',
      role: UserRole.cdc_secretary,
      email: 'leader.test@grs.gov.lk',
      phoneE164: '+94772345678',
      passwordHash,
      mustChangePassword: false,
      teamId,
      gnId,
      dsId,
      districtId,
      isActive: true,
    },
  });
  console.log('✓ Level 4 Admin GRS4000000001 configured:', level4.id);

  // 3. Set Level 4 Admin as Team Leader
  await prisma.team.update({
    where: { id: teamId },
    data: {
      leaderId: level4.id,
    },
  });
  console.log('✓ Team 3ce28de0-9b8c-4ea9-a3b8-d0a7fda7f38d leader updated to:', level4.id);

  // 4. Set Level 4 Admin as CDC Secretary in GN Division
  await prisma.gnDivision.update({
    where: { id: gnId },
    data: {
      cdcSecretaryId: level4.id,
      secretaryName: 'Nimal Jayawardena',
      secretaryEmail: 'leader.test@grs.gov.lk',
      secretaryContact: '+94772345678',
    },
  });
  console.log('✓ GN Division 92e061d6-e016-4e20-879f-eea34f49478c secretary updated');

  // 5. Seed 10 realistic households assigned to this team
  const sampleHouses = [
    {
      serialNo: 1001,
      houseNo: '101',
      houseNoNorm: '101',
      houseLeaderName: 'Sunil Perera',
      address: 'No. 101, Temple Road, Trigger GN',
      villageName: 'Temple Junction',
      isEpf: true,
      isEtf: true,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 2,
      targetMale: 1,
    },
    {
      serialNo: 1002,
      houseNo: '102/A',
      houseNoNorm: '102/a',
      houseLeaderName: 'Anula Ratnayake',
      address: 'No. 102/A, Temple Road, Trigger GN',
      villageName: 'Temple Junction',
      isEpf: false,
      isEtf: false,
      isAswesuma: true,
      isSamurdhi: true,
      targetFemale: 1,
      targetMale: 2,
    },
    {
      serialNo: 1003,
      houseNo: '103',
      houseNoNorm: '103',
      houseLeaderName: 'Kusum Wijesinghe',
      address: 'No. 103, School Lane, Trigger GN',
      villageName: 'School View',
      isEpf: true,
      isEtf: false,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 2,
      targetMale: 2,
    },
    {
      serialNo: 1004,
      houseNo: '104/B',
      houseNoNorm: '104/b',
      houseLeaderName: 'Dayananda Silva',
      address: 'No. 104/B, School Lane, Trigger GN',
      villageName: 'School View',
      isEpf: true,
      isEtf: true,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 1,
      targetMale: 1,
    },
    {
      serialNo: 1005,
      houseNo: '105',
      houseNoNorm: '105',
      houseLeaderName: 'Nirmala Fernando',
      address: 'No. 105, Hospital Road, Trigger GN',
      villageName: 'Hospital Junction',
      isEpf: false,
      isEtf: false,
      isAswesuma: true,
      isSamurdhi: false,
      targetFemale: 2,
      targetMale: 1,
    },
    {
      serialNo: 1006,
      houseNo: '106/1',
      houseNoNorm: '106/1',
      houseLeaderName: 'Mohamed Rizwan',
      address: 'No. 106/1, Hospital Road, Trigger GN',
      villageName: 'Hospital Junction',
      isEpf: true,
      isEtf: true,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 1,
      targetMale: 3,
    },
    {
      serialNo: 1007,
      houseNo: '107',
      houseNoNorm: '107',
      houseLeaderName: 'Sivalingam Thangarajah',
      address: 'No. 107, Lake Crescent, Trigger GN',
      villageName: 'Lake District',
      isEpf: false,
      isEtf: false,
      isAswesuma: false,
      isSamurdhi: true,
      targetFemale: 2,
      targetMale: 2,
    },
    {
      serialNo: 1008,
      houseNo: '108/C',
      houseNoNorm: '108/c',
      houseLeaderName: 'Priyantha Jayasuriya',
      address: 'No. 108/C, Lake Crescent, Trigger GN',
      villageName: 'Lake District',
      isEpf: true,
      isEtf: true,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 1,
      targetMale: 2,
    },
    {
      serialNo: 1009,
      houseNo: '109',
      houseNoNorm: '109',
      houseLeaderName: 'Malini Gunawardena',
      address: 'No. 109, Post Office Road, Trigger GN',
      villageName: 'Central Trigger',
      isEpf: true,
      isEtf: false,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 3,
      targetMale: 1,
    },
    {
      serialNo: 1010,
      houseNo: '110',
      houseNoNorm: '110',
      houseLeaderName: 'Asanka Samarasinghe',
      address: 'No. 110, Post Office Road, Trigger GN',
      villageName: 'Central Trigger',
      isEpf: true,
      isEtf: true,
      isAswesuma: false,
      isSamurdhi: false,
      targetFemale: 1,
      targetMale: 1,
    },
  ];

  for (const h of sampleHouses) {
    await prisma.household.upsert({
      where: {
        gnId_serialNo: {
          gnId,
          serialNo: h.serialNo,
        },
      },
      update: {
        houseNo: h.houseNo,
        houseNoNorm: h.houseNoNorm,
        houseLeaderName: h.houseLeaderName,
        address: h.address,
        villageName: h.villageName,
        teamId,
        districtId,
        dsId,
        isEpf: h.isEpf,
        isEtf: h.isEtf,
        isAswesuma: h.isAswesuma,
        isSamurdhi: h.isSamurdhi,
        targetFemale: h.targetFemale,
        targetMale: h.targetMale,
        langSinhala: true,
        langEnglish: true,
        createdBy: level4.id,
        deletedAt: null,
      },
      create: {
        gnId,
        teamId,
        districtId,
        dsId,
        serialNo: h.serialNo,
        houseNo: h.houseNo,
        houseNoNorm: h.houseNoNorm,
        houseLeaderName: h.houseLeaderName,
        address: h.address,
        villageName: h.villageName,
        isEpf: h.isEpf,
        isEtf: h.isEtf,
        isAswesuma: h.isAswesuma,
        isSamurdhi: h.isSamurdhi,
        targetFemale: h.targetFemale,
        targetMale: h.targetMale,
        langSinhala: true,
        langEnglish: true,
        createdBy: level4.id,
      },
    });
  }
  console.log(`✓ Seeded ${sampleHouses.length} households assigned to team ${teamId}`);

  // Also assign the 2 existing households in this GN to this team so all GN households are in scope
  await prisma.household.updateMany({
    where: { gnId },
    data: { teamId },
  });
  console.log('✓ All households in GN assigned to team');
}

seed()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
